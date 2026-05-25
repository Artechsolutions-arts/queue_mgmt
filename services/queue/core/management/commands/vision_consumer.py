import os
import time
import redis
import logging
from django.core.management.base import BaseCommand
from core.models import VisionMetric
from django.utils import timezone
import datetime

logger = logging.getLogger("VisionConsumer")

class Command(BaseCommand):
    help = 'Consumes vision density events from Redis and saves to TimescaleDB'

    def add_arguments(self, parser):
        parser.add_argument('--from-beginning', action='store_true', help='Read from beginning of stream')

    def handle(self, *args, **options):
        redis_url = os.getenv('REDIS_URL', 'redis://redis:6379/0')
        try:
            r = redis.from_url(redis_url)
            logger.info(f"Vision consumer connected to Redis at {redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            return

        last_id = '0' if options['from_beginning'] else '$'
        
        # We listen to all density streams
        stream_pattern = 'camera.density.*'
        
        while True:
            try:
                # Note: pattern matching in XREAD requires specific logic or separate reads
                # For this implementation, we assume a single zone for now as per compose
                zone_id = os.getenv('ZONE_ID', 'main_waiting_area')
                stream_key = f'camera.density.{zone_id}'
                
                streams = r.xread({stream_key: last_id}, count=10, block=5000)
                if streams:
                    for stream, messages in streams:
                        for message_id, data in messages:
                            decoded_data = {k.decode(): v.decode() for k, v in data.items()}
                            
                            VisionMetric.objects.create(
                                zone_id=decoded_data['zone_id'],
                                headcount=int(decoded_data['headcount']),
                                timestamp=timezone.make_aware(datetime.datetime.fromtimestamp(int(decoded_data['timestamp'])))
                            )
                            logger.info(f"Persisted density for {decoded_data['zone_id']}: {decoded_data['headcount']}")
                            last_id = message_id
            except Exception as e:
                logger.error(f"Error in vision consumer: {e}")
                time.sleep(2)
