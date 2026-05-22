from django.urls import path
from .views import ChatView

urlpatterns = [
    path('chat/<int:project_id>/', ChatView.as_view(), name='chat'),
]
