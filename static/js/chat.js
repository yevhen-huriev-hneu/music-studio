/**
 * chat.js
 * Логіка AI чат-бота: надсилання запитів і відображення відповідей без перезавантаження
 */

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatTyping = document.getElementById('chat-typing');

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessage(role, text) {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    const div = document.createElement('div');
    div.className = `chat-message chat-message--${role}`;
    div.innerHTML = `
        <span class="chat-message__text">${escapeHtml(text)}</span>
        <span class="chat-message__time">${time}</span>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    chatSendBtn.disabled = true;
    appendMessage('user', text);

    chatTyping.style.display = 'flex';
    scrollToBottom();

    try {
        const resp = await fetch(CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': CSRF_TOKEN,
            },
            body: JSON.stringify({ message: text }),
        });

        const data = await resp.json();
        chatTyping.style.display = 'none';

        if (resp.ok) {
            appendMessage('assistant', data.reply);
        } else {
            appendMessage('assistant', data.error || 'Сталася помилка. Спробуйте ще раз.');
        }
    } catch (err) {
        chatTyping.style.display = 'none';
        appendMessage('assistant', 'Не вдалося з\'єднатися з сервером.');
    } finally {
        chatSendBtn.disabled = false;
    }
}

chatSendBtn?.addEventListener('click', sendMessage);

chatInput?.addEventListener('keydown', (e) => {
    // Ctrl+Enter або Shift+Enter — надіслати повідомлення
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
        e.preventDefault();
        sendMessage();
    }
});

// Прокрутити вниз при завантаженні
scrollToBottom();
