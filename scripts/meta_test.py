import os
import requests

# Read the Meta Graph API token from the environment — never hardcode secrets.
#   export META_WHATSAPP_TOKEN=...   (or add it to .env)
token = os.getenv("META_WHATSAPP_TOKEN", "")
if not token:
    raise SystemExit("Set META_WHATSAPP_TOKEN in your environment before running.")

def test_api():
    try:
        # Check standard me endpoint
        url = "https://graph.facebook.com/v19.0/me?access_token=" + token
        res = requests.get(url).json()
        print("ME DATA:", res)
        
        # Check permissions and app info
        url2 = "https://graph.facebook.com/v19.0/me/permissions?access_token=" + token
        print("PERMISSIONS:", requests.get(url2).json())
        
        # In a test app, usually the token is tied to a specific business.
        # Let's try to query business IDs if possible
        # WhatsApp Cloud API requires Phone Number ID to send messages.
    except Exception as e:
        print("Error:", e)

test_api()
