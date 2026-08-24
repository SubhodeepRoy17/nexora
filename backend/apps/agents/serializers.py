from rest_framework import serializers


class BuyerSearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1, max_length=2_000, trim_whitespace=True)
