import os
import time
import pandas as pd
import numpy as np
import xgboost as xgb
import mlflow
import psycopg2
import schedule
import logging
from datetime import datetime, timedelta
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RetrainingService")

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@db:5432/hospital_queue")
MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
RETRAIN_SCHEDULE = os.getenv("RETRAIN_SCHEDULE", "02:00")
RETRAIN_WINDOW_DAYS = int(os.getenv("RETRAIN_WINDOW_DAYS", "90"))
MODEL_NAME = "hospital_queue_wait_time"

mlflow.set_tracking_uri(MLFLOW_URI)

def fetch_data():
    logger.info(f"Fetching historical data for last {RETRAIN_WINDOW_DAYS} days...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        # We join with VisionMetric or just use token timestamps for basic features
        # For this implementation, we focus on Token lifecycle data
        query = """
            SELECT 
                EXTRACT(HOUR FROM created_at) as time_of_day,
                EXTRACT(DOW FROM created_at) as day_of_week,
                predicted_wait_minutes,
                (EXTRACT(EPOCH FROM (service_start_at - created_at)) / 60) as actual_wait_minutes
            FROM core_token
            WHERE status = 'COMPLETED' 
              AND service_start_at IS NOT NULL
              AND created_at >= NOW() - INTERVAL '%s days'
        """ % RETRAIN_WINDOW_DAYS
        
        df = pd.read_sql(query, conn)
        conn.close()
        return df
    except Exception as e:
        logger.error(f"Database fetch failed: {e}")
        return pd.DataFrame()

def train_and_log():
    df = fetch_data()
    if df.empty or len(df) < 50: # Min samples for retraining
        logger.warning("Insufficient data for retraining. Skipping.")
        return

    logger.info(f"Starting training on {len(df)} samples...")
    
    X = df[['time_of_day', 'day_of_week']] # Simplified features for this step
    y = df['actual_wait_minutes']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    with mlflow.start_run():
        params = {
            "objective": "reg:squarederror",
            "max_depth": 5,
            "learning_rate": 0.1,
            "n_estimators": 100
        }
        
        model = xgb.XGBRegressor(**params)
        model.fit(X_train, y_train)
        
        preds = model.predict(X_test)
        mae = mean_absolute_error(y_test, preds)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        
        # Log to MLflow
        mlflow.log_params(params)
        mlflow.log_metric("mae", mae)
        mlflow.log_metric("rmse", rmse)
        
        # Register model
        mlflow.xgboost.log_model(model, "model", registered_model_name=MODEL_NAME)
        
        logger.info(f"Retraining complete. MAE: {mae:.2f}, RMSE: {rmse:.2f}")

def run_scheduler():
    logger.info(f"Retraining service started. Schedule: {RETRAIN_SCHEDULE}")
    
    # Run once on boot
    if os.getenv("RETRAIN_ON_BOOT", "True") == "True":
        train_and_log()
    
    schedule.every().day.at(RETRAIN_SCHEDULE).do(train_and_log)
    
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    run_scheduler()
