from rest_framework.authentication import SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
    """Session authentication that reports missing identity as HTTP 401."""

    def authenticate_header(self, request):
        return "Session"
