import pytest
import pandas as pd
from features import prepare_features, get_feature_columns

class TestFeatureEngineering:
    def test_feature_columns(self):
        data = {
            'queue_depth_per_counter': [{'id': 1, 'depth': 5}],
            'current_headcount': 10,
            'rolling_avg_service_time': 15,
            'density_trend': 2
        }
        df = prepare_features(data)
        assert list(df.columns) == get_feature_columns()

    def test_density_trend_calculation(self):
        # This is tested in app.py logic, but we can test the prepare_features input
        data = {'density_trend': 5, 'queue_depth_per_counter': [{'depth': 0}]}
        df = prepare_features(data)
        assert df['density_trend'].iloc[0] == 5

    def test_cold_start_defaults(self):
        data = {'queue_depth_per_counter': [{'depth': 0}]}
        df = prepare_features(data)
        assert df['rolling_avg_service_time'].iloc[0] == 15
