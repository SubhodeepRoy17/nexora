from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsMerchantUser

from .services import merchant_analytics_payload


class MerchantAnalyticsView(APIView):
    permission_classes = [IsMerchantUser]

    def get(self, request):
        return Response(merchant_analytics_payload(request.user.merchant_profile.id))
