from django.contrib.auth import authenticate
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=1, max_length=150, trim_whitespace=True)
    password = serializers.CharField(min_length=1, max_length=256, trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        request = self.context["request"]
        user = authenticate(request=request, username=attrs["username"], password=attrs["password"])
        if user is None or not user.is_active:
            raise serializers.ValidationError({"detail": "Invalid username or password."})
        attrs["user"] = user
        return attrs
