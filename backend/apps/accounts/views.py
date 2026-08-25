from django.contrib.auth import login, logout
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import permissions, status, throttling
from rest_framework.response import Response
from rest_framework.views import APIView

from .security import log_security_event
from .serializers import LoginSerializer, RegistrationSerializer


def user_payload(user):
    if not user or not user.is_authenticated:
        return None
    merchant = getattr(user, "merchant_profile", None)
    return {
        "id": user.pk,
        "username": user.get_username(),
        "email": user.email,
        "display_name": user.get_full_name() or user.get_username(),
        "role": "merchant" if merchant else "buyer",
        "merchant": (
            {"id": merchant.pk, "name": merchant.name, "email": merchant.email}
            if merchant
            else None
        ),
    }


class CurrentUserView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "auth_read"

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"user": user_payload(request.user), "csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            log_security_event(request, "login", outcome="denied", reason="invalid_credentials")
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)
        user = serializer.validated_data["user"]
        login(request, user)
        log_security_event(request, "login", user_id=user.pk, outcome="success")
        return Response({"user": user_payload(user), "csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class RegistrationView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            log_security_event(request, "registration", outcome="denied", reason="invalid_input")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                user = serializer.save()
        except IntegrityError:
            log_security_event(request, "registration", outcome="denied", reason="conflict")
            return Response(
                {"detail": "That account identifier is unavailable."},
                status=status.HTTP_409_CONFLICT,
            )
        login(request, user)
        log_security_event(request, "registration", user_id=user.pk, outcome="success")
        return Response(
            {"user": user_payload(user), "csrf_token": get_token(request)},
            status=status.HTTP_201_CREATED,
        )


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        user_id = request.user.pk
        logout(request)
        log_security_event(request, "logout", user_id=user_id, outcome="success")
        return Response({"user": None, "csrf_token": get_token(request)})
