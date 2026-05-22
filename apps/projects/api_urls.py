from django.urls import path
from .api_views import TrackUploadView, TrackDetailView

urlpatterns = [
    path('tracks/<int:project_id>/upload/', TrackUploadView.as_view(), name='track-upload'),
    path('tracks/<int:track_id>/', TrackDetailView.as_view(), name='track-detail'),
]
