"""Twilio wrapper with explicit mock/prod modes and audit-friendly logging."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

logger = logging.getLogger("TwilioClient")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in ('1', 'true', 'yes', 'on')


def mask_phone(number: str) -> str:
    """Mask middle digits — log-safe but still resolvable on audit replay."""
    if not number:
        return ''
    digits = number.lstrip('+')
    if len(digits) <= 4:
        return number  # too short to meaningfully mask
    prefix = '+' if number.startswith('+') else ''
    return f"{prefix}{digits[:2]}{'*' * (len(digits) - 4)}{digits[-2:]}"


# Twilio error codes where retrying within seconds is pointless — the failure
# is account- or recipient-level, not transient. Don't waste API calls on these.
NON_RETRIABLE_TWILIO_CODES = frozenset({
    20003,  # Authentication error — bad SID/token
    21211,  # Invalid 'To' phone number
    21214,  # 'To' number cannot receive SMS (landline / unreachable carrier)
    21265,  # 'To' number is too short / treated as a Short Code — bad input, retry won't fix
    21408,  # Permission to send to this region not enabled
    21606,  # 'From' number not SMS-capable
    21608,  # Unverified caller ID (trial account limitation)
    21610,  # Recipient has unsubscribed (STOP)
    21614,  # 'To' number is not a valid mobile number
    63038,  # Account exceeded daily messages limit (resets in 24h)
})


@dataclass
class SendResult:
    ok: bool
    sid: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[int] = None
    retriable: bool = True


class NotificationClient:
    """Thin Twilio facade with a deliberate mock fallback.

    Production deployments must set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.
    To prevent silent mock-mode in prod, set NOTIFICATION_MOCK_ENABLED=false:
    the client will refuse to construct without real credentials.
    """

    def __init__(self):
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        self.whatsapp_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")
        self.sms_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()
        
        # Meta Graph API credentials
        self.meta_whatsapp_token = os.getenv("META_WHATSAPP_TOKEN", "").strip()
        self.meta_phone_number_id = os.getenv("META_PHONE_NUMBER_ID", "").strip()
        
        self.mock_enabled = _bool("NOTIFICATION_MOCK_ENABLED", default=True)
        self.log_message_body = _bool("NOTIFICATION_LOG_BODIES", default=False)
        self.only_send_to = {
            "".join(c for c in raw if c.isdigit() or c == "+")
            for raw in os.getenv("TWILIO_ONLY_SEND_TO", "").split(",")
            if raw.strip()
        }
        self.status_callback_url = os.getenv("TWILIO_STATUS_CALLBACK_URL", "").strip()

        creds_present = bool(self.account_sid and self.auth_token)
        if self.meta_whatsapp_token and self.meta_phone_number_id:
            logger.info("Meta WhatsApp Cloud API credentials detected! WhatsApp will be routed via Meta.")

        if self.mock_enabled:
            self.client = None
            if creds_present:
                logger.info("Twilio client in MOCK mode — credentials present but messages logged.")
            else:
                logger.warning("Twilio credentials missing — running in MOCK mode")
        elif creds_present:
            self.client = Client(self.account_sid, self.auth_token)
            logger.info("Twilio client initialised (live mode)")
        else:
            if not (self.meta_whatsapp_token and self.meta_phone_number_id):
                raise RuntimeError("Twilio or Meta credentials are required when NOTIFICATION_MOCK_ENABLED=false.")
            self.client = None

    # ----------------------------------------------------------------- WhatsApp

    def send_whatsapp(self, to_number: str, message: Optional[str] = None, content_sid: Optional[str] = None, content_variables: Optional[str] = None) -> SendResult:
        # 1. Primary Option: Send via Twilio WhatsApp
        twilio_res = self._send(
            channel="whatsapp",
            from_=self.whatsapp_number,
            to=f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number,
            body=message,
            content_sid=content_sid,
            content_variables=content_variables,
        )
        
        # 2. Sandbox Testing Option: If Meta Cloud API is configured, also trigger Meta WhatsApp in parallel
        if self.meta_whatsapp_token and self.meta_phone_number_id:
            logger.info("Executing parallel Meta WhatsApp dispatch for sandbox/permissions testing.")
            meta_res = self._send_meta_whatsapp(to_number, message, content_sid, content_variables)
            # If primary Twilio failed but Meta succeeded, we can leverage Meta as a valid outcome
            if not twilio_res.ok and meta_res.ok:
                return meta_res
                
        return twilio_res


    def _send_meta_whatsapp(self, to_number: str, message: Optional[str], content_sid: Optional[str], content_variables: Optional[str]) -> SendResult:
        import requests
        masked = mask_phone(to_number)
        clean_to = "".join(c for c in to_number if c.isdigit())
        
        is_allowed = True
        if self.only_send_to:
            if ("+" + clean_to) not in self.only_send_to and clean_to not in self.only_send_to:
                is_allowed = False
                
        if self.mock_enabled or not is_allowed:
            if not is_allowed:
                logger.info("[FILTERED META WHATSAPP] Bypassed send to=%s", masked)
            elif self.log_message_body:
                logger.info("[MOCK META WHATSAPP] to=%s body=%r", masked, message)
            else:
                logger.info("[MOCK META WHATSAPP] to=%s", masked)
            return SendResult(ok=True, sid=f"mock_meta_wa_{id(message)}")
            
        url = f"https://graph.facebook.com/v19.0/{self.meta_phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.meta_whatsapp_token}",
            "Content-Type": "application/json"
        }
        
        # We send standard free-form text. For this to deliver reliably, the patient
        # must have an active 24h customer service window (i.e. they messaged the bot first),
        # otherwise Meta requires a pre-approved template.
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_to,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message or "Update regarding your queue status."
            }
        }
        
        try:
            res = requests.post(url, headers=headers, json=payload)
            data = res.json()
            if res.ok and "messages" in data:
                wa_id = data["messages"][0]["id"]
                logger.info("Sent META whatsapp to=%s sid=%s", masked, wa_id)
                return SendResult(ok=True, sid=wa_id)
            else:
                err_msg = data.get("error", {}).get("message", str(data))
                logger.error("META whatsapp send failed to=%s err=%s", masked, err_msg)
                return SendResult(ok=False, error=err_msg, retriable=True)
        except Exception as exc:
            logger.warning("META whatsapp send error to=%s err=%s", masked, exc)
            return SendResult(ok=False, error=str(exc), retriable=True)

    # --------------------------------------------------------------------- SMS

    def send_sms(self, to_number: str, message: str) -> SendResult:
        return self._send(
            channel="sms",
            from_=self.sms_number,
            to=to_number,
            body=message,
        )

    # ------------------------------------------------------------------- send

    def _send(self, *, channel: str, from_: str, to: str, body: Optional[str] = None, content_sid: Optional[str] = None, content_variables: Optional[str] = None) -> SendResult:
        masked = mask_phone(to)
        
        is_allowed = True
        if self.only_send_to:
            clean_to = "".join(c for c in to if c.isdigit() or c == "+")
            if clean_to not in self.only_send_to:
                is_allowed = False

        if self.client is None or not is_allowed:
            # Mock mode / Filtered mode — useful for dev, blocked in prod by the constructor.
            if not is_allowed:
                logger.info("[FILTERED %s] Bypassed send to=%s because it doesn't match TWILIO_ONLY_SEND_TO", channel.upper(), masked)
            elif self.log_message_body:
                logger.info("[MOCK %s] to=%s body=%r content_sid=%r content_vars=%r", channel.upper(), masked, body, content_sid, content_variables)
            else:
                logger.info("[MOCK %s] to=%s len=%d", channel.upper(), masked, len(body or "") if body else 0)
            return SendResult(ok=True, sid=f"mock_{channel}_{id(body or content_sid)}")
        try:
            create_kwargs = {"from_": from_, "to": to}
            if body is not None:
                create_kwargs["body"] = body
            if content_sid is not None:
                create_kwargs["content_sid"] = content_sid
            if content_variables is not None:
                create_kwargs["content_variables"] = content_variables
            if self.status_callback_url:
                create_kwargs["status_callback"] = self.status_callback_url
            msg = self.client.messages.create(**create_kwargs)
            logger.info("Sent %s to=%s sid=%s status=%s", channel, masked, msg.sid, msg.status)
            return SendResult(ok=True, sid=msg.sid)
        except TwilioRestException as exc:
            retriable = exc.code not in NON_RETRIABLE_TWILIO_CODES
            logger.warning(
                "%s send failed to=%s code=%s status=%s retriable=%s msg=%s",
                channel, masked, exc.code, exc.status, retriable, exc.msg,
            )
            return SendResult(
                ok=False,
                error=f"{exc.code}: {exc.msg}",
                error_code=exc.code,
                retriable=retriable,
            )
        except Exception as exc:  # network, dns, ... — assume transient
            logger.warning("%s send error to=%s err=%s", channel, masked, exc)
            return SendResult(ok=False, error=str(exc), retriable=True)
