"""
Notification worker.

Reads `queue.events` via a Redis consumer group so messages survive
worker restarts. Successful sends are XACK'd; failures stay on the
pending list until manual replay or the group's idle-claim retry.

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
WHATSAPP_CONTENT_SID = os.getenv("TWILIO_WHATSAPP_CONTENT_SID", "").strip()
# Template for the multi-token (register-multi) bundle. Required to reach a
# patient outside the 24h customer-care window on a production WhatsApp sender,
# since every new registration is a first contact. When unset, the bundle path
# falls back to a free-form message (works in the sandbox / inside 24h only).
WHATSAPP_BUNDLE_CONTENT_SID = os.getenv("TWILIO_WHATSAPP_BUNDLE_CONTENT_SID", "").strip()
# Approx minutes per patient at a counter — used to translate queue depth into
# an "estimated wait" figure in the bundle message. Tune via env.
SERVICE_MINUTES_PER_PATIENT = int(os.getenv("SERVICE_MINUTES_PER_PATIENT", "5"))


def _wait_label(depth: int) -> str:
    """Render a queue depth as 'no wait', '5 min', '15 min' for patient-facing copy."""
    if depth <= 0:
        return "no wait — counter is empty"
    mins = depth * SERVICE_MINUTES_PER_PATIENT
    return f"{depth} ahead, ~{mins} min wait"


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

    # ----- send-with-retry --------------------------------------------------

    async def deliver(self, data: dict) -> None:
        token = data.get('token_number', 'N/A')
        phone = data.get('phone_number', '')
        masked = mask_phone(phone)
        is_simulated = data.get('is_simulated') == 'true'

        if not phone:
            logger.error("No phone number on event token=%s", token)
            return

        if is_simulated:
            logger.info("[SIMULATED] Bypassed live notifications for token=%s phone=%s (Simulated registration)", token, masked)
            return

        body = (
            f"Hi {data.get('patient_name', 'Patient')}, your token is {token}. "
            f"Estimated wait: {data.get('estimated_wait', '15')} min. "
            f"Fastest counter: {data.get('counter_id', '1')}. "
            f"Directions: {data.get('directions', 'Proceed to the main counter.')}."
        )

        loop = asyncio.get_running_loop()

        async def run_whatsapp():
            if WHATSAPP_CONTENT_SID:
                import json
                eta = data.get('estimated_wait', data.get('eta_minutes', '15'))
                eta_str = f"{eta} min" if not str(eta).endswith("min") else str(eta)
                service_name = data.get('service_type_name', 'Test')
                
                if WHATSAPP_CONTENT_SID == "HXb5b62575e6e4ff6129ad7c8efe1f983e":
                    content_vars = json.dumps({
                        "1": service_name,
                        "2": f"{eta_str} (Token: {token})"
                    })
                else:
                    directions_str = data.get('directions', 'Please wait for your turn.')
                    content_vars = json.dumps({
                        "1": service_name,
                        "2": token,
                        "3": eta_str,
                        "4": directions_str
                    })
                logger.info("WhatsApp attempt to=%s token=%s content_sid=%s", masked, token, WHATSAPP_CONTENT_SID)
                wa_result = await loop.run_in_executor(
                    None,
                    lambda: self.client.send_whatsapp(
                        to_number=phone,
                        content_sid=WHATSAPP_CONTENT_SID,
                        content_variables=content_vars
                    )
                )
                if wa_result.ok:
                    # ok == Twilio accepted/queued the message, NOT confirmed delivery.
                    # True delivery (or failure, e.g. 63015) arrives async via the
                    # TWILIO_STATUS_CALLBACK_URL webhook — don't claim "delivered" here.
                    logger.info("WhatsApp template accepted by Twilio (queued) to=%s token=%s sid=%s", masked, token, wa_result.sid)
                else:
                    logger.error("WhatsApp template failed to=%s token=%s err=%s", masked, token, wa_result.error)
            else:
                logger.info("WhatsApp free-form attempt to=%s token=%s", masked, token)
                wa_result = await loop.run_in_executor(
                    None,
                    lambda: self.client.send_whatsapp(to_number=phone, message=body)
                )
                if wa_result.ok:
                    logger.info("WhatsApp free-form accepted by Twilio (queued) to=%s token=%s sid=%s", masked, token, wa_result.sid)
                else:
                    logger.error("WhatsApp free-form failed to=%s token=%s err=%s", masked, token, wa_result.error)

        async def run_sms():
            for attempt in range(MAX_RETRIES + 1):
                logger.info("SMS attempt %d to=%s token=%s", attempt + 1, masked, token)
                result = await loop.run_in_executor(
                    None,
                    lambda: self.client.send_sms(phone, body)
                )
                if result.ok:
                    logger.info("SMS accepted by Twilio (queued) to=%s token=%s sid=%s", masked, token, result.sid)
                    return
                if not result.retriable:
                    logger.error(
                        "SMS short-circuited (non-retriable) to=%s token=%s code=%s err=%s",
                        masked, token, result.error_code, result.error,
                    )
                    return
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(2 ** attempt)
            logger.error("SMS exhausted to=%s token=%s err=%s", masked, token, result.error)

        await asyncio.gather(run_whatsapp(), run_sms())

    # ----- bundle (multi-token) delivery ------------------------------------

    async def deliver_bundle(self, data: dict) -> None:
        """Single combined SMS + WhatsApp summarising every token issued in
        one register-multi call. Replaces the N spammy per-token sends."""
        phone = data.get('phone_number', '')
        masked = mask_phone(phone)
        is_simulated = data.get('is_simulated') == 'true'
        patient_name = data.get('patient_name', 'Patient')

        if not phone:
            logger.error("Bundle event has no phone number — skipping")
            return

        try:
            tokens = json.loads(data.get('tokens_json', '[]'))
        except json.JSONDecodeError as exc:
            logger.error("Bundle event tokens_json malformed: %s", exc)
            return

        if not tokens:
            logger.info("Bundle event with no tokens — skipping")
            return

        if is_simulated:
            logger.info(
                "[SIMULATED] Bundle bypassed for phone=%s tokens=%d",
                masked, len(tokens),
            )
            return

        # Sort tokens by active queue depth ascending (shortest wait first)
        sorted_tokens = sorted(tokens, key=lambda x: int(x.get('queue_depth', 0)))

        # Compose a single readable body covering all tokens in recommended sequence.
        if len(sorted_tokens) > 1:
            lines = [f"Hi {patient_name}, here's the fastest order for your visits today:"]
            for index, t in enumerate(sorted_tokens, 1):
                loc = f" ({t['counter_location']})" if t.get('counter_location') else ""
                wait = _wait_label(int(t.get('queue_depth', 0)))
                lines.append(
                    f"{index}. {t['service_name']} (Token: {t['number']}) → {t['counter_name']}{loc} — {wait}"
                )
            # Highlight the wait-saving if first stop is meaningfully shorter than last.
            first_depth = int(sorted_tokens[0].get('queue_depth', 0))
            last_depth = int(sorted_tokens[-1].get('queue_depth', 0))
            if last_depth - first_depth >= 2:
                saved_min = (last_depth - first_depth) * SERVICE_MINUTES_PER_PATIENT
                lines.append(
                    f"Tip: starting at {sorted_tokens[0]['counter_name']} first saves you about "
                    f"{saved_min} min — do the quick stops while {sorted_tokens[-1]['counter_name']} queue moves."
                )
            lines.append("Visit in this order. Each counter calls you when ready.")
        else:
            t = sorted_tokens[0]
            loc = f" ({t['counter_location']})" if t.get('counter_location') else ""
            wait = _wait_label(int(t.get('queue_depth', 0)))
            lines = [
                f"Hi {patient_name}, your token for {t['service_name']} is {t['number']}.",
                f"Please proceed to {t['counter_name']}{loc} — {wait}."
            ]
        body = "\n".join(lines)

        loop = asyncio.get_running_loop()

        async def run_whatsapp():
            if WHATSAPP_BUNDLE_CONTENT_SID:
                # Template path. WhatsApp rejects newlines/tabs in template
                # parameters, so every variable is a single line. The approved
                # template body should reference these four variables:
                #   {{1}} patient name
                #   {{2}} number of tokens issued (e.g. "3")
                #   {{3}} recommended first stop
                #   {{4}} all stops on one line
                first = sorted_tokens[0]
                first_loc = f" ({first['counter_location']})" if first.get('counter_location') else ""
                first_stop = f"{first['service_name']} (Token {first['number']}) at {first['counter_name']}{first_loc}"
                all_stops = " | ".join(
                    f"{t['service_name']} {t['number']} → {t['counter_name']}"
                    for t in sorted_tokens
                )
                content_vars = json.dumps({
                    "1": patient_name,
                    "2": str(len(sorted_tokens)),
                    "3": first_stop,
                    "4": all_stops,
                })
                logger.info(
                    "Bundle WhatsApp template attempt to=%s tokens=%d content_sid=%s",
                    masked, len(tokens), WHATSAPP_BUNDLE_CONTENT_SID,
                )
                wa_result = await loop.run_in_executor(
                    None,
                    lambda: self.client.send_whatsapp(
                        to_number=phone,
                        content_sid=WHATSAPP_BUNDLE_CONTENT_SID,
                        content_variables=content_vars,
                    ),
                )
            else:
                logger.info("Bundle WhatsApp free-form attempt to=%s tokens=%d", masked, len(tokens))
                wa_result = await loop.run_in_executor(
                    None,
                    lambda: self.client.send_whatsapp(to_number=phone, message=body)
                )
            if wa_result.ok:
                logger.info(
                    "Bundle WhatsApp accepted by Twilio (queued) to=%s tokens=%d sid=%s",
                    masked, len(tokens), wa_result.sid,
                )
            else:
                logger.error(
                    "Bundle WhatsApp failed to=%s tokens=%d err=%s",
                    masked, len(tokens), wa_result.error,
                )

        async def run_sms():
            for attempt in range(MAX_RETRIES + 1):
                logger.info("Bundle SMS attempt %d to=%s tokens=%d", attempt + 1, masked, len(tokens))
                result = await loop.run_in_executor(
                    None,
                    lambda: self.client.send_sms(phone, body)
                )
                if result.ok:
                    logger.info(
                        "Bundle SMS accepted by Twilio (queued) to=%s tokens=%d sid=%s",
                        masked, len(tokens), result.sid,
                    )
                    return
                if not result.retriable:
                    logger.error(
                        "Bundle SMS short-circuited (non-retriable) to=%s tokens=%d code=%s err=%s",
                        masked, len(tokens), result.error_code, result.error,
                    )
                    return
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(2 ** attempt)
        await asyncio.gather(run_whatsapp(), run_sms())

    # ----- redirect (load-balance) notification ----------------------------

    async def deliver_redirect(self, data: dict) -> None:
        """Tell a patient their token was moved to a less-busy counter."""
        phone = data.get('phone_number', '')
        masked = mask_phone(phone)
        if not phone:
            logger.error("Redirect event missing phone — skipping")
            return
        if data.get('is_simulated') == 'true':
            logger.info("[SIMULATED] Redirect bypass token=%s", data.get('token_number', '?'))
            return

        token_number = data.get('token_number', '?')
        old_counter = data.get('old_counter_name', 'previous counter')
        new_counter = data.get('new_counter_name', 'a different counter')
        location = data.get('new_counter_location', '')
        service = data.get('service_type_name', '')

        body = (
            f"Good news! Your token {token_number}"
            f"{' (' + service + ')' if service else ''}"
            f" has been moved from {old_counter} to {new_counter}"
            f"{' — ' + location if location else ''}."
            " Please head there instead — the queue is shorter."
        )

        loop = asyncio.get_running_loop()
        logger.info("Redirect WhatsApp attempt to=%s token=%s", masked, token_number)
        wa_result = await loop.run_in_executor(None, lambda: self.client.send_whatsapp(to_number=phone, message=body))
        if wa_result.ok:
            logger.info("Redirect WhatsApp accepted by Twilio (queued) to=%s token=%s sid=%s", masked, token_number, wa_result.sid)
        else:
            logger.error("Redirect WhatsApp failed to=%s token=%s err=%s", masked, token_number, wa_result.error)

        for attempt in range(MAX_RETRIES + 1):
            logger.info("Redirect SMS attempt %d to=%s token=%s", attempt + 1, masked, token_number)
            result = await loop.run_in_executor(None, lambda: self.client.send_sms(phone, body))
            if result.ok:
                logger.info("Redirect SMS accepted by Twilio (queued) to=%s token=%s sid=%s", masked, token_number, result.sid)
                return
            if not result.retriable:
                logger.error("Redirect SMS short-circuited to=%s token=%s code=%s err=%s", masked, token_number, result.error_code, result.error)
                return
            if attempt < MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
        logger.error("Redirect SMS exhausted to=%s token=%s err=%s", masked, token_number, result.error)


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
                        event_type = decoded.get('type')
                        try:
                            if event_type == 'token.created':
                                await self.deliver(decoded)
                            elif event_type == 'token.bundle.created':
                                await self.deliver_bundle(decoded)
                            elif event_type == 'token.redirected':
                                await self.deliver_redirect(decoded)
                        except Exception as exc:
                            logger.exception("Delivery handler crashed: %s", exc)
                            # Leave the message un-acked so a retry/replay can pick it up.
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
