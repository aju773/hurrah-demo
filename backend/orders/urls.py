from django.urls import path

from .catalogue_views import ProductCatalogueView, ProductConfigurationView
from .design_request_views import DesignHelpSettingsView, DesignRequestCreateView
from .order_views import OrderByTokenView, OrderSubmitView
from .views import ArtworkDetailView, ArtworkPreviewView, ArtworkUploadView, ProductDetailView

urlpatterns = [
    path("products/<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
    path("products/<slug:slug>/catalogue/", ProductCatalogueView.as_view(), name="product-catalogue"),
    path("products/<slug:slug>/configuration/", ProductConfigurationView.as_view(), name="product-configuration"),
    path("products/<slug:slug>/preview/", ArtworkPreviewView.as_view(), name="product-preview"),
    path("products/<slug:slug>/orders/", OrderSubmitView.as_view(), name="order-submit"),
    path("artworks/", ArtworkUploadView.as_view(), name="artwork-upload"),
    path("artworks/<int:pk>/", ArtworkDetailView.as_view(), name="artwork-detail"),
    path("orders/<str:token>/", OrderByTokenView.as_view(), name="order-by-token"),
    path("design-requests/", DesignRequestCreateView.as_view(), name="design-request-create"),
    path("design-requests/settings/", DesignHelpSettingsView.as_view(), name="design-request-settings"),
]
