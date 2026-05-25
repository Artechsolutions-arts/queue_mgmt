import logging
import os

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
logger = logging.getLogger("RetrainingDB")


def _engine_url() -> str | None:
    raw = os.getenv("DATABASE_URL")
    if not raw:
        return None
    # SQLAlchemy expects "postgresql://", Django/dj-database-url uses "postgres://".
    if raw.startswith("postgres://"):
        return "postgresql://" + raw[len("postgres://"):]
    return raw


def fetch_historical_data(days: int = 90) -> pd.DataFrame:
    url = _engine_url()
    if not url:
        logger.warning("DATABASE_URL not set; returning empty dataframe.")
        return pd.DataFrame()

    query = text(
        """
        SELECT
            EXTRACT(HOUR FROM created_at) AS time_of_day,
            EXTRACT(DOW FROM created_at) AS day_of_week,
            estimated_wait_time,
            EXTRACT(EPOCH FROM (service_start_at - created_at)) / 60 AS actual_wait_time,
            EXTRACT(EPOCH FROM (completed_at - service_start_at)) / 60 AS actual_service_time
        FROM core_token
        WHERE status = 'COMPLETED'
          AND service_start_at IS NOT NULL
          AND completed_at IS NOT NULL
          AND created_at >= NOW() - (:days * INTERVAL '1 day')
        """
    )

    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql(query, conn, params={"days": days})
    except Exception as exc:
        logger.warning("Could not fetch historical data: %s", exc)
        return pd.DataFrame()
