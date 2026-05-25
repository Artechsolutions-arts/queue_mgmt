from django.db.models.signals import post_save
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .models import Token

@receiver(post_save, sender=Token)
def trigger_websocket_update(sender, instance, **kwargs):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "queue_updates",
        {
            "type": "queue_update",
            "message": "tick"
        }
    )
