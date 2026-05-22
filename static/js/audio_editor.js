/**
 * audio_editor.js
 * Логіка Web Audio API: завантаження, відтворення, ефекти, waveform, мікшування, експорт
 */

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Зберігає стан кожної доріжки за її ID
const trackStates = {};

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

let globalSeekPos = 0;

function updateAllGains() {
    const anySolo = Object.values(trackStates).some(s => s.solo);
    for (const [id, s] of Object.entries(trackStates)) {
        if (anySolo) {
            s.gainNode.gain.value = s.solo ? s.volume : 0;
        } else {
            s.gainNode.gain.value = s.muted ? 0 : s.volume;
        }
        document.querySelector(`.track-mute-btn[data-track-id="${id}"]`)?.classList.toggle('active', s.muted);
        document.querySelector(`.track-solo-btn[data-track-id="${id}"]`)?.classList.toggle('active', s.solo);
    }
}

function updateGlobalSeekMax() {
    const durations = Object.values(trackStates).map(s => s.buffer?.duration ?? 0);
    if (!durations.length) return;
    const max = Math.max(...durations);
    const slider = document.getElementById('global-seek-slider');
    const durEl = document.getElementById('global-seek-dur');
    if (slider) slider.max = max.toFixed(2);
    if (durEl) durEl.textContent = formatTime(max);
}

// Оновлює seek-слайдери для всіх треків і глобальний таймлайн
function rafLoop() {
    let globalUpdated = false;
    for (const [trackId, state] of Object.entries(trackStates)) {
        if (state.playing) {
            const pos = Math.min(state.startOffset + (audioCtx.currentTime - state.startTime) * state.playbackRate, state.trimEnd);
            const slider = document.getElementById(`seek-${trackId}`);
            const timeEl = document.getElementById(`seek-time-${trackId}`);
            if (slider) slider.value = pos;
            if (timeEl) timeEl.textContent = formatTime(pos);

            if (!globalUpdated) {
                globalUpdated = true;
                globalSeekPos = pos;
                const gSlider = document.getElementById('global-seek-slider');
                const gTime = document.getElementById('global-seek-time');
                if (gSlider) gSlider.value = pos;
                if (gTime) gTime.textContent = formatTime(pos);
            }
        }
    }
    requestAnimationFrame(rafLoop);
}
requestAnimationFrame(rafLoop);

// --- Ініціалізація доріжок, що вже є на сторінці ---

document.querySelectorAll('.track-play-btn').forEach(btn => {
    btn.disabled = true;
    btn.textContent = '...';
});

document.querySelectorAll('.track-item').forEach(item => {
    const trackId = item.dataset.trackId;
    const src = item.dataset.src;
    initTrack(trackId, src, item);
});

async function initTrack(trackId, src, container) {
    const playBtn = container.querySelector('.track-play-btn');
    if (playBtn) { playBtn.disabled = true; playBtn.textContent = '...'; }

    let arrayBuffer = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            arrayBuffer = await response.arrayBuffer();
            break;
        } catch (_err) {
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (!arrayBuffer) {
        if (playBtn) { playBtn.disabled = false; playBtn.innerHTML = '&#9654;'; }
        console.error(`Не вдалося завантажити аудіо для доріжки ${trackId} з ${src}`);
        return;
    }

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    trackStates[trackId] = {
        buffer: audioBuffer,
        gainNode: audioCtx.createGain(),
        source: null,
        volume: parseFloat(container.querySelector('.volume-slider')?.value ?? 1),
        reverbEnabled: false,
        reverbDecay: 2,
        reverbWet: 0.5,
        reverbBuffer: null,
        bassEnabled: false,
        bassGain: 10,
        bassFrequency: 200,
        compressorEnabled: false,
        compressorThreshold: -24,
        compressorRatio: 4,
        delayEnabled: false,
        delayTime: 0.3,
        delayFeedback: 0.4,
        eqEnabled: false,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        trimStart: 0,
        trimEnd: audioBuffer.duration,
        seekPosition: 0,
        playbackRate: 1,
        startTime: 0,
        startOffset: 0,
        playing: false,
        muted: false,
        solo: false,
    };

    const state = trackStates[trackId];
    state.gainNode.gain.value = state.volume;
    state.gainNode.connect(audioCtx.destination);

    drawWaveform(trackId, audioBuffer);

    // Ініціалізація seek-слайдера
    const seekSlider = document.getElementById(`seek-${trackId}`);
    const seekDur = document.getElementById(`seek-dur-${trackId}`);
    if (seekSlider) {
        seekSlider.max = audioBuffer.duration.toFixed(2);
        seekSlider.value = 0;
        seekSlider.addEventListener('input', (e) => {
            const pos = parseFloat(e.target.value);
            const timeEl = document.getElementById(`seek-time-${trackId}`);
            if (timeEl) timeEl.textContent = formatTime(pos);
            if (state.playing) {
                stopTrack(trackId);
                state.seekPosition = pos; // після stopTrack, бо він перезаписує seekPosition
                playTrack(trackId);
            } else {
                state.seekPosition = pos;
            }
        });
    }
    if (seekDur) seekDur.textContent = formatTime(audioBuffer.duration);

    // Зміна швидкості
    const speedSelect = container.querySelector('.speed-select');
    speedSelect?.addEventListener('change', (e) => {
        state.playbackRate = parseFloat(e.target.value);
        if (state.playing) {
            stopTrack(trackId); // зберігає поточну позицію
            playTrack(trackId); // запускає з новою швидкістю
        }
    });

    // Клік по waveform — перемотування
    const canvas = document.getElementById(`waveform-${trackId}`);
    canvas?.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const pos = ((e.clientX - rect.left) / rect.width) * audioBuffer.duration;
        if (seekSlider) seekSlider.value = pos;
        const timeEl = document.getElementById(`seek-time-${trackId}`);
        if (timeEl) timeEl.textContent = formatTime(pos);
        if (state.playing) {
            stopTrack(trackId);
            state.seekPosition = pos; // після stopTrack, бо він перезаписує seekPosition
            playTrack(trackId);
        } else {
            state.seekPosition = pos;
        }
    });

    // Per-track play/stop
    container.querySelector('.track-play-btn')?.addEventListener('click', async () => {
        if (state.playing) {
            stopTrack(trackId);
        } else {
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            playTrack(trackId);
        }
    });

    // Mute
    container.querySelector('.track-mute-btn')?.addEventListener('click', () => {
        state.muted = !state.muted;
        updateAllGains();
    });

    // Solo
    container.querySelector('.track-solo-btn')?.addEventListener('click', () => {
        state.solo = !state.solo;
        updateAllGains();
    });

    if (playBtn) { playBtn.disabled = false; playBtn.innerHTML = '&#9654;'; }
    updateGlobalSeekMax();
}

// --- Малювання хвильової форми через Canvas ---

function drawWaveform(trackId, audioBuffer) {
    const canvas = document.getElementById(`waveform-${trackId}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);
    const width = canvas.offsetWidth || 800;
    const height = canvas.height;
    const step = Math.ceil(data.length / width);

    canvas.width = width;
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#7c4dff');
    gradient.addColorStop(0.5, '#5c8aff');
    gradient.addColorStop(1, '#7c4dff');

    ctx.beginPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;

    for (let i = 0; i < width; i++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
            const sample = data[i * step + j] || 0;
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }
        const yLow = ((1 + min) / 2) * height;
        const yHigh = ((1 + max) / 2) * height;
        ctx.moveTo(i, yLow);
        ctx.lineTo(i, yHigh);
    }
    ctx.stroke();

    // Маркер позиції
    const state = trackStates[trackId];
    if (state) {
        drawPlayhead(trackId, canvas, state.trimStart, state.trimEnd, audioBuffer.duration);
    }
}

function drawPlayhead(trackId, canvas, trimStart, trimEnd, duration) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const x1 = (trimStart / duration) * w;
    const x2 = (trimEnd / duration) * w;

    ctx.fillStyle = 'rgba(124,77,255,0.15)';
    ctx.fillRect(x1, 0, x2 - x1, h);

    ctx.strokeStyle = 'rgba(124,77,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, h); ctx.stroke();
}

// --- Відтворення / зупинка доріжки ---

function playTrack(trackId) {
    const state = trackStates[trackId];
    console.log(`[play] id=${trackId} state=${state ? 'ok' : 'null'} ctx=${audioCtx.state} buffer=${state?.buffer ? 'ok' : 'null'}`);
    if (!state || state.playing) return;

    if (audioCtx.state === 'suspended') audioCtx.resume();

    const source = audioCtx.createBufferSource();
    source.buffer = state.buffer;
    source.playbackRate.value = state.playbackRate;

    // Побудова ланцюга ефектів
    let lastNode = source;

    if (state.bassEnabled) {
        const bass = audioCtx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = state.bassFrequency;
        bass.gain.value = state.bassGain;
        lastNode.connect(bass);
        lastNode = bass;
    }

    if (state.eqEnabled) {
        const eqLow = audioCtx.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.value = 200;
        eqLow.gain.value = state.eqLow;
        const eqMid = audioCtx.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.value = 1000;
        eqMid.Q.value = 1;
        eqMid.gain.value = state.eqMid;
        const eqHigh = audioCtx.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.value = 4000;
        eqHigh.gain.value = state.eqHigh;
        lastNode.connect(eqLow);
        eqLow.connect(eqMid);
        eqMid.connect(eqHigh);
        lastNode = eqHigh;
    }

    if (state.compressorEnabled) {
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = state.compressorThreshold;
        comp.ratio.value = state.compressorRatio;
        comp.knee.value = 10;
        comp.attack.value = 0.003;
        comp.release.value = 0.1;
        lastNode.connect(comp);
        lastNode = comp;
    }

    if (state.delayEnabled) {
        const delay = audioCtx.createDelay(5.0);
        delay.delayTime.value = state.delayTime;
        const feedbackGain = audioCtx.createGain();
        feedbackGain.gain.value = state.delayFeedback;
        lastNode.connect(delay);
        delay.connect(feedbackGain);
        feedbackGain.connect(delay);
        lastNode = delay;
    }

    if (state.reverbEnabled && state.reverbBuffer) {
        const convolver = audioCtx.createConvolver();
        convolver.buffer = state.reverbBuffer;
        const wetGain = audioCtx.createGain();
        wetGain.gain.value = state.reverbWet;
        const dryGain = audioCtx.createGain();
        dryGain.gain.value = 1 - state.reverbWet;
        lastNode.connect(convolver);
        convolver.connect(wetGain);
        lastNode.connect(dryGain);
        wetGain.connect(state.gainNode);
        dryGain.connect(state.gainNode);
        lastNode = null;
    }

    if (lastNode) lastNode.connect(state.gainNode);

    if (state.seekPosition >= state.trimEnd) {
        state.seekPosition = state.trimStart;
        const _sl = document.getElementById(`seek-${trackId}`);
        const _te = document.getElementById(`seek-time-${trackId}`);
        if (_sl) _sl.value = state.trimStart;
        if (_te) _te.textContent = formatTime(state.trimStart);
    }
    const offset = Math.max(state.trimStart, Math.min(state.seekPosition, state.trimEnd));
    const duration = state.trimEnd - offset;
    if (duration <= 0) return;
    source.start(0, offset, duration);

    state.source = source;
    state.playing = true;
    state.startTime = audioCtx.currentTime;
    state.startOffset = offset;

    source.onended = () => {
        if (state.source !== source) return;
        if (!state.playing) return;
        state.playing = false;
        state.seekPosition = state.trimStart;
        const slider = document.getElementById(`seek-${trackId}`);
        const timeEl = document.getElementById(`seek-time-${trackId}`);
        if (slider) slider.value = state.trimStart;
        if (timeEl) timeEl.textContent = formatTime(state.trimStart);
        document.querySelector(`.track-item[data-track-id="${trackId}"]`)?.classList.remove('playing');
        const playBtn = document.querySelector(`.track-play-btn[data-track-id="${trackId}"]`);
        if (playBtn) playBtn.innerHTML = '&#9654;';
    };

    document.querySelector(`.track-item[data-track-id="${trackId}"]`)?.classList.add('playing');
    const playBtnStart = document.querySelector(`.track-play-btn[data-track-id="${trackId}"]`);
    if (playBtnStart) playBtnStart.innerHTML = '&#9632;';
}

function stopTrack(trackId) {
    const state = trackStates[trackId];
    if (!state || !state.playing) return;
    // Зберігаємо поточну позицію перед зупинкою
    state.seekPosition = Math.min(
        state.startOffset + (audioCtx.currentTime - state.startTime) * state.playbackRate,
        state.trimEnd
    );
    state.playing = false;
    try { state.source.stop(); } catch (_) {}
    document.querySelector(`.track-item[data-track-id="${trackId}"]`)?.classList.remove('playing');
    const playBtn = document.querySelector(`.track-play-btn[data-track-id="${trackId}"]`);
    if (playBtn) playBtn.innerHTML = '&#9654;';
}

// --- Кнопки Play All / Stop All ---

document.getElementById('play-all-btn')?.addEventListener('click', async () => {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    // Зупиняємо всі (у т.ч. ті, що грають окремо) і синхронізуємо до глобальної позиції
    Object.keys(trackStates).forEach(id => { if (trackStates[id].playing) stopTrack(id); });
    Object.keys(trackStates).forEach(id => {
        const s = trackStates[id];
        if (s) s.seekPosition = Math.max(s.trimStart, Math.min(globalSeekPos, s.trimEnd));
    });
    Object.keys(trackStates).forEach(id => playTrack(id));
    startTimer();
});

document.getElementById('stop-all-btn')?.addEventListener('click', () => {
    // Зберігаємо глобальну позицію до зупинки
    const playingState = Object.values(trackStates).find(s => s.playing);
    if (playingState) {
        globalSeekPos = Math.min(
            playingState.startOffset + (audioCtx.currentTime - playingState.startTime) * playingState.playbackRate,
            playingState.trimEnd
        );
        const gSlider = document.getElementById('global-seek-slider');
        const gTime = document.getElementById('global-seek-time');
        if (gSlider) gSlider.value = globalSeekPos;
        if (gTime) gTime.textContent = formatTime(globalSeekPos);
    }
    Object.keys(trackStates).forEach(id => stopTrack(id));
    stopTimer();
});

// Глобальний seek-слайдер
document.getElementById('global-seek-slider')?.addEventListener('input', (e) => {
    globalSeekPos = parseFloat(e.target.value);
    const gTime = document.getElementById('global-seek-time');
    if (gTime) gTime.textContent = formatTime(globalSeekPos);
    const anyPlaying = Object.values(trackStates).some(s => s.playing);
    if (anyPlaying) {
        Object.keys(trackStates).forEach(id => stopTrack(id));
        Object.keys(trackStates).forEach(id => {
            const s = trackStates[id];
            if (s) s.seekPosition = Math.max(s.trimStart, Math.min(globalSeekPos, s.trimEnd));
        });
        Object.keys(trackStates).forEach(id => playTrack(id));
    }
});

// --- Таймер відтворення ---

let timerInterval = null;
let timerStart = 0;

function startTimer() {
    timerStart = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - timerStart) / 1000;
        const min = Math.floor(elapsed / 60);
        const sec = Math.floor(elapsed % 60).toString().padStart(2, '0');
        const display = document.getElementById('playback-time');
        if (display) display.textContent = `${min}:${sec}`;
    }, 250);
}

function stopTimer() {
    clearInterval(timerInterval);
    const display = document.getElementById('playback-time');
    if (display) display.textContent = '0:00';
}

// --- Гучність ---

document.querySelectorAll('.volume-slider').forEach(slider => {
    slider.addEventListener('input', async (e) => {
        const trackId = e.target.dataset.trackId;
        const value = parseFloat(e.target.value);
        if (trackStates[trackId]) {
            trackStates[trackId].volume = value;
            updateAllGains();
        }
        // Зберігаємо на сервері
        await fetch(`/api/tracks/${trackId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify({ volume: value }),
        });
    });
});

// --- Ефекти ---

document.querySelectorAll('.effect-cb').forEach(cb => {
    cb.addEventListener('change', async (e) => {
        const trackId = e.target.dataset.trackId;
        const effect = e.target.dataset.effect;
        const state = trackStates[trackId];
        if (!state) return;

        if (effect === 'reverb') {
            state.reverbEnabled = e.target.checked;
            if (state.reverbEnabled && !state.reverbBuffer) {
                state.reverbBuffer = await createReverbBuffer(audioCtx, state.reverbDecay);
            }
        } else if (effect === 'bass') {
            state.bassEnabled = e.target.checked;
        } else if (effect === 'compressor') {
            state.compressorEnabled = e.target.checked;
        } else if (effect === 'delay') {
            state.delayEnabled = e.target.checked;
        } else if (effect === 'eq') {
            state.eqEnabled = e.target.checked;
        }

        const paramsPanel = document.getElementById(`fx-${trackId}-${effect}`);
        if (paramsPanel) paramsPanel.style.display = e.target.checked ? 'flex' : 'none';

        if (state.playing) { stopTrack(trackId); playTrack(trackId); }
    });
});

bindFxSliders(document);

// Синтетичний impulse response для reverb
async function createReverbBuffer(ctx, decay = 2) {
    const length = Math.ceil(ctx.sampleRate * decay);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
    }
    return buffer;
}

function formatParamValue(effect, param, val) {
    if (param === 'decay' || param === 'time') return `${val.toFixed(2)}s`;
    if (param === 'wet' || param === 'feedback') return `${Math.round(val * 100)}%`;
    if (param === 'ratio') return `${val}:1`;
    if (param === 'frequency') return `${val}Hz`;
    return `${val}dB`;
}

function bindFxSliders(root) {
    root.querySelectorAll('.fx-slider').forEach(sl => {
        sl.addEventListener('input', async (e) => {
            const trackId = e.target.dataset.trackId;
            const effect = e.target.dataset.effect;
            const param = e.target.dataset.param;
            const val = parseFloat(e.target.value);
            const state = trackStates[trackId];
            if (!state) return;
            const valEl = document.getElementById(`fx-val-${trackId}-${effect}-${param}`);
            if (valEl) valEl.textContent = formatParamValue(effect, param, val);
            if (effect === 'reverb') {
                if (param === 'decay') { state.reverbDecay = val; state.reverbBuffer = await createReverbBuffer(audioCtx, val); }
                else state.reverbWet = val;
            } else if (effect === 'bass') {
                if (param === 'gain') state.bassGain = val;
                else state.bassFrequency = val;
            } else if (effect === 'compressor') {
                if (param === 'threshold') state.compressorThreshold = val;
                else state.compressorRatio = val;
            } else if (effect === 'delay') {
                if (param === 'time') state.delayTime = val;
                else state.delayFeedback = val;
            } else if (effect === 'eq') {
                if (param === 'low') state.eqLow = val;
                else if (param === 'mid') state.eqMid = val;
                else state.eqHigh = val;
            }
            if (state.playing) { stopTrack(trackId); playTrack(trackId); }
        });
    });
}

// --- Trim ---

document.querySelectorAll('.trim-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const trackId = e.target.dataset.trackId;
        const trimPanel = document.getElementById(`trim-${trackId}`);
        if (trimPanel) trimPanel.style.display = trimPanel.style.display === 'none' ? 'flex' : 'none';
    });
});

document.querySelectorAll('.reset-trim-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const trackId = e.target.dataset.trackId;
        const state = trackStates[trackId];
        const panel = document.getElementById(`trim-${trackId}`);
        if (!state || !panel) return;

        if (state.playing) stopTrack(trackId);

        state.trimStart = 0;
        state.trimEnd = state.buffer.duration;
        state.seekPosition = 0;

        panel.querySelector('.trim-start').value = 0;
        panel.querySelector('.trim-end').value = state.buffer.duration.toFixed(1);

        const slider = document.getElementById(`seek-${trackId}`);
        const timeEl = document.getElementById(`seek-time-${trackId}`);
        if (slider) slider.value = 0;
        if (timeEl) timeEl.textContent = formatTime(0);

        drawWaveform(trackId, state.buffer);
    });
});

document.querySelectorAll('.apply-trim-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const trackId = e.target.dataset.trackId;
        const state = trackStates[trackId];
        const panel = document.getElementById(`trim-${trackId}`);
        if (!state || !panel) return;

        if (state.playing) stopTrack(trackId);

        const start = parseFloat(panel.querySelector('.trim-start').value) || 0;
        const end = parseFloat(panel.querySelector('.trim-end').value) || state.buffer.duration;
        state.trimStart = Math.max(0, start);
        state.trimEnd = Math.min(end, state.buffer.duration);
        state.seekPosition = state.trimStart;

        const slider = document.getElementById(`seek-${trackId}`);
        const timeEl = document.getElementById(`seek-time-${trackId}`);
        if (slider) slider.value = state.trimStart;
        if (timeEl) timeEl.textContent = formatTime(state.trimStart);

        drawWaveform(trackId, state.buffer);
    });
});

// --- Видалення доріжки ---

document.querySelectorAll('.track-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const trackId = e.target.dataset.trackId;
        if (!confirm('Видалити цю доріжку?')) return;

        stopTrack(trackId);
        const resp = await fetch(`/api/tracks/${trackId}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': CSRF_TOKEN },
        });
        if (resp.ok) {
            delete trackStates[trackId];
            document.querySelector(`.track-item[data-track-id="${trackId}"]`)?.remove();
        }
    });
});

// --- Завантаження нової доріжки ---

const fileInput = document.getElementById('track-file');
const uploadBtn = document.getElementById('upload-btn');
const fileNameLabel = document.getElementById('file-name');

fileInput?.addEventListener('change', () => {
    if (fileInput.files.length) {
        fileNameLabel.textContent = fileInput.files[0].name;
        uploadBtn.style.display = 'block';
    }
});

uploadBtn?.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const titleInput = document.getElementById('track-title');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', titleInput.value || file.name.replace(/\.[^/.]+$/, ''));

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Завантажую...';

    const resp = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF_TOKEN },
        body: formData,
    });

    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Завантажити';

    if (resp.ok) {
        const track = await resp.json();
        appendTrackToDOM(track);
        fileInput.value = '';
        titleInput.value = '';
        fileNameLabel.textContent = 'MP3, WAV, FLAC — до 50 МБ';
        uploadBtn.style.display = 'none';

        const emptyMsg = document.getElementById('empty-tracks');
        if (emptyMsg) emptyMsg.remove();
    } else {
        alert('Помилка при завантаженні файлу.');
    }
});

function appendTrackToDOM(track) {
    const container = document.getElementById('tracks-container');
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.trackId = track.id;
    div.dataset.src = track.file_url;
    div.innerHTML = `
        <div class="track-header">
            <span class="track-title">${track.title}</span>
            <div class="track-controls">
                <label class="track-volume-label">Гучність</label>
                <input type="range" class="volume-slider" min="0" max="1" step="0.01"
                       value="${track.volume}" data-track-id="${track.id}">
                <button class="btn btn--icon track-play-btn" data-track-id="${track.id}" title="Грати">&#9654;</button>
                <button class="btn btn--icon track-mute-btn" data-track-id="${track.id}" title="Приглушити">M</button>
                <button class="btn btn--icon track-solo-btn" data-track-id="${track.id}" title="Соло">S</button>
                <button class="btn btn--icon btn--danger track-delete-btn"
                        data-track-id="${track.id}" title="Видалити">&#10005;</button>
            </div>
        </div>
        <div class="effects-bar">
            <label class="effect-toggle">
                <input type="checkbox" class="effect-cb" data-effect="reverb" data-track-id="${track.id}">
                Reverb
            </label>
            <label class="effect-toggle">
                <input type="checkbox" class="effect-cb" data-effect="bass" data-track-id="${track.id}">
                Bass Boost
            </label>
            <label class="effect-toggle">
                <input type="checkbox" class="effect-cb" data-effect="compressor" data-track-id="${track.id}">
                Compressor
            </label>
            <label class="effect-toggle">
                <input type="checkbox" class="effect-cb" data-effect="delay" data-track-id="${track.id}">
                Delay
            </label>
            <label class="effect-toggle">
                <input type="checkbox" class="effect-cb" data-effect="eq" data-track-id="${track.id}">
                EQ
            </label>
            <label class="effect-toggle">
                Швидкість
                <select class="speed-select" data-track-id="${track.id}">
                    <option value="0.5">0.5×</option>
                    <option value="0.75">0.75×</option>
                    <option value="1" selected>1×</option>
                    <option value="1.25">1.25×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                </select>
            </label>
            <button class="btn btn--xs btn--ghost trim-btn" data-track-id="${track.id}">Trim</button>
        </div>
        <div class="effect-params" id="fx-${track.id}-reverb" style="display:none">
            <span class="fx-label">Затухання</span>
            <input type="range" class="fx-slider" data-effect="reverb" data-param="decay" data-track-id="${track.id}" min="0.5" max="5" step="0.1" value="2">
            <span class="fx-val" id="fx-val-${track.id}-reverb-decay">2.00s</span>
            <span class="fx-label">Wet</span>
            <input type="range" class="fx-slider" data-effect="reverb" data-param="wet" data-track-id="${track.id}" min="0" max="1" step="0.05" value="0.5">
            <span class="fx-val" id="fx-val-${track.id}-reverb-wet">50%</span>
        </div>
        <div class="effect-params" id="fx-${track.id}-bass" style="display:none">
            <span class="fx-label">Підсилення</span>
            <input type="range" class="fx-slider" data-effect="bass" data-param="gain" data-track-id="${track.id}" min="0" max="20" step="1" value="10">
            <span class="fx-val" id="fx-val-${track.id}-bass-gain">10dB</span>
            <span class="fx-label">Частота</span>
            <input type="range" class="fx-slider" data-effect="bass" data-param="frequency" data-track-id="${track.id}" min="60" max="500" step="10" value="200">
            <span class="fx-val" id="fx-val-${track.id}-bass-frequency">200Hz</span>
        </div>
        <div class="effect-params" id="fx-${track.id}-compressor" style="display:none">
            <span class="fx-label">Поріг</span>
            <input type="range" class="fx-slider" data-effect="compressor" data-param="threshold" data-track-id="${track.id}" min="-60" max="0" step="1" value="-24">
            <span class="fx-val" id="fx-val-${track.id}-compressor-threshold">-24dB</span>
            <span class="fx-label">Стиснення</span>
            <input type="range" class="fx-slider" data-effect="compressor" data-param="ratio" data-track-id="${track.id}" min="1" max="20" step="1" value="4">
            <span class="fx-val" id="fx-val-${track.id}-compressor-ratio">4:1</span>
        </div>
        <div class="effect-params" id="fx-${track.id}-delay" style="display:none">
            <span class="fx-label">Час</span>
            <input type="range" class="fx-slider" data-effect="delay" data-param="time" data-track-id="${track.id}" min="0.05" max="1" step="0.05" value="0.3">
            <span class="fx-val" id="fx-val-${track.id}-delay-time">0.30s</span>
            <span class="fx-label">Відлуння</span>
            <input type="range" class="fx-slider" data-effect="delay" data-param="feedback" data-track-id="${track.id}" min="0" max="0.9" step="0.05" value="0.4">
            <span class="fx-val" id="fx-val-${track.id}-delay-feedback">40%</span>
        </div>
        <div class="effect-params" id="fx-${track.id}-eq" style="display:none">
            <span class="fx-label">Низ</span>
            <input type="range" class="fx-slider" data-effect="eq" data-param="low" data-track-id="${track.id}" min="-12" max="12" step="1" value="0">
            <span class="fx-val" id="fx-val-${track.id}-eq-low">0dB</span>
            <span class="fx-label">Середина</span>
            <input type="range" class="fx-slider" data-effect="eq" data-param="mid" data-track-id="${track.id}" min="-12" max="12" step="1" value="0">
            <span class="fx-val" id="fx-val-${track.id}-eq-mid">0dB</span>
            <span class="fx-label">Верхи</span>
            <input type="range" class="fx-slider" data-effect="eq" data-param="high" data-track-id="${track.id}" min="-12" max="12" step="1" value="0">
            <span class="fx-val" id="fx-val-${track.id}-eq-high">0dB</span>
        </div>
        <canvas class="waveform-canvas" id="waveform-${track.id}" height="80"></canvas>
        <div class="seek-bar">
            <span class="seek-time" id="seek-time-${track.id}">0:00</span>
            <input type="range" class="seek-slider" id="seek-${track.id}"
                   data-track-id="${track.id}" min="0" max="100" step="0.1" value="0">
            <span class="seek-duration" id="seek-dur-${track.id}">0:00</span>
        </div>
        <div class="trim-controls" id="trim-${track.id}" style="display:none">
            <label class="form-label-sm">Від (сек): <input type="number" class="trim-start" value="0" min="0" step="0.1" style="width:70px"></label>
            <label class="form-label-sm">До (сек): <input type="number" class="trim-end" value="10" min="0" step="0.1" style="width:70px"></label>
            <button class="btn btn--xs btn--accent apply-trim-btn" data-track-id="${track.id}">Застосувати</button>
            <button class="btn btn--xs btn--ghost reset-trim-btn" data-track-id="${track.id}">&#8635; Скинути</button>
        </div>
    `;
    container.appendChild(div);

    const newPlayBtn = div.querySelector('.track-play-btn');
    if (newPlayBtn) { newPlayBtn.disabled = true; newPlayBtn.textContent = '...'; }

    // Підключити обробники для нової доріжки
    div.querySelector('.volume-slider').addEventListener('input', async (e) => {
        const id = e.target.dataset.trackId;
        const val = parseFloat(e.target.value);
        if (trackStates[id]) { trackStates[id].volume = val; updateAllGains(); }
        await fetch(`/api/tracks/${id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify({ volume: val }),
        });
    });

    div.querySelector('.track-delete-btn').addEventListener('click', async () => {
        const id = track.id;
        if (!confirm('Видалити цю доріжку?')) return;
        stopTrack(String(id));
        const r = await fetch(`/api/tracks/${id}/`, { method: 'DELETE', headers: { 'X-CSRFToken': CSRF_TOKEN } });
        if (r.ok) { delete trackStates[String(id)]; div.remove(); }
    });

    div.querySelector('.trim-btn').addEventListener('click', () => {
        const p = document.getElementById(`trim-${track.id}`);
        if (p) p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    });

    div.querySelector('.apply-trim-btn').addEventListener('click', () => {
        const id = String(track.id);
        const state = trackStates[id];
        const panel = document.getElementById(`trim-${id}`);
        if (!state || !panel) return;
        if (state.playing) stopTrack(id);

        state.trimStart = Math.max(0, parseFloat(panel.querySelector('.trim-start').value) || 0);
        state.trimEnd = Math.min(parseFloat(panel.querySelector('.trim-end').value) || state.buffer.duration, state.buffer.duration);
        state.seekPosition = state.trimStart;
        const slider = document.getElementById(`seek-${id}`);
        const timeEl = document.getElementById(`seek-time-${id}`);
        if (slider) slider.value = state.trimStart;
        if (timeEl) timeEl.textContent = formatTime(state.trimStart);
        drawWaveform(id, state.buffer);
    });

    div.querySelector('.reset-trim-btn').addEventListener('click', () => {
        const id = String(track.id);
        const state = trackStates[id];
        const panel = document.getElementById(`trim-${id}`);
        if (!state || !panel) return;

        if (state.playing) stopTrack(id);

        state.trimStart = 0;
        state.trimEnd = state.buffer.duration;
        state.seekPosition = 0;

        panel.querySelector('.trim-start').value = 0;
        panel.querySelector('.trim-end').value = state.buffer.duration.toFixed(1);

        const slider = document.getElementById(`seek-${id}`);
        const timeEl = document.getElementById(`seek-time-${id}`);
        if (slider) slider.value = 0;
        if (timeEl) timeEl.textContent = formatTime(0);

        drawWaveform(id, state.buffer);
    });

    div.querySelectorAll('.effect-cb').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const id = e.target.dataset.trackId;
            const effect = e.target.dataset.effect;
            const state = trackStates[id];
            if (!state) return;
            if (effect === 'reverb') {
                state.reverbEnabled = e.target.checked;
                if (state.reverbEnabled && !state.reverbBuffer) {
                    state.reverbBuffer = await createReverbBuffer(audioCtx, state.reverbDecay);
                }
            } else if (effect === 'bass') {
                state.bassEnabled = e.target.checked;
            } else if (effect === 'compressor') {
                state.compressorEnabled = e.target.checked;
            } else if (effect === 'delay') {
                state.delayEnabled = e.target.checked;
            } else if (effect === 'eq') {
                state.eqEnabled = e.target.checked;
            }
            const paramsPanel = document.getElementById(`fx-${id}-${effect}`);
            if (paramsPanel) paramsPanel.style.display = e.target.checked ? 'flex' : 'none';
            if (state.playing) { stopTrack(id); playTrack(id); }
        });
    });

    bindFxSliders(div);

    initTrack(String(track.id), track.file_url, div);
}

// --- Експорт через OfflineAudioContext ---

document.getElementById('export-btn')?.addEventListener('click', async () => {
    const format = document.getElementById('export-format')?.value || 'wav';
    const ids = Object.keys(trackStates);
    if (!ids.length) { alert('Немає доріжок для експорту.'); return; }

    const maxDuration = Math.max(...ids.map(id => {
        const s = trackStates[id];
        return (s.trimEnd - s.trimStart);
    }));

    const offlineCtx = new OfflineAudioContext(2, Math.ceil(maxDuration * audioCtx.sampleRate), audioCtx.sampleRate);

    for (const id of ids) {
        const state = trackStates[id];
        const src = offlineCtx.createBufferSource();
        src.buffer = state.buffer;

        const gain = offlineCtx.createGain();
        gain.gain.value = state.volume;
        gain.connect(offlineCtx.destination);

        let last = src;

        if (state.bassEnabled) {
            const bass = offlineCtx.createBiquadFilter();
            bass.type = 'lowshelf';
            bass.frequency.value = state.bassFrequency;
            bass.gain.value = state.bassGain;
            last.connect(bass);
            last = bass;
        }

        if (state.eqEnabled) {
            const eqLow = offlineCtx.createBiquadFilter();
            eqLow.type = 'lowshelf';
            eqLow.frequency.value = 200;
            eqLow.gain.value = state.eqLow;
            const eqMid = offlineCtx.createBiquadFilter();
            eqMid.type = 'peaking';
            eqMid.frequency.value = 1000;
            eqMid.Q.value = 1;
            eqMid.gain.value = state.eqMid;
            const eqHigh = offlineCtx.createBiquadFilter();
            eqHigh.type = 'highshelf';
            eqHigh.frequency.value = 4000;
            eqHigh.gain.value = state.eqHigh;
            last.connect(eqLow);
            eqLow.connect(eqMid);
            eqMid.connect(eqHigh);
            last = eqHigh;
        }

        if (state.compressorEnabled) {
            const comp = offlineCtx.createDynamicsCompressor();
            comp.threshold.value = state.compressorThreshold;
            comp.ratio.value = state.compressorRatio;
            comp.knee.value = 10;
            comp.attack.value = 0.003;
            comp.release.value = 0.1;
            last.connect(comp);
            last = comp;
        }

        if (state.delayEnabled) {
            const delay = offlineCtx.createDelay(5.0);
            delay.delayTime.value = state.delayTime;
            const feedbackGain = offlineCtx.createGain();
            feedbackGain.gain.value = state.delayFeedback;
            last.connect(delay);
            delay.connect(feedbackGain);
            feedbackGain.connect(delay);
            last = delay;
        }

        if (state.reverbEnabled && state.reverbBuffer) {
            const convolver = offlineCtx.createConvolver();
            convolver.buffer = state.reverbBuffer;
            const wetGain = offlineCtx.createGain();
            wetGain.gain.value = state.reverbWet;
            const dryGain = offlineCtx.createGain();
            dryGain.gain.value = 1 - state.reverbWet;
            last.connect(convolver);
            convolver.connect(wetGain);
            last.connect(dryGain);
            wetGain.connect(gain);
            dryGain.connect(gain);
            last = null;
        }

        if (last) last.connect(gain);
        src.start(0, state.trimStart, state.trimEnd - state.trimStart);
    }

    const renderedBuffer = await offlineCtx.startRendering();

    let blob, filename;
    if (format === 'mp3') {
        blob = audioBufferToMp3(renderedBuffer);
        filename = `mix_${PROJECT_ID}.mp3`;
    } else {
        blob = audioBufferToWav(renderedBuffer);
        filename = `mix_${PROJECT_ID}.wav`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
});

// Конвертація AudioBuffer у WAV Blob
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    function writeUint32(offset, val) { view.setUint32(offset, val, true); }
    function writeUint16(offset, val) { view.setUint16(offset, val, true); }

    writeString(0, 'RIFF');
    writeUint32(4, length - 8);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    writeUint32(16, 16);
    writeUint16(20, 1);
    writeUint16(22, numChannels);
    writeUint32(24, sampleRate);
    writeUint32(28, sampleRate * numChannels * 2);
    writeUint16(32, numChannels * 2);
    writeUint16(34, 16);
    writeString(36, 'data');
    writeUint32(40, buffer.length * numChannels * 2);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Конвертація AudioBuffer у MP3 Blob через lamejs
function audioBufferToMp3(buffer, bitrate = 128) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);
    const blockSize = 1152;
    const mp3Data = [];

    const left = floatTo16Bit(buffer.getChannelData(0));
    const right = numChannels > 1 ? floatTo16Bit(buffer.getChannelData(1)) : left;

    for (let i = 0; i < buffer.length; i += blockSize) {
        const l = left.subarray(i, i + blockSize);
        const r = right.subarray(i, i + blockSize);
        const chunk = numChannels > 1 ? mp3encoder.encodeBuffer(l, r) : mp3encoder.encodeBuffer(l);
        if (chunk.length) mp3Data.push(chunk);
    }
    const tail = mp3encoder.flush();
    if (tail.length) mp3Data.push(tail);

    return new Blob(mp3Data, { type: 'audio/mp3' });
}

function floatTo16Bit(floatArray) {
    const result = new Int16Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
        const s = Math.max(-1, Math.min(1, floatArray[i]));
        result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result;
}
