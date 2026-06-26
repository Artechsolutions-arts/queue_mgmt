"""
Notification worker.

Reads `queue.events` via a Redis consumer group so messages survive
worker restarts. Successful sends are XACK'd; failures stay on the
pending list until manual replay or the group's idle-claim retry.

Patient experience is step-by-step (turn-by-turn), never a journey dump:
  token.created / token.bundle.created -> check-in confirmation
  token.called                         -> "it's your turn, go to X"
  token.completed                      -> "that step is done, next coming"
  visit.completed                      -> "all done, take care"
  token.redirected                     -> "faster route found"

Production-mode contract:
* Twilio creds present => live mode.
* Missing creds + NOTIFICATION_MOCK_ENABLED=true => mock mode (dev only).
* Missing creds + NOTIFICATION_MOCK_ENABLED=false => process refuses to boot.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import socket

import redis
from dotenv import load_dotenv

from twilio_client import NotificationClient, mask_phone

load_dotenv()

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger("NotificationService")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
STREAM = os.getenv("NOTIFICATION_STREAM", "queue.events")
GROUP = os.getenv("NOTIFICATION_GROUP", "notification-workers")
CONSUMER = os.getenv("NOTIFICATION_CONSUMER", socket.gethostname())
MAX_RETRIES = int(os.getenv("NOTIFY_MAX_RETRIES", "2"))
BATCH = int(os.getenv("NOTIFICATION_BATCH", "10"))
BLOCK_MS = int(os.getenv("NOTIFICATION_BLOCK_MS", "5000"))
# Display name used to sign off patient messages.
FACILITY_NAME = os.getenv("FACILITY_NAME", "St. Aurelia Medical")
# How to use SMS alongside WhatsApp (the premium primary channel):
#   fallback (default) — SMS only if the WhatsApp send can't be accepted
#   always             — send both every time (noisy; duplicate notifications)
#   off                — WhatsApp only, never SMS
SMS_MODE = os.getenv("NOTIFICATION_SMS_MODE", "fallback").strip().lower()


class NotificationWorker:
    def __init__(self):
        try:
            self.r = redis.from_url(REDIS_URL)
            self.r.ping()
            logger.info("Connected to Redis at %s", REDIS_URL)
        except redis.RedisError as exc:
            logger.error("Failed to connect to Redis: %s", exc)
            self.r = None
        self.client = NotificationClient()
        self._stop = asyncio.Event()
        self._ensure_group()

    # ----- consumer group bootstrap ----------------------------------------

    def _ensure_group(self) -> None:
        if self.r is None:
            return
        try:
            # MKSTREAM creates an empty stream if there isn't one yet;
            # `$` starts the group at the tail (only future messages).
            self.r.xgroup_create(name=STREAM, groupname=GROUP, id='$', mkstream=True)
            logger.info("Created consumer group %s on %s", GROUP, STREAM)
        except redis.ResponseError as exc:
            if 'BUSYGROUP' in str(exc):
                logger.info("Consumer group %s already exists on %s", GROUP, STREAM)
            else:
                raise

    def request_stop(self) -> None:
        self._stop.set()

    # ----- shared sender ----------------------------------------------------

    async def _send(self, phone: str, masked: str, body: str, label: str) -> None:
        """Deliver one patient notification. Raises RuntimeError for retriable
        failures so the run loop leaves the Redis message un-acked for retry.
        Permanent failures (invalid number, STOP opt-out) are logged and acked —
        retrying them wastes API calls and will always fail."""
        loop = asyncio.get_running_loop()

        wa = await loop.run_in_executor(
            None, lambda: self.client.send_whatsapp(to_number=phone, message=body)
        )
        if wa.ok:
            logger.info("%s WhatsApp accepted (queued) to=%s sid=%s", label, masked, wa.sid)
        elif wa.retriable:
            logger.warning("%s WhatsApp retriable failure to=%s err=%s — leaving in PEL",
                           label, masked, wa.error)
            raise RuntimeError(f"WhatsApp retriable failure: {wa.error}")
        else:
            logger.error("%s WhatsApp permanent failure to=%s err=%s", label, masked, wa.error)
            # Permanent (invalid number, STOP, bad auth) — no retry value; fall through to ack.

        if SMS_MODE == "off":
            return
        if SMS_MODE != "always" and wa.ok:
            # WhatsApp accepted and SMS is fallback-only — skip the duplicate.
            return

        sms_body = body.replace("*", "")
        result = None
        for attempt in range(MAX_RETRIES + 1):
            result = await loop.run_in_executor(
                None, lambda: self.client.send_sms(phone, sms_body)
            )
            if result.ok:
                logger.info("%s SMS accepted (queued) to=%s sid=%s", label, masked, result.sid)
                return
            if not result.retriable:
                logger.error(
                    "%s SMS short-circuited (non-retriable) to=%s code=%s err=%s",
                    label, masked, result.error_code, result.error,
                )
                return
            if attempt < MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
        # SMS exhausted retries — raise so the message stays in PEL for manual replay.
        logger.error("%s SMS exhausted retries to=%s err=%s", label, masked, result.error if result else "?")
        raise RuntimeError(f"SMS exhausted retries: {result.error if result else 'unknown'}")

    @staticmethod
    def _skip(data: dict, what: str) -> bool:
        """Common guards: no phone => log+skip; simulated => bypass live sends."""
        if not data.get('phone_number'):
            logger.error("%s event missing phone — skipping", what)
            return True
        if data.get('is_simulated') == 'true':
            logger.info("[SIMULATED] %s bypassed token=%s", what, data.get('token_number', '?'))
            return True
        return False

    # ----- check-in confirmation (single) -----------------------------------

    async def deliver(self, data: dict) -> None:
        if self._skip(data, "Registration"):
            return
        phone = data['phone_number']
        token = data.get('token_number', 'your number')
        name = data.get('patient_name', 'there')
        counter_name = data.get('counter_name', '')
        counter_location = data.get('counter_location', '')
        try:
            queue_depth = int(data.get('counter_queue_depth', 0))
        except (ValueError, TypeError):
            queue_depth = 0

        body = (
            f"✅ You're checked in, {name}\n\n"
            f"Your token number is *{token}*\n\n"
        )

        if counter_name:
            body += f"📍 The queue is shorter at *{counter_name}* — please proceed there first."
            if counter_location:
                body += f"\n{counter_location}"
            if queue_depth == 0:
                body += "\n_(No one ahead of you right now!)_"
            elif queue_depth == 1:
                body += "\n_(Only 1 person ahead of you)_"
            else:
                body += f"\n_({queue_depth} people ahead of you)_"
            body += "\n\n"

        body += "No need to stand in line — take a seat.\nI'll message you the moment it's your turn."

        await self._send(phone, mask_phone(phone), body, f"Registration token={token}")

    # ----- check-in confirmation (multi-service) ----------------------------

    async def deliver_bundle(self, data: dict) -> None:
        """Check-in confirmation for a register-multi visit. We confirm and
        reassure — we do NOT list the whole journey. Each stop is guided
        step-by-step as counters call the patient."""
        if self._skip(data, "Registration"):
            return
        phone = data['phone_number']
        name = data.get('patient_name', 'there')
        try:
            tokens = json.loads(data.get('tokens_json', '[]'))
        except json.JSONDecodeError as exc:
            logger.error("Bundle tokens_json malformed: %s", exc)
            return
        if not tokens:
            logger.info("Bundle event with no tokens — skipping")
            return

        masked = mask_phone(phone)
        # tokens are already sorted by queue_depth ASC from views.py — first = shortest queue
        first = tokens[0]
        counter = first.get('counter_name', '')
        location = first.get('counter_location', '')
        try:
            depth = int(first.get('queue_depth', 0))
        except (ValueError, TypeError):
            depth = 0

        if len(tokens) == 1:
            body = (
                f"✅ You're checked in, {name}\n\n"
                f"Your token number is *{first['number']}*\n\n"
            )
        else:
            body = (
                f"✅ You're checked in, {name}\n\n"
                f"You have *{len(tokens)} steps* today.\n\n"
            )

        # Always tell the patient which counter to head to first and how busy it is
        if counter:
            body += f"📍 Head to *{counter}* first — it has the shortest queue right now."
            if location:
                body += f"\n{location}"
            if depth == 0:
                body += "\n_(No one ahead of you — go now!)_"
            elif depth == 1:
                body += "\n_(Only 1 person ahead of you)_"
            else:
                body += f"\n_({depth} people ahead of you)_"
            body += "\n\n"

        if len(tokens) == 1:
            body += "I'll message you the moment it's your turn."
        else:
            body += "I'll guide you to each stop one at a time.\nJust take a seat and wait for my message."

        await self._send(phone, masked, body, f"Registration tokens={len(tokens)}")

    # ----- counter ready (it's your turn) -----------------------------------

    async def deliver_called(self, data: dict) -> None:
        if self._skip(data, "Counter-ready"):
            return
        phone = data['phone_number']
        name = data.get('patient_name', 'there')
        counter = data.get('counter_name', 'your counter')
        location = data.get('counter_location', '')
        body = (
            f"🔔 It's your turn, {name}\n\n"
            f"Please go to *{counter}* now."
            + (f"\n{location}" if location else "")
        )
        await self._send(phone, mask_phone(phone), body, f"Counter-ready token={data.get('token_number','?')}")

    # ----- step complete (more to go) ---------------------------------------

    async def deliver_test_done(self, data: dict) -> None:
        if self._skip(data, "Step-complete"):
            return
        phone = data['phone_number']
        name = data.get('patient_name', 'there')
        service = data.get('service_type_name') or 'That step'
        body = (
            f"✅ {service} done\n\n"
            f"That's one step complete, {name}.\n\n"
            "Relax for a moment —\n"
            "I'll send your next stop shortly."
        )
        await self._send(phone, mask_phone(phone), body, f"Step-done token={data.get('token_number','?')}")

    # ----- visit complete (all done) ----------------------------------------

    async def deliver_visit_complete(self, data: dict) -> None:
        if self._skip(data, "Visit-complete"):
            return
        phone = data['phone_number']
        name = data.get('patient_name', 'there')
        body = (
            f"💙 All done, {name}\n\n"
            "Your visit is complete.\n"
            "Take care and get well soon.\n\n"
            f"— {FACILITY_NAME}"
        )
        await self._send(phone, mask_phone(phone), body, "Visit-complete")

    # ----- AI reroute (load-balance) ----------------------------------------

    async def deliver_redirect(self, data: dict) -> None:
        """Tell a patient the assistant moved them to a less-busy counter."""
        if self._skip(data, "Reroute"):
            return
        phone = data['phone_number']
        name = data.get('patient_name', 'there')
        old_counter = data.get('old_counter_name', 'that counter')
        new_counter = data.get('new_counter_name', 'a quicker counter')
        location = data.get('new_counter_location', '')
        body = (
            f"✨ Faster route found, {name}\n\n"
            f"{old_counter} is busy right now,\n"
            "so I've moved you to a quicker one.\n\n"
            f"Now heading to\n*{new_counter}*"
            + (f"\n{location}" if location else "")
        )
        await self._send(phone, mask_phone(phone), body, f"Reroute token={data.get('token_number','?')}")

    # ----- main read loop ---------------------------------------------------

    async def run(self) -> None:
        if self.r is None:
            logger.error("Redis unavailable — exiting worker.")
            return

        logger.info(
            "Worker started group=%s consumer=%s stream=%s batch=%d",
            GROUP, CONSUMER, STREAM, BATCH,
        )
        loop = asyncio.get_running_loop()

        handlers = {
            'token.created': self.deliver,
            'token.bundle.created': self.deliver_bundle,
            'token.called': self.deliver_called,
            'token.completed': self.deliver_test_done,
            'visit.completed': self.deliver_visit_complete,
            'token.redirected': self.deliver_redirect,
        }

        while not self._stop.is_set():
            try:
                # '>' = deliver only messages no other consumer has seen yet.
                streams = await loop.run_in_executor(
                    None,
                    lambda: self.r.xreadgroup(
                        GROUP, CONSUMER, {STREAM: '>'},
                        count=BATCH, block=BLOCK_MS,
                    ),
                )
                if not streams:
                    continue
                for _stream, messages in streams:
                    for message_id, raw in messages:
                        decoded = {k.decode(): v.decode() for k, v in raw.items()}
                        handler = handlers.get(decoded.get('type'))
                        if handler is not None:
                            try:
                                await handler(decoded)
                            except Exception as exc:
                                logger.exception("Delivery handler crashed: %s", exc)
                                # Leave the message un-acked for a retry/replay.
                                continue
                        # ack on success (or non-target event) so the PEL stays small.
                        try:
                            self.r.xack(STREAM, GROUP, message_id)
                        except redis.RedisError as exc:
                            logger.warning("xack failed id=%s err=%s", message_id, exc)
            except redis.RedisError as exc:
                logger.warning("Redis error in worker loop: %s", exc)
                await asyncio.sleep(1)

        logger.info("Worker shutting down (consumer=%s)", CONSUMER)


# ---------------------------------------------------------------------------- main


async def _amain() -> None:
    worker = NotificationWorker()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, worker.request_stop)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(_amain())
