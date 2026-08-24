from django.db import DatabaseError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import BuyerSearchRequestSerializer
from .services import run_buyer_agent


class BuyerAgentSearchView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = BuyerSearchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_buyer_agent(serializer.validated_data["query"])
        except DatabaseError:
            return Response(
                {"detail": "The product catalog is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)
