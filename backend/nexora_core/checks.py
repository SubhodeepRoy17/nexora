from urllib.parse import urlparse

from django.conf import settings
from django.core.checks import Error, Tags, Warning, register


@register(Tags.security, deploy=True)
def deployment_settings_check(app_configs, **kwargs):
    errors = []
    key_id = settings.RAZORPAY_KEY_ID
    if settings.MONEY_REQUIRE_RAZORPAY_TEST_MODE and key_id and not key_id.startswith("rzp_test_"):
        errors.append(Error("A non-test Razorpay key is forbidden.", id="nexora.E001"))
    if bool(key_id) != bool(settings.RAZORPAY_KEY_SECRET):
        errors.append(Error("Razorpay key ID and secret must be configured together.", id="nexora.E002"))
    if key_id and not settings.RAZORPAY_WEBHOOK_SECRET:
        errors.append(Error("RAZORPAY_WEBHOOK_SECRET is required when Razorpay is configured.", id="nexora.E003"))

    unsafe_hosts = {"*", "localhost", "127.0.0.1", "[::1]"}
    if not settings.ALLOWED_HOSTS or unsafe_hosts.intersection(settings.ALLOWED_HOSTS):
        errors.append(Error("Production ALLOWED_HOSTS must contain only explicit public hosts.", id="nexora.E004"))
    for origin in (*settings.CORS_ALLOWED_ORIGINS, *settings.CSRF_TRUSTED_ORIGINS):
        if urlparse(origin).scheme != "https":
            errors.append(Error("Production CORS and CSRF origins must use HTTPS.", id="nexora.E005"))
            break
    if not set(settings.CORS_ALLOWED_ORIGINS).issubset(settings.CSRF_TRUSTED_ORIGINS):
        errors.append(Error("Every allowed browser origin must also be CSRF-trusted.", id="nexora.E006"))
    if not settings.SECURE_SSL_REDIRECT:
        errors.append(Warning("HTTPS redirect is disabled.", id="nexora.W001"))
    return errors
