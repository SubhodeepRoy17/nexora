from django.apps import AppConfig


class NexoraCoreConfig(AppConfig):
    name = "nexora_core"

    def ready(self):
        from . import checks  # noqa: F401
