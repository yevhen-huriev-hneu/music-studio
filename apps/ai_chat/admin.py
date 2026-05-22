from django.contrib import admin
from .models import ChatMessage


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('project', 'role', 'content_preview', 'created_at')
    list_filter = ('role', 'project')
    readonly_fields = ('created_at',)

    def content_preview(self, obj):
        return obj.content[:80]
    content_preview.short_description = 'Зміст'
