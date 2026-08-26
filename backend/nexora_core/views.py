from rest_framework import permissions, throttling
from rest_framework.response import Response
from rest_framework.views import APIView

from .deployment import deployment_report


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "health"

    def get(self, request):
        return Response({"status": "ok"})


class ReadinessView(HealthView):
    def get(self, request):
        report = deployment_report()
        return Response(report, status=200 if report["status"] == "ready" else 503)
