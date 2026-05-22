from django.db import models
from apps.projects.models import Project

ROLE_CHOICES = [
    ('user', 'Користувач'),
    ('assistant', 'Асистент'),
]


class ChatMessage(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Повідомлення чату'
        verbose_name_plural = 'Повідомлення чату'

    def __str__(self):
        return f'[{self.role}] {self.project.title}: {self.content[:50]}'
