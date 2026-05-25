# Production WhatsApp sender setup

Goal: send registration WhatsApp messages to **any patient** with **no sandbox join
and no 72h expiry**. The app code is already prepared — this is the Twilio/Meta
account work plus two env values.

## Why this is needed

The sandbox (`whatsapp:+14155238886`) requires every recipient to text `join <code>`
and re-join every 72 hours. That's fine for testing, impossible for real patients.
A production sender removes both limits. Because registration is a *business-initiated
first contact*, WhatsApp requires an **approved message template** to send it — which is
exactly what the bundle-template support in `services/notification/main.py` uses.

## Prerequisites

- **Upgrade Twilio off trial** (add a payment method). Production WhatsApp will not
  send on a trial account.
- A **Meta Business account** (Business Manager). You can create one during onboarding.
- A **phone number you control** that is **not** currently registered on the regular
  WhatsApp app. Either buy a Twilio number with WhatsApp capability, or bring your own
  (you'll verify it by OTP). It becomes your WhatsApp "from" number.

## Step 1 — Register the WhatsApp sender (Twilio Console)

1. Twilio Console → **Messaging → Senders → WhatsApp senders → Create new sender**.
2. Follow the embedded signup: log in with Facebook, connect/create your **WhatsApp
   Business Account (WABA)**, select the phone number, and verify it via the OTP code.
3. Set the **display name** (e.g. "SmartQueue / <Hospital name>"). Meta reviews this.

## Step 2 — Business verification (Meta)

Submit your business details for **Meta Business Verification** (Business Manager →
Security Center). This can take **1–2 days** (sometimes longer). Until verified you get
low messaging limits; transactional/utility traffic still flows at the starting tier.

## Step 3 — Create and submit the bundle template

Twilio Console → **Messaging → Content Template Builder → Create new**.

- **Category: UTILITY** (transactional). Important: utility templates can be sent to a
  patient who hasn't messaged you first — which every new registration is. Do *not*
  pick Marketing.
- **Body** (the static text can have line breaks; only the `{{n}}` *values* can't):

  ```
  Hi {{1}}, you're registered for {{2}} visit(s) today at SmartQueue.

  Start here: {{3}}

  Your stops (shortest wait first): {{4}}

  Each counter will call your token when it's ready.
  ```

- The four variables map to what the worker already sends
  (`deliver_bundle()` in `services/notification/main.py`):

  | Var | Meaning | Example |
  |-----|---------|---------|
  | `{{1}}` | patient name | `Uma Devi` |
  | `{{2}}` | number of tokens | `3` |
  | `{{3}}` | recommended first stop | `General Consultation (Token GEN-156) at Counter 1 (Main Hall, next to the pharmacy)` |
  | `{{4}}` | all stops, one line | `General Consultation GEN-156 → Counter 1 \| Blood Test BLD-031 → Lab Counter 5 \| X-Ray XRY-010 → Radiology Counter 6` |

- Provide sample values for each variable when prompted (Meta requires samples), then
  **Submit for WhatsApp approval**. Utility templates usually approve quickly.
- Copy the resulting **Content SID** (`HX...`).

> Optional: also build a single-token template for `deliver()` (vars: service, token,
> eta, directions) and set `TWILIO_WHATSAPP_CONTENT_SID`. Only needed if you ever use
> single `register` instead of `register-multi`; the frontend currently always uses
> register-multi, so the bundle template is the one that matters.

## Step 4 — Wire it into the app (`.env`)

```ini
# Swap the sandbox number for your approved production WhatsApp sender:
TWILIO_WHATSAPP_NUMBER=whatsapp:+<your_production_number>

# The approved bundle template from Step 3:
TWILIO_WHATSAPP_BUNDLE_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Confirm these are already set for live sending:
NOTIFICATION_MOCK_ENABLED=false
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

Then restart the worker:

```bash
docker compose up -d --build notification-service
```

(The notification service bakes code/config at build, so rebuild after .env changes —
or add a bind-mount if you want hot reload.)

## Step 5 — Verify (no join step!)

Register a patient whose number has **never** joined any sandbox:

```bash
curl -s -X POST http://localhost:8000/api/queue/register-multi/ \
  -H "Content-Type: application/json" \
  -d '{"patient_name":"Test Patient","phone_number":"+91XXXXXXXXXX","service_type_ids":[1],"test_ids":[5]}'
```

Confirm in the worker logs you see **`Bundle WhatsApp template attempt … content_sid=HX…`**
(not "free-form"), then check the delivery status reaches `delivered`:

```bash
docker compose logs notification-service --since 30s | grep -i "Bundle WhatsApp"
```

## Compliance notes

- **Opt-in:** Meta requires patient consent to message them on WhatsApp. Capture it at
  registration (a consent checkbox / notice that you'll send queue updates to their
  number) and keep a record.
- **Billing:** WhatsApp messages are billed per Meta conversation/message pricing plus
  Twilio's fee. Utility-category messages are cheaper than marketing.
- **24h window:** After a patient replies, you have a 24h window for free-form messages;
  outside it you must use an approved template. The app already does the right thing —
  template when `..._BUNDLE_CONTENT_SID` is set, free-form otherwise.
