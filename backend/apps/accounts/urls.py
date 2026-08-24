from django.urls import path

from .views import CurrentUserView, LoginView, LogoutView


app_name = "accounts"

urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="me"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
