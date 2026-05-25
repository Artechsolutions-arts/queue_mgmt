import requests
import time

API_URL = "http://localhost:8000/api"

def trigger_live_registration():
    print("Sending live patient registration to local backend...")
    payload = {
        "patient_name": "Ronith Y",
        "phone_number": "+917993013344",
        "service_type_id": 5, # Blood Test
        "medical_notes": "Needs Blood Test, PFT, and MRI. Has Diabetes.",
        "is_simulated": False # This must be False to trigger a real API notification send!
    }
    
    try:
        res = requests.post(f"{API_URL}/queue/register/", json=payload)
        if res.status_code == 201:
            data = res.json()
            print("Successfully registered!")
            print(f"Token Number: {data['token_number']}")
            print(f"Assigned Counter: {data['counter']}")
            print(f"Directions: {data['directions']}")
            print(f"Medical Notes saved: {data.get('medical_notes')}")
            print("\nWaiting 5 seconds for the notification service to consume and send WhatsApp...")
            time.sleep(5)
            return True
        else:
            print(f"Registration failed: {res.status_code} - {res.text}")
            return False
    except Exception as e:
        print(f"Failed to connect to API: {e}")
        return False

trigger_live_registration()
