from django.contrib import admin
from .models import Project, AudioTrack


class AudioTrackInline(admin.TabularInline):
    model = AudioTrack
    extra = 0
    readonly_fields = ('created_at',)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'tempo', 'key', 'created_at')
    list_filter = ('key',)
    search_fields = ('title', 'user__username')
    inlines = [AudioTrackInline]


@admin.register(AudioTrack)
class AudioTrackAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'volume', 'order', 'created_at')
    list_filter = ('project',)
