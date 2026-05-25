import os
import logging
import xgboost as xgb
import mlflow
import pandas as pd
import numpy as np

logger = logging.getLogger("PredictionModel")

class WaitTimeModel:
    def __init__(self, model_dir="models"):
        self.model = None
        self.model_dir = model_dir
        self.tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
        mlflow.set_tracking_uri(self.tracking_uri)

    def load_latest(self):
        try:
            # Try to load from MLflow registry
            model_name = "hospital_queue_wait_time"
            model_uri = f"models:/{model_name}/latest"
            self.model = mlflow.xgboost.load_model(model_uri)
            logger.info("Loaded latest model from MLflow.")
        except Exception as e:
            logger.warning(f"Failed to load from MLflow: {e}. Looking for local fallback.")
            local_path = os.path.join(self.model_dir, "fallback_model.json")
            if os.path.exists(local_path):
                self.model = xgb.Booster()
                self.model.load_model(local_path)
                logger.info("Loaded local fallback model.")
            else:
                logger.warning("No model found. Predictions will use heuristic fallback.")

    def predict(self, features_df):
        if self.model is None:
            # Heuristic: 10 mins per person in queue
            return features_df['queue_depth'] * 10
        
        dmatrix = xgb.DMatrix(features_df)
        preds = self.model.predict(dmatrix)
        return preds
