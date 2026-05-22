# MusicStudio — Веб-сервіс для створення музичного контенту

Дипломний проєкт. Повноцінний веб-застосунок для редагування аудіо з AI-асистентом.

## Технологічний стек

- Python 3.12 + Django 5
- Django REST Framework
- PostgreSQL
- Web Audio API (фронтенд)
- OpenAI GPT-4o-mini

## Встановлення та запуск

### 1. Клонування та середовище

```bash
git clone <repo-url>
cd music_project
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Налаштування .env

Скопіюйте `.env.example` у `.env` і заповніть:

```
SECRET_KEY=згенеруйте-рядок-50-символів
DEBUG=True
DB_NAME=music_db
DB_USER=postgres
DB_PASSWORD=ваш_пароль
DB_HOST=localhost
DB_PORT=5432
OPENAI_API_KEY=sk-...
ALLOWED_HOSTS=localhost,127.0.0.1
```

### 3. База даних

Створіть базу в PostgreSQL:

```sql
CREATE DATABASE music_db;
```

Потім застосуйте міграції:

```bash
python manage.py migrate
python manage.py createsuperuser
```

### 4. Запуск сервера

```bash
python manage.py runserver
```

Відкрийте: http://127.0.0.1:8000/projects/

## Структура проєкту

```
music_project/
├── config/           # Налаштування Django
├── apps/
│   ├── accounts/     # Реєстрація, вхід, профіль
│   ├── projects/     # Музичні проєкти та доріжки
│   └── ai_chat/      # Інтеграція з OpenAI
├── templates/        # HTML шаблони
├── static/
│   ├── css/          # Стилі (темна тема)
│   └── js/           # audio_editor.js, chat.js
└── media/            # Завантажені файли
```

## Основні можливості

- Реєстрація та авторизація користувачів
- Створення музичних проєктів (BPM, тональність)
- Завантаження аудіофайлів (MP3, WAV, FLAC до 50 МБ)
- Візуалізація хвильової форми (Canvas API)
- Відтворення, пауза, зупинка доріжок
- Обрізання фрагменту (trim)
- Регулювання гучності
- Ефекти: Reverb, Bass Boost (Web Audio API)
- Мікшування доріжок і експорт у WAV
- AI чат-бот (GPT-4o-mini) з контекстом проєкту

## API ендпоінти

| Метод | URL | Опис |
|-------|-----|------|
| POST | `/api/chat/<project_id>/` | Запит до AI |
| POST | `/api/tracks/<project_id>/upload/` | Завантажити трек |
| PATCH | `/api/tracks/<track_id>/` | Оновити параметри |
| DELETE | `/api/tracks/<track_id>/` | Видалити трек |
