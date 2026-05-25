import os
import time
import shutil
import logging
from pathlib import Path
import threading

logger = logging.getLogger("FrameStore")

class FrameStore:
    def __init__(self, root_dir, zone_id, interval=5, window=1800):
        self.root = Path(root_dir) / zone_id
        self.root.mkdir(parents=True, exist_ok=True)
        self.interval = interval
        self.window = window
        self._last_write = 0
        logger.info(f"FrameStore initialized at {self.root} (interval={interval}s, window={window}s)")

    def maybe_write(self, frame, timestamp):
        if timestamp - self._last_write < self.interval:
            return
        
        import cv2
        stem = str(int(timestamp))
        filepath = self.root / f"{stem}.jpg"
        tmppath = self.root / f"{stem}.tmp.jpg"

        cv2.imwrite(str(tmppath), frame)
        tmppath.replace(filepath)
        
        self._last_write = timestamp

    def prune(self):
        now = time.time()
        for f in self.root.glob("*.jpg"):
            try:
                ts = int(f.stem)
                if now - ts > self.window:
                    f.unlink()
            except ValueError:
                continue

class Pruner(threading.Thread):
    def __init__(self, store, interval=60):
        super().__init__(daemon=True)
        self.store = store
        self.interval = interval

    def run(self):
        while True:
            try:
                self.store.prune()
            except Exception as e:
                logger.error(f"Pruner error: {e}")
            time.sleep(self.interval)
