import pytest
from django.conf import settings


@pytest.fixture(autouse=True)
def _use_inmemory_channel_layer(settings):
    """Avoid touching Redis in unit tests — Channels signals fire on Token saves."""
    settings.CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
