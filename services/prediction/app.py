import os
import logging
import threading
import time
import redis
import json
from flask import Flask, request, jsonify
from model import WaitTimeModel
from features import prepare_features
from router import RouteOptimiser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PredictionService")

app = Flask(__name__)
model = WaitTimeModel()
router = RouteOptimiser()

# Shared state for advisory data
advisory_data = {
    "current_headcount": 0,
    "density_history": [] # Recent 5 readings
}

def redis_consumer():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    try:
        r = redis.from_url(redis_url)
        logger.info(f"Prediction advisory consumer connected to Redis at {redis_url}")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        return

    last_density_id = '$'
    zone_id = os.getenv('ZONE_ID', 'main_waiting_area')
    stream_key = f'camera.density.{zone_id}'

    while True:
        try:
            streams = r.xread({stream_key: last_density_id}, count=1, block=5000)
            if streams:
                for stream, messages in streams:
                    for message_id, data in messages:
                        count = int(data.get(b'headcount', 0))
                        advisory_data["current_headcount"] = count
                        advisory_data["density_history"].append(count)
                        if len(advisory_data["density_history"]) > 5:
                            advisory_data["density_history"].pop(0)
                        last_density_id = message_id
        except Exception as e:
            logger.error(f"Advisory consumer error: {e}")
            time.sleep(2)

# Load model on start
model.load_latest()

# Start advisory thread
threading.Thread(target=redis_consumer, daemon=True).start()

@app.route('/healthz', methods=['GET'])
def healthz():
    return jsonify({"status": "ok"})

@app.route('/api/predict/', methods=['POST'])
def predict():
    data = request.get_json()
    
    # Calculate density trend (last - first of recent readings)
    trend = 0
    if len(advisory_data["density_history"]) >= 2:
        trend = advisory_data["density_history"][-1] - advisory_data["density_history"][0]
    
    # Enrich input with advisory data
    data["current_headcount"] = advisory_data["current_headcount"]
    data["density_trend"] = trend
    
    # Prepare Features
    features_df = prepare_features(data)
    
    # Run Inference
    predictions = model.predict(features_df)
    
    # Route Optimisation
    counters = data.get('queue_depth_per_counter', [])
    # predictions is a numpy array or pandas series
    pred_list = predictions.tolist() if hasattr(predictions, 'tolist') else list(predictions)
    
    best_counter_id, directions = router.get_optimal_counter(counters, pred_list)
    
    # Find the predicted wait for the chosen counter
    # (In this implementation, it's the min of the pred_list)
    min_wait = min(pred_list) if pred_list else 0

    return jsonify({
        "recommended_counter_id": best_counter_id,
        "predicted_wait_minutes": int(min_wait),
        "directions": directions
    })

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8001)
