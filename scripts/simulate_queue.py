import os
import time
import random
import requests
import numpy as np
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("VITE_API_BASE", "http://localhost:8000/api")

# Names for simulation
NAMES = ["Amit", "Sneha", "Rahul", "Priya", "Vikram", "Anjali", "Rohan", "Meera", "Deepak", "Kavita"]

def simulate_arrival(arrival_rate=2):
    """
    Simulates patient arrivals using a Poisson distribution.
    arrival_rate: average patients per minute
    """
    logger_print(f"Starting simulation at {API_URL} (Rate: {arrival_rate} patients/min)")
    
    # Get available service types
    st_ids = [1]
    try:
        resp = requests.get(f"{API_URL}/service-types/")
        if resp.status_code == 200:
            service_types = resp.json()
            st_ids = [st['id'] for st in service_types]
            logger_print(f"Loaded service types: {st_ids}")
        else:
            logger_print(f"Failed to fetch service types: {resp.text}")
    except Exception as e:
        logger_print(f"Failed to fetch service types: {e}")

    while True:
        # Wait for next arrival
        inter_arrival_time = np.random.exponential(1.0 / arrival_rate)
        time.sleep(inter_arrival_time * 60 / 10) # Speed up 10x for demo
        
        name = random.choice(NAMES)
        phone = f"+91{random.randint(7000000000, 9999999999)}"
        st_id = random.choice(st_ids)
        
        payload = {
            "patient_name": name,
            "phone_number": phone,
            "service_type_id": st_id,
            "is_simulated": True
        }
        
        try:
            res = requests.post(f"{API_URL}/queue/register/", json=payload)
            if res.status_code == 201:
                data = res.json()
                logger_print(f"Registered: {name} ({data['token_number']}) -> {data['counter']} (Wait: {data['predicted_wait_minutes']}m)")
            else:
                logger_print(f"Failed to register {name}: {res.text}")
        except Exception as e:
            logger_print(f"Error connecting to API: {e}")

def logger_print(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

if __name__ == "__main__":
    simulate_arrival()
