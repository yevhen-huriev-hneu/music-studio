from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from .models import Project, AudioTrack
from .serializers import AudioTrackSerializer
from .forms import AudioTrackUploadForm
import os


class TrackUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, project_id):
        project = get_object_or_404(Project, pk=project_id, user=request.user)
        form = AudioTrackUploadForm(request.POST, request.FILES)

        if form.is_valid():
            track = form.save(commit=False)
            track.project = project
            # Якщо назва не передана, беремо ім'я файлу без розширення
            if not track.title:
                track.title = os.path.splitext(request.FILES['file'].name)[0]
            track.order = project.tracks.count()
            track.save()
            serializer = AudioTrackSerializer(track, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(form.errors, status=status.HTTP_400_BAD_REQUEST)


class TrackDetailView(APIView):

    def get_track(self, track_id, user):
        return get_object_or_404(AudioTrack, pk=track_id, project__user=user)

    def delete(self, request, track_id):
        track = self.get_track(track_id, request.user)
        # Видаляємо файл з диску разом із записом
        if track.file:
            track.file.delete(save=False)
        track.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, track_id):
        track = self.get_track(track_id, request.user)
        serializer = AudioTrackSerializer(track, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
