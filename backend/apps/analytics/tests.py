from django.test import SimpleTestCase
from django.urls import resolve


class AnalyticsRouteTests(SimpleTestCase):
    def test_merchant_analytics_route_is_available(self):
        match = resolve("/api/merchants/analytics/")
        self.assertEqual(match.url_name, "merchant-analytics")
