from rest_framework import serializers
from .models import AudioTrack, Project
import os


class AudioTrackSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = AudioTrack
        fields = ('id', 'title', 'file_url', 'volume', 'order', 'created_at')
        read_only_fields = ('id', 'file_url', 'created_at')

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class ProjectSerializer(serializers.ModelSerializer):
    tracks = AudioTrackSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = ('id', 'title', 'tempo', 'key', 'tracks', 'created_at', 'updated_at')
