from django.urls import path

from .views import CurrentUserView, LoginView, LogoutView, RegistrationView


app_name = "accounts"

urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="me"),
    path("login/", LoginView.as_view(), name="login"),
    path("register/", RegistrationView.as_view(), name="register"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
