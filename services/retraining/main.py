import logging
import os
import time

import schedule

from db import fetch_historical_data
from trainer import ModelTrainer

logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger("RetrainingService")

TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
SCHEDULE_TIME = os.getenv("RETRAIN_SCHEDULE", "02:00")
RUN_ON_BOOT = os.getenv("RETRAIN_ON_BOOT", "true").lower() in ('1', 'true', 'yes')


def nightly_job():
    logger.info("Starting retraining job...")
    df = fetch_historical_data(days=int(os.getenv("RETRAIN_WINDOW_DAYS", "90")))
    trainer = ModelTrainer(tracking_uri=TRACKING_URI)
    run_id = trainer.train_and_log(df)
    if run_id:
        logger.info("Retraining complete. MLflow run id: %s", run_id)
    else:
        logger.info("Retraining skipped (not enough data).")


if __name__ == "__main__":
    schedule.every().day.at(SCHEDULE_TIME).do(nightly_job)
    logger.info("Retraining service started. Schedule=%s tracking_uri=%s", SCHEDULE_TIME, TRACKING_URI)

    if RUN_ON_BOOT:
        try:
            nightly_job()
        except Exception as exc:
            logger.error("Boot-time retraining failed: %s", exc)

    while True:
        schedule.run_pending()
        time.sleep(60)
