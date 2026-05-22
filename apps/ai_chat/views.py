from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from openai import OpenAI
from apps.projects.models import Project
from .models import ChatMessage


def build_system_prompt(project: Project) -> str:
    return (
        f"Ти — музичний асистент для веб-застосунку редагування аудіо. "
        f"Поточний проєкт: '{project.title}', темп {project.tempo} BPM, тональність {project.key}. "
        f"Допомагай користувачу з питаннями щодо редагування треків, структури композиції, "
        f"підбору жанру, зведення, мастерингу та творчих рекомендацій. "
        f"Відповідай лаконічно та по суті. Якщо питання не стосується музики, "
        f"ввічливо поверни розмову до музичних тем."
    )


class ChatView(APIView):

    def post(self, request, project_id):
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        project = get_object_or_404(Project, pk=project_id, user=request.user)
        user_message = request.data.get('message', '').strip()

        if not user_message:
            return Response({'error': 'Повідомлення не може бути порожнім.'}, status=status.HTTP_400_BAD_REQUEST)

        # Зберігаємо повідомлення користувача
        ChatMessage.objects.create(project=project, role='user', content=user_message)

        # Отримуємо останні 10 повідомлень для контексту
        history = project.messages.order_by('-created_at')[:10]
        messages_for_api = [
            {'role': msg.role, 'content': msg.content}
            for msg in reversed(history)
        ]

        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {'role': 'system', 'content': build_system_prompt(project)},
                    *messages_for_api,
                ],
                max_tokens=500,
                temperature=0.7,
            )
            assistant_reply = response.choices[0].message.content
        except Exception as e:
            return Response({'error': f'Помилка OpenAI: {str(e)}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Зберігаємо відповідь асистента
        ChatMessage.objects.create(project=project, role='assistant', content=assistant_reply)

        return Response({'reply': assistant_reply}, status=status.HTTP_200_OK)
