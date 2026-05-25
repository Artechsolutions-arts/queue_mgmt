import pandas as pd
import numpy as np
from datetime import datetime

def prepare_features(data):
    """
    Input: {
        zone_id, current_headcount, queue_depth_per_counter,
        service_type_id, time_of_day, day_of_week,
        rolling_avg_service_time, density_trend
    }
    """
    now = datetime.now()
    
    # We create a feature set per counter to evaluate each one
    features_list = []
    
    for counter in data.get('queue_depth_per_counter', []):
        row = {
            'time_of_day': data.get('time_of_day', now.hour),
            'day_of_week': data.get('day_of_week', now.weekday()),
            'queue_depth': counter.get('depth', 0),
            'current_headcount': data.get('current_headcount', 0),
            'rolling_avg_service_time': data.get('rolling_avg_service_time', 15),
            'density_trend': data.get('density_trend', 0)
        }
        features_list.append(row)
    
    if not features_list:
        # Fallback if no counters
        return pd.DataFrame()
        
    return pd.DataFrame(features_list)

def get_feature_columns():
    return ['time_of_day', 'day_of_week', 'queue_depth', 'current_headcount', 'rolling_avg_service_time', 'density_trend']
