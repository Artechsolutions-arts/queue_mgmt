import mlflow
import mlflow.xgboost
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error
import numpy as np
import os

class ModelTrainer:
    def __init__(self, tracking_uri=None):
        if tracking_uri:
            mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment("Hospital_Wait_Time_Retraining")

    def train_and_log(self, df):
        if df.empty or len(df) < 10 or 'actual_wait_time' not in df.columns:
            print("Not enough data to retrain.")
            return None
        df = df.dropna(subset=['actual_wait_time'])
        if len(df) < 10:
            print("Not enough complete rows to retrain.")
            return None

        # Features: time_of_day, day_of_week, actual_wait_time (target)
        # Note: In a real scenario, we'd reconstruct the state (queue depth) at 'created_at'
        # For simplicity, we assume the df has the pre-processed features
        
        # Add missing features if not present (simulating)
        if 'queue_depth' not in df.columns:
            df['queue_depth'] = np.random.randint(0, 20, len(df))
        if 'rolling_avg_service_time' not in df.columns:
            df['rolling_avg_service_time'] = 15
        if 'density_trend' not in df.columns:
            df['density_trend'] = 0

        X = df[['time_of_day', 'day_of_week', 'queue_depth', 'rolling_avg_service_time', 'density_trend']]
        y = df['actual_wait_time']

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

        with mlflow.start_run():
            params = {
                "objective": "reg:squarederror",
                "n_estimators": 100,
                "learning_rate": 0.1,
                "max_depth": 5
            }
            mlflow.log_params(params)

            model = xgb.XGBRegressor(**params)
            model.fit(X_train, y_train)

            predictions = model.predict(X_test)
            mae = mean_absolute_error(y_test, predictions)
            rmse = np.sqrt(mean_squared_error(y_test, predictions))

            mlflow.log_metric("mae", mae)
            mlflow.log_metric("rmse", rmse)
            
            # Log model
            mlflow.xgboost.log_model(model, "model")
            
            print(f"Retraining successful. MAE: {mae:.2f}, RMSE: {rmse:.2f}")
            return mlflow.active_run().info.run_id
