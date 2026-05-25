import cv2
import time
import os
import redis
import json
import logging
import requests
from dotenv import load_dotenv
from frame_store import FrameStore, Pruner

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VisionService")

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
VIDEO_SOURCE = os.getenv("VIDEO_SOURCE", "test_video.mp4")
ZONE_ID = os.getenv("ZONE_ID", "main_waiting_area")
EMIT_INTERVAL = int(os.getenv("EMIT_INTERVAL_SECONDS", "10"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))
FRAME_STORE_DIR = "vision_assets/frames"

# Model Assets
PROTOTXT = "deploy.prototxt"
MODEL = "mobilenet_iter_73000.caffemodel"

def download_assets():
    urls = {
        PROTOTXT: "https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/deploy.prototxt",
        MODEL: "https://github.com/chuanqi305/MobileNet-SSD/raw/master/mobilenet_iter_73000.caffemodel",
        "test_video.mp4": "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4"
    }
    for filename, url in urls.items():
        if not os.path.exists(filename):
            logger.info(f"Downloading {filename}...")
            res = requests.get(url)
            with open(filename, "wb") as f:
                f.write(res.content)

def run_service():
    download_assets()
    
    # Initialize Redis
    try:
        r = redis.from_url(REDIS_URL)
        logger.info(f"Connected to Redis at {REDIS_URL}")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        r = None

    # Initialize Model
    net = cv2.dnn.readNetFromCaffe(PROTOTXT, MODEL)
    
    # Initialize FrameStore
    store = FrameStore(FRAME_STORE_DIR, ZONE_ID)
    pruner = Pruner(store)
    pruner.start()

    cap = cv2.VideoCapture(VIDEO_SOURCE)
    last_emit = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0) # Loop for testing
            continue

        now = time.time()
        
        # Detection
        (h, w) = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 0.007843, (300, 300), 127.5)
        net.setInput(blob)
        detections = net.forward()

        count = 0
        for i in range(0, detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            if confidence > CONFIDENCE_THRESHOLD:
                idx = int(detections[0, 0, i, 1])
                if idx == 15: # Person
                    count += 1

        # Emit density event
        if now - last_emit >= EMIT_INTERVAL:
            stream_key = f"camera.density.{ZONE_ID}"
            event = {
                "zone_id": ZONE_ID,
                "headcount": count,
                "timestamp": int(now)
            }
            if r:
                try:
                    r.xadd(stream_key, event, maxlen=10000)
                    logger.info(f"Emitted {stream_key}: {count} people")
                except Exception as e:
                    logger.error(f"Redis emit failed: {e}")
            last_emit = now

        # Frame store
        store.maybe_write(frame, now)

    cap.release()

if __name__ == "__main__":
    run_service()
