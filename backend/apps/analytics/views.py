from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import merchant_analytics_payload


class AnalyticsQuerySerializer(serializers.Serializer):
    merchant = serializers.IntegerField(min_value=1, required=False)


class MerchantAnalyticsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        query = AnalyticsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response(merchant_analytics_payload(query.validated_data.get("merchant")))
