import os
from twilio.rest import Client
from dotenv import load_dotenv

load_dotenv()

account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")
whatsapp_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

print("Initialising Twilio Client...")
print(f"Account SID: {account_sid}")
print(f"From Number: {whatsapp_number}")

if not account_sid or not auth_token:
    print("Error: Twilio credentials not found in env!")
    exit(1)

client = Client(account_sid, auth_token)

try:
    message = client.messages.create(
        from_=whatsapp_number,
        body="Hi Patient, you have successfully registered for the Blood Test. Your token is LAB-002. Currently, the wait time is 10 min. Proceed to Counter 1. Note: Blood Test is busy (4 waiting). You can complete your X-Ray first where there is no queue.",
        to="whatsapp:+917993013344"
    )
    print(f"Success! Message SID: {message.sid}")
    print(f"Status: {message.status}")
except Exception as e:
    print(f"Failed to send message: {e}")
