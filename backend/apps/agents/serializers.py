from rest_framework import serializers


class BuyerSearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1, max_length=2_000, trim_whitespace=True)
    conversation_id = serializers.UUIDField(required=False)
    conversation_token = serializers.CharField(
        required=False, min_length=20, max_length=2_048, trim_whitespace=False
    )

    def validate(self, attrs):
        if bool(attrs.get("conversation_id")) != bool(attrs.get("conversation_token")):
            request = self.context.get("request")
            if not request or not request.user.is_authenticated:
                raise serializers.ValidationError(
                    "Guest conversation_id and conversation_token must be supplied together."
                )
        return attrs


class GrowthOfferResponseSerializer(serializers.Serializer):
    offer_token = serializers.CharField(min_length=20, max_length=2_048, trim_whitespace=False)
    accepted = serializers.BooleanField()
