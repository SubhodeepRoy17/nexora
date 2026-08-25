from django.contrib.auth import authenticate, get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
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


class RegistrationSerializer(serializers.Serializer):
    first_name = serializers.CharField(min_length=1, max_length=150, trim_whitespace=True)
    username = serializers.CharField(min_length=3, max_length=150, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(
        min_length=8, max_length=256, trim_whitespace=False, write_only=True
    )
    password_confirm = serializers.CharField(
        min_length=8, max_length=256, trim_whitespace=False, write_only=True
    )

    def validate_username(self, value):
        User = get_user_model()
        username = User.normalize_username(value)
        username_field = User._meta.get_field(User.USERNAME_FIELD)
        for validator in username_field.validators:
            try:
                validator(username)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from exc
        if User.objects.filter(**{f"{User.USERNAME_FIELD}__iexact": username}).exists():
            raise serializers.ValidationError("This username is unavailable.")
        return username

    def validate_email(self, value):
        from apps.merchants.models import Merchant

        email = get_user_model().objects.normalize_email(value).lower()
        if get_user_model().objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account already uses this email address.")
        if Merchant.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("That email is unavailable for a merchant workspace.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        candidate = get_user_model()(
            username=attrs["username"], email=attrs["email"], first_name=attrs["first_name"]
        )
        try:
            password_validation.validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        from apps.merchants.models import Merchant

        user = get_user_model().objects.create_user(**validated_data)
        Merchant.objects.create(
            owner=user,
            name=user.get_full_name().strip() or user.get_username(),
            email=user.email,
        )
        return user
