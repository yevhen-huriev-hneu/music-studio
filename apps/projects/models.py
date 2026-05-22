from django.db import models
from django.contrib.auth.models import User

KEY_CHOICES = [
    ('C', 'C'), ('C#', 'C#'), ('D', 'D'), ('D#', 'D#'),
    ('E', 'E'), ('F', 'F'), ('F#', 'F#'), ('G', 'G'),
    ('G#', 'G#'), ('A', 'A'), ('A#', 'A#'), ('B', 'B'),
    ('Cm', 'Cm'), ('C#m', 'C#m'), ('Dm', 'Dm'), ('D#m', 'D#m'),
    ('Em', 'Em'), ('Fm', 'Fm'), ('F#m', 'F#m'), ('Gm', 'Gm'),
    ('G#m', 'G#m'), ('Am', 'Am'), ('A#m', 'A#m'), ('Bm', 'Bm'),
]

ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac']


class Project(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    title = models.CharField(max_length=255, verbose_name='Назва')
    tempo = models.PositiveIntegerField(default=120, verbose_name='Темп (BPM)')
    key = models.CharField(max_length=10, default='C', choices=KEY_CHOICES, verbose_name='Тональність')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Проєкт'
        verbose_name_plural = 'Проєкти'

    def __str__(self):
        return f'{self.title} ({self.user.username})'


class AudioTrack(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tracks')
    title = models.CharField(max_length=255, verbose_name='Назва доріжки')
    file = models.FileField(upload_to='tracks/', verbose_name='Аудіофайл')
    volume = models.FloatField(default=1.0, verbose_name='Гучність')
    order = models.PositiveIntegerField(default=0, verbose_name='Порядок')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']
        verbose_name = 'Аудіодоріжка'
        verbose_name_plural = 'Аудіодоріжки'

    def __str__(self):
        return f'{self.title} — {self.project.title}'
