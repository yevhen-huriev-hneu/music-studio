from django import forms
from .models import Project, AudioTrack, ALLOWED_AUDIO_EXTENSIONS
import os


class ProjectForm(forms.ModelForm):
    class Meta:
        model = Project
        fields = ('title', 'tempo', 'key')
        widgets = {
            'title': forms.TextInput(attrs={'placeholder': 'Назва проєкту'}),
            'tempo': forms.NumberInput(attrs={'min': 20, 'max': 300}),
        }


class AudioTrackUploadForm(forms.ModelForm):
    class Meta:
        model = AudioTrack
        fields = ('title', 'file')

    def clean_file(self):
        f = self.cleaned_data.get('file')
        if f:
            ext = os.path.splitext(f.name)[1].lower()
            if ext not in ALLOWED_AUDIO_EXTENSIONS:
                raise forms.ValidationError(
                    f'Дозволені формати: {", ".join(ALLOWED_AUDIO_EXTENSIONS)}'
                )
            if f.size > 52428800:
                raise forms.ValidationError('Файл перевищує максимальний розмір 50 МБ.')
        return f
