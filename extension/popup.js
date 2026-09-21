/**
 * CFO CBMERJ — Rumo ao CFO
 * Extension Popup Controller (Manifest V3)
 * Preserves all business logic, timer communication, leveling calculation and platform synchronization.
 */

// Safe wrapper for chrome.storage.local to allow standalone browser preview & extension runtime
const storage = {
  get: async (keys) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local.get(keys);
    }
    const result = {};
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      try {
        const item = localStorage.getItem(key);
        if (item) result[key] = JSON.parse(item);
      } catch {
        /* fallback empty */
      }
    }
    return result;
  },
  set: async (items) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local.set(items);
    }
    for (const [k, v] of Object.entries(items)) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* fallback ignore */
      }
    }
  },
};

const sendRuntimeMessage = (message, callback) => {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(message, callback);
  } else if (callback) {
    if (message.type === 'TIMER_START') {
      const now = Date.now();
      const prev = state.timer || {};
      const prevAcc = Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0;
      const prevRestAcc = Number(prev.restAccumulatedMs) || 0;
      const restDelta = prev.status === 'PAUSED' && prev.restStartTime ? Math.max(0, now - prev.restStartTime) : 0;
      const newTimer = {
        status: 'RUNNING',
        accumulatedMs: prevAcc,
        accumulatedTime: prevAcc,
        startTime: now,
        restAccumulatedMs: prevRestAcc + restDelta,
        restStartTime: null,
        subjectId: message.payload?.subjectId || prev.subjectId || 'geral',
        subjectName: message.payload?.subjectName || prev.subjectName || 'Estudo Geral',
      };
      storage.set({ cfo_ext_timer: newTimer });
      callback({ success: true, timer: newTimer });
    } else if (message.type === 'TIMER_PAUSE') {
      const prev = state.timer || {};
      const now = Date.now();
      const elapsed = prev.status === 'RUNNING' && prev.startTime ? Math.max(0, now - prev.startTime) : 0;
      const prevAcc = Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0;
      const newAcc = prevAcc + elapsed;
      const prevRestAcc = Number(prev.restAccumulatedMs) || 0;
      const newTimer = {
        ...prev,
        status: 'PAUSED',
        accumulatedMs: newAcc,
        accumulatedTime: newAcc,
        startTime: null,
        restStartTime: now,
        restAccumulatedMs: prevRestAcc,
      };
      storage.set({ cfo_ext_timer: newTimer });
      callback({ success: true, timer: newTimer });
    } else if (message.type === 'TIMER_RESET') {
      const newTimer = {
        status: 'STOPPED',
        accumulatedMs: 0,
        accumulatedTime: 0,
        startTime: null,
        restAccumulatedMs: 0,
        restStartTime: null,
        subjectId: 'geral',
        subjectName: 'Estudo Geral',
      };
      storage.set({ cfo_ext_timer: newTimer });
      callback({ success: true, timer: newTimer });
    } else if (message.type === 'GET_TIMER_STATE') {
      storage.get(['cfo_ext_timer']).then((res) => {
        const raw = res.cfo_ext_timer || state.timer;
        const acc = Number(raw.accumulatedMs ?? raw.accumulatedTime) || 0;
        callback({ success: true, timer: { ...raw, accumulatedMs: acc, accumulatedTime: acc } });
      });
    } else {
      callback({ success: true, timer: state.timer });
    }
  }
};


const state = {
  activeTab: 'timer',
  serverOffset: 0,
  settings: {
    serverUrl: 'https://cfo-oficial-agorasim.onrender.com',
    token: '',
  },
  timer: {
    status: 'STOPPED',
    accumulatedMs: 0,
    startTime: null,
    restAccumulatedMs: 0,
    restStartTime: null,
    subjectId: 'geral',
    subjectName: 'Estudo Geral',
  },
  leveling: {
    total: 30,
    answers: [],
    mode: 'live',
  },
  isConnected: false,
};

function getServerNow() {
  return Date.now() + (Number(state.serverOffset) || 0);
}

let timerInterval = null;

const TABLER_ICONS = {
  play: '<svg class="tabler-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13 -8z"/></svg>',
  pause: '<svg class="tabler-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/></svg>',
  sun: '<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
  moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>',
  eye: '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
  eyeOff: '<path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87"/><path d="M3 3l18 18"/>',
};

const els = {
  // Navigation & Shell
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  connectionBadge: document.getElementById('connection-badge'),
  connectionText: document.getElementById('connection-text'),
  themeToggle: document.getElementById('btn-theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),

  // Timer Controls
  timerSubject: document.getElementById('timer-subject'),
  timerDisplay: document.getElementById('timer-display'),
  timerStatusSub: document.getElementById('timer-status-sub'),
  timerSubjectName: document.getElementById('timer-subject-name'),
  timerDisplayContainer: document.getElementById('timer-display-container'),
  btnTimerToggle: document.getElementById('btn-timer-toggle'),
  timerToggleIcon: document.getElementById('timer-toggle-icon'),
  timerToggleLabel: document.getElementById('timer-toggle-label'),
  btnTimerSave: document.getElementById('btn-timer-save'),
  btnTimerReset: document.getElementById('btn-timer-reset'),

  // Recovery Pill & Balanço Foco vs Descanso
  timerRestPill: document.getElementById('timer-rest-pill'),
  restZoneBadge: document.getElementById('rest-zone-badge'),
  restTimerDisplay: document.getElementById('rest-timer-display'),
  timerRatioCard: document.getElementById('timer-ratio-card'),
  ratioPercentage: document.getElementById('ratio-percentage'),
  ratioFillStudy: document.getElementById('ratio-fill-study'),
  ratioFillRest: document.getElementById('ratio-fill-rest'),
  ratioStudyTime: document.getElementById('ratio-study-time'),
  ratioRestTime: document.getElementById('ratio-rest-time'),

  // Leveling Controls
  levelingStatusLabel: document.getElementById('leveling-status-label'),
  levelingTotal: document.getElementById('leveling-total'),
  statProgress: document.getElementById('stat-progress'),
  statCorrect: document.getElementById('stat-correct'),
  statWrong: document.getElementById('stat-wrong'),
  statAccuracy: document.getElementById('stat-accuracy'),
  progressFill: document.getElementById('progress-fill'),
  btnQuestionCorrect: document.getElementById('btn-question-correct'),
  btnQuestionWrong: document.getElementById('btn-question-wrong'),
  btnLevelingUndo: document.getElementById('btn-leveling-undo'),
  btnLevelingReset: document.getElementById('btn-leveling-reset'),
  answerSheetGrid: document.getElementById('answer-sheet-grid'),
  result: document.getElementById('leveling-result'),
  resultAccuracy: document.getElementById('result-accuracy'),
  resultSummary: document.getElementById('result-summary'),

  // Settings & Feedback
  formSettings: document.getElementById('form-settings'),
  serverUrl: document.getElementById('server-url'),
  authToken: document.getElementById('auth-token'),
  toggleToken: document.getElementById('btn-toggle-token'),
  tokenEyeIcon: document.getElementById('token-eye-icon'),
  saveSettings: document.getElementById('btn-save-settings'),
  settingsFeedback: document.getElementById('settings-feedback'),
  toast: document.getElementById('toast'),
};

function formatTime(ms) {
  const safeMs = typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : 0;
  const seconds = Math.floor(safeMs / 1000);
  const pad = (value) => String(value).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function showToast(message, type = 'default', duration = 2500) {
  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), duration);
}

function setTheme(theme) {
  const apply = () => {
    document.documentElement.dataset.theme = theme;
    const isLight = theme === 'light';
    els.themeToggle.setAttribute('aria-label', isLight ? 'Ativar tema escuro' : 'Ativar tema claro');
    els.themeToggle.title = els.themeToggle.getAttribute('aria-label');
    els.themeIcon.innerHTML = isLight ? TABLER_ICONS.moon : TABLER_ICONS.sun;
  };

  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  els.tabBtns.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  els.tabContents.forEach((content) => {
    content.classList.toggle('active', content.id === `tab-content-${tabName}`);
  });
}

function getElapsedTimerMs() {
  const accumulated = Number(state.timer.accumulatedMs ?? state.timer.accumulatedTime) || 0;
  if (state.timer.status === 'RUNNING' && state.timer.startTime) {
    const start = Number(state.timer.startTime);
    return accumulated + (Number.isFinite(start) && start > 0 ? Math.max(0, getServerNow() - start) : 0);
  }
  return accumulated;
}

function getElapsedRestMs() {
  const accumulated = Number(state.timer.restAccumulatedMs) || 0;
  if (state.timer.status === 'PAUSED') {
    if (!state.timer.restStartTime) {
      state.timer.restStartTime = getServerNow();
    }
    return accumulated + Math.max(0, getServerNow() - state.timer.restStartTime);
  }
  return accumulated;
}

function updateTimerDisplay() {
  const studyMs = getElapsedTimerMs();
  const restMs = getElapsedRestMs();
  els.timerDisplay.textContent = formatTime(studyMs);
  els.timerSubjectName.textContent =
    state.timer.subjectName || els.timerSubject.options[els.timerSubject.selectedIndex].text;

  const running = state.timer.status === 'RUNNING';
  const paused = state.timer.status === 'PAUSED';
  els.timerDisplayContainer.classList.toggle('is-running', running);
  els.timerDisplay.classList.toggle('is-paused-dimmed', paused);

  if (running) {
    els.timerStatusSub.textContent = 'Em foco';
    els.timerToggleIcon.innerHTML = TABLER_ICONS.pause;
    els.timerToggleLabel.textContent = 'Pausar foco';
    if (els.timerRestPill) els.timerRestPill.classList.add('hidden');
  } else if (paused) {
    els.timerStatusSub.textContent = 'Em descanso';
    els.timerToggleIcon.innerHTML = TABLER_ICONS.play;
    els.timerToggleLabel.textContent = 'Retomar foco';

    // Atualiza Recovery Pill
    if (els.timerRestPill && els.restTimerDisplay && els.restZoneBadge) {
      els.timerRestPill.classList.remove('hidden');
      els.restTimerDisplay.textContent = formatTime(restMs);

      // Zonas: Verde (0-10m), Âmbar (10-20m), Vermelha (>20m)
      const tenMinMs = 10 * 60 * 1000;
      const twentyMinMs = 20 * 60 * 1000;
      els.timerRestPill.classList.remove('zone-amber', 'zone-red');
      els.restZoneBadge.classList.remove('zone-green', 'zone-amber', 'zone-red');

      const dot = els.timerRestPill.querySelector('.rest-pulse-dot');
      if (dot) dot.classList.remove('dot-amber', 'dot-red');

      if (restMs < tenMinMs) {
        els.restZoneBadge.textContent = 'Recuperação Ativa';
        els.restZoneBadge.classList.add('zone-green');
      } else if (restMs < twentyMinMs) {
        els.timerRestPill.classList.add('zone-amber');
        els.restZoneBadge.textContent = 'Limite Operacional';
        els.restZoneBadge.classList.add('zone-amber');
        if (dot) dot.classList.add('dot-amber');
      } else {
        els.timerRestPill.classList.add('zone-red');
        els.restZoneBadge.textContent = 'Descanso Excessivo';
        els.restZoneBadge.classList.add('zone-red');
        if (dot) dot.classList.add('dot-red');
      }
    }
  } else {
    els.timerStatusSub.textContent = 'Parado';
    els.timerToggleIcon.innerHTML = TABLER_ICONS.play;
    els.timerToggleLabel.textContent = 'Iniciar foco';
    if (els.timerRestPill) els.timerRestPill.classList.add('hidden');
  }

  // Atualiza Balanço Foco vs Descanso
  updateRatioDisplay(studyMs, restMs);
}

function updateRatioDisplay(studyMs, restMs) {
  if (!els.timerRatioCard) return;
  const currentStudyMs = typeof studyMs === 'number' ? studyMs : getElapsedTimerMs();
  const currentRestMs = typeof restMs === 'number' ? restMs : getElapsedRestMs();
  const totalCycleMs = currentStudyMs + currentRestMs;
  if (totalCycleMs > 0) {
    els.timerRatioCard.classList.remove('hidden');
    const studyPct = Math.max(0, Math.min(100, Math.round((currentStudyMs / totalCycleMs) * 100)));
    const restPct = 100 - studyPct;

    if (els.ratioPercentage) els.ratioPercentage.textContent = `${studyPct}% Foco · ${restPct}% Pausa`;
    if (els.ratioFillStudy) els.ratioFillStudy.style.width = `${studyPct}%`;
    if (els.ratioFillRest) els.ratioFillRest.style.width = `${restPct}%`;
    if (els.ratioStudyTime) els.ratioStudyTime.textContent = `Estudo: ${formatTime(currentStudyMs)}`;
    if (els.ratioRestTime) els.ratioRestTime.textContent = `Pausa: ${formatTime(currentRestMs)}`;
  } else {
    els.timerRatioCard.classList.add('hidden');
  }
}

function startTimerTicker() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (state.timer.status === 'RUNNING' || state.timer.status === 'PAUSED') {
      updateTimerDisplay();
    } else {
      stopTimerTicker();
    }
  }, 200);
}

function stopTimerTicker() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Reinicia o ticker quando a extensão volta a ficar visível (reopen do popup)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (state.timer.status === 'RUNNING' || state.timer.status === 'PAUSED') {
      startTimerTicker();
    }
  }
});

function updateLevelingUI() {
  const { total, answers } = state.leveling;
  const answered = answers.length;
  const correct = answers.filter((answer) => answer === 'correct').length;
  const wrong = answers.filter((answer) => answer === 'wrong').length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const required = Math.ceil(total * 0.8);

  const padAnswered = String(answered).padStart(2, '0');
  const padTotal = String(total).padStart(2, '0');
  els.statProgress.innerHTML = `${padAnswered} <small>de ${padTotal}</small>`;
  els.statCorrect.textContent = String(correct);
  els.statWrong.textContent = String(wrong);
  els.statAccuracy.textContent = `${accuracy}%`;
  els.progressFill.style.width = `${total ? Math.min(100, (answered / total) * 100) : 0}%`;

  if (answered === 0) {
    els.levelingStatusLabel.textContent = 'Inicie as resoluções';
  } else if (correct >= required) {
    els.levelingStatusLabel.textContent = 'Meta assegurada';
  } else {
    const diff = required - correct;
    els.levelingStatusLabel.textContent = `Faltam ${Math.max(0, diff)} acerto${diff > 1 ? 's' : ''}`;
  }

  els.answerSheetGrid.innerHTML = '';
  for (let index = 0; index < total; index += 1) {
    const dot = document.createElement('div');
    dot.className = `answer-dot${answers[index] ? ` ${answers[index]}` : ''}`;
    dot.textContent = String(index + 1);
    els.answerSheetGrid.appendChild(dot);
  }
}

async function persistLevelingState() {
  await storage.set({ cfo_ext_leveling: state.leveling });
  if (!state.settings.serverUrl || !state.settings.token) return;

  fetch(`${state.settings.serverUrl}/api/leveling/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.settings.token}`,
    },
    body: JSON.stringify({
      mode: 'live',
      total: state.leveling.total,
      answers: state.leveling.answers,
      started: state.leveling.answers.length > 0,
    }),
  }).catch(() => {});
}

function recordAnswer(type) {
  if (state.leveling.answers.length >= state.leveling.total) {
    return showToast('Bateria concluída. Inicie uma nova se desejar.');
  }

  state.leveling.answers.push(type);
  updateLevelingUI();
  persistLevelingState();

  if (state.leveling.answers.length === state.leveling.total) {
    const correct = state.leveling.answers.filter((answer) => answer === 'correct').length;
    els.result.hidden = false;
    els.resultAccuracy.textContent = `${Math.round((correct / state.leveling.total) * 100)}%`;
    els.resultSummary.textContent = `${correct} acertos · ${state.leveling.total - correct} erros`;

    const goalAchieved = correct >= Math.ceil(state.leveling.total * 0.8);
    showToast(
      goalAchieved ? 'Meta de 80% atingida no nivelamento.' : 'Bateria finalizada. Revise seus erros no site.',
      goalAchieved ? 'success' : 'default'
    );
  }
}

function setConnectionStatus(status) {
  const connected = status === 'connected';
  state.isConnected = connected;
  els.connectionBadge.className = `connection-status is-${status}`;
  els.connectionText.textContent = connected
    ? 'Conectado'
    : status === 'connecting'
      ? 'Conectando…'
      : status === 'error'
        ? 'Falha'
        : 'Desconectado';
}

async function fetchLevelingFromCloud() {
  if (!state.settings.serverUrl || !state.settings.token) return;
  try {
    const response = await fetch(`${state.settings.serverUrl}/api/leveling/session`, {
      headers: { Authorization: `Bearer ${state.settings.token}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data?.session && Array.isArray(data.session.answers)) {
      state.leveling.total = data.session.total || state.leveling.total;
      state.leveling.answers = data.session.answers;
      els.levelingTotal.value = String(state.leveling.total);
      updateLevelingUI();
    }
  } catch {
    /* offline state stays local */
  }
}

// Tab Switching Event Listeners
els.tabBtns.forEach((button, index) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + els.tabBtns.length) % els.tabBtns.length;
    els.tabBtns[next].focus();
    switchTab(els.tabBtns[next].dataset.tab);
  });
});

// Theme Toggle Listener
els.themeToggle.addEventListener('click', async () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  setTheme(theme);
  await storage.set({ cfo_ext_theme: theme });
});

// Password Masking Toggle Listener
els.toggleToken.addEventListener('click', () => {
  const isText = els.authToken.type === 'text';
  els.authToken.type = isText ? 'password' : 'text';
  els.toggleToken.setAttribute('aria-label', isText ? 'Mostrar token' : 'Ocultar token');
  els.toggleToken.title = els.toggleToken.getAttribute('aria-label');
  if (els.tokenEyeIcon) {
    els.tokenEyeIcon.innerHTML = isText ? TABLER_ICONS.eye : TABLER_ICONS.eyeOff;
  }
});

// Transmissão direta e síncrona do popup para abas web abertas (< 1ms)
function broadcastToWebTabs(timerState) {
  if (!timerState || typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return;
  try {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          chrome.tabs.sendMessage(
            tab.id,
            {
              type: 'EXTENSION_TIMER_SYNC',
              payload: timerState,
            },
            () => {
              if (chrome.runtime.lastError) {
                /* Ignora abas que não executam o content script do CFO */
              }
            }
          );
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    /* ignore */
  }
}

// Timer Listeners
els.btnTimerToggle.addEventListener('click', async () => {
  const selectedOption = els.timerSubject?.options?.[els.timerSubject.selectedIndex];
  const subjectId = els.timerSubject?.value || 'geral';
  const subjectName = selectedOption?.text || 'Estudo Geral / Questões';
  const isCurrentlyRunning = state.timer.status === 'RUNNING';
  const now = getServerNow();
  const currentAccumulated = Number(state.timer.accumulatedMs ?? state.timer.accumulatedTime) || 0;
  const currentRestAccumulated = Number(state.timer.restAccumulatedMs) || 0;

  if (isCurrentlyRunning) {
    const elapsed = Math.max(0, now - (state.timer.startTime || now));
    const newAccumulated = currentAccumulated + elapsed;
    state.timer = {
      ...state.timer,
      status: 'PAUSED',
      accumulatedMs: newAccumulated,
      accumulatedTime: newAccumulated,
      startTime: null,
      restStartTime: now,
      restAccumulatedMs: currentRestAccumulated,
    };
  } else {
    const restElapsed = state.timer.status === 'PAUSED' && state.timer.restStartTime
      ? Math.max(0, now - state.timer.restStartTime)
      : 0;
    const newRestAccumulated = currentRestAccumulated + restElapsed;
    state.timer = {
      ...state.timer,
      status: 'RUNNING',
      accumulatedMs: currentAccumulated,
      accumulatedTime: currentAccumulated,
      startTime: now,
      restStartTime: null,
      restAccumulatedMs: newRestAccumulated,
      subjectId,
      subjectName,
    };
  }

  // Grava imediatamente no storage local para garantir contagem mesmo se o popup for fechado no milissegundo seguinte
  await storage.set({ cfo_ext_timer: state.timer });
  updateTimerDisplay();
  startTimerTicker();
  broadcastToWebTabs(state.timer);

  sendRuntimeMessage(
    isCurrentlyRunning
      ? { type: 'TIMER_PAUSE' }
      : {
          type: 'TIMER_START',
          payload: {
            subjectId,
            subjectName,
            accumulatedTime: currentAccumulated,
            resetAccumulated: currentAccumulated === 0,
          },
        },
    (response) => {
      if (!response?.timer) return;
      if (typeof response.serverOffset === 'number') {
        state.serverOffset = response.serverOffset;
      }
      const respAcc = Number(response.timer.accumulatedMs ?? response.timer.accumulatedTime) || 0;
      const respRestAcc = Number(response.timer.restAccumulatedMs) || 0;
      state.timer = {
        ...response.timer,
        accumulatedMs: respAcc,
        accumulatedTime: respAcc,
        restAccumulatedMs: respRestAcc,
      };
      storage.set({ cfo_ext_timer: state.timer, cfo_ext_server_offset: state.serverOffset });
      updateTimerDisplay();
      startTimerTicker();
      broadcastToWebTabs(state.timer);
    }
  );
});

els.btnTimerReset.addEventListener('click', () => {
  sendRuntimeMessage({ type: 'TIMER_RESET' }, (response) => {
    if (!response?.timer) return;
    state.timer = response.timer;
    updateTimerDisplay();
    stopTimerTicker();
    broadcastToWebTabs(state.timer);
    showToast('Cronômetro zerado.');
  });
});

els.btnTimerSave.addEventListener('click', async () => {
  const seconds = Math.floor(getElapsedTimerMs() / 1000);
  if (seconds < 30) {
    return showToast('Estude pelo menos 30 segundos para registrar a sessão.');
  }
  if (!state.settings.token) {
    showToast('Conecte a extensão para salvar no site.');
    return switchTab('settings');
  }

  const selectedOption = els.timerSubject?.options?.[els.timerSubject.selectedIndex];
  const subjectId = els.timerSubject?.value || 'geral';
  const subjectName = selectedOption?.text || 'Estudo Geral / Questões';
  els.btnTimerSave.disabled = true;

  try {
    const response = await fetch(`${state.settings.serverUrl}/api/timer/save-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.settings.token}`,
      },
      body: JSON.stringify({
        subjectId,
        subjectName,
        durationSeconds: seconds,
        notes: 'Sessão registrada via Extensão CFO CBMERJ',
      }),
    });

    if (!response.ok) throw new Error('server response');

    sendRuntimeMessage({ type: 'TIMER_RESET' }, (result) => {
      if (result?.timer) state.timer = result.timer;
      storage.set({ cfo_ext_timer: state.timer });
      updateTimerDisplay();
    });
    const saveMsg = seconds < 60
      ? `Sessão de ${seconds}s salva no site.`
      : `Sessão de ${Math.round(seconds / 60)} min salva no site.`;
    showToast(saveMsg, 'success');
  } catch {
    showToast('Erro ao salvar no servidor. Verifique a conexão.', 'error');
  } finally {
    els.btnTimerSave.disabled = false;
  }
});

// Leveling Listeners
els.btnQuestionCorrect.addEventListener('click', () => recordAnswer('correct'));
els.btnQuestionWrong.addEventListener('click', () => recordAnswer('wrong'));

els.btnLevelingUndo.addEventListener('click', () => {
  if (!state.leveling.answers.length) return;
  state.leveling.answers.pop();
  updateLevelingUI();
  persistLevelingState();
  showToast('Última questão desfeita.');
});

els.btnLevelingReset.addEventListener('click', () => {
  state.leveling.answers = [];
  els.result.hidden = true;
  updateLevelingUI();
  persistLevelingState();
  showToast('Nova bateria iniciada.');
});

function setLevelingTotal(raw) {
  let val = parseInt(raw, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 100) {
    val = 100;
    showToast('Máximo de 100 questões por bateria.');
  }
  state.leveling.total = val;
  els.levelingTotal.value = String(val);
  if (state.leveling.answers.length > state.leveling.total) {
    state.leveling.answers = state.leveling.answers.slice(0, state.leveling.total);
  }
  updateLevelingUI();
  persistLevelingState();
}

els.levelingTotal.addEventListener('change', (event) => {
  setLevelingTotal(event.target.value);
});

els.levelingTotal.addEventListener('input', (event) => {
  const raw = event.target.value;
  if (raw === '') return;
  let val = parseInt(raw, 10);
  if (!isNaN(val) && val >= 1) {
    if (val > 100) {
      val = 100;
      els.levelingTotal.value = '100';
      showToast('Máximo de 100 questões por bateria.');
    }
    state.leveling.total = val;
    if (state.leveling.answers.length > state.leveling.total) {
      state.leveling.answers = state.leveling.answers.slice(0, state.leveling.total);
    }
    updateLevelingUI();
    persistLevelingState();
  }
});

// Settings & Sync Form Listener
els.formSettings.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = els.serverUrl.value.trim().replace(/\/+$/, '');
  const token = els.authToken.value.trim();

  els.settingsFeedback.className = 'feedback-msg';
  els.settingsFeedback.textContent = 'Testando conexão com o servidor…';
  els.saveSettings.disabled = true;
  setConnectionStatus('connecting');

  try {
    const response = await fetch(`${url}/api/timer/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('server response');

    state.settings = { serverUrl: url, token };
    await storage.set({ cfo_ext_settings: state.settings });
    setConnectionStatus('connected');
    els.settingsFeedback.className = 'feedback-msg success';
    els.settingsFeedback.textContent = 'Conectado com sucesso à plataforma CFO CBMERJ.';
    showToast('Conectado à sua conta.', 'success');
    fetchLevelingFromCloud();
  } catch {
    setConnectionStatus('error');
    els.settingsFeedback.className = 'feedback-msg error';
    els.settingsFeedback.textContent = 'Falha ao conectar. Verifique o servidor e o token.';
    showToast('Não foi possível conectar.', 'error');
  } finally {
    els.saveSettings.disabled = false;
    els.saveSettings.querySelector('span').textContent = state.isConnected ? 'Reconectar' : 'Salvar e conectar';
  }
});

// Initialization
async function initPopup() {
  const saved = await storage.get([
    'cfo_ext_settings',
    'cfo_ext_timer',
    'cfo_ext_leveling',
    'cfo_ext_theme',
    'cfo_ext_server_offset',
  ]);

  if (typeof saved.cfo_ext_server_offset === 'number') {
    state.serverOffset = saved.cfo_ext_server_offset;
  }

  if (saved.cfo_ext_settings) {
    state.settings = saved.cfo_ext_settings;
    els.serverUrl.value = state.settings.serverUrl || 'https://cfo-oficial-agorasim.onrender.com';
    els.authToken.value = state.settings.token || '';
  }

  if (saved.cfo_ext_leveling) {
    state.leveling = saved.cfo_ext_leveling;
    if (!state.leveling.total || state.leveling.total < 1) state.leveling.total = 30;
    if (state.leveling.total > 100) state.leveling.total = 100;
    els.levelingTotal.value = String(state.leveling.total);
  }

  if (saved.cfo_ext_timer) {
    const savedTimer = saved.cfo_ext_timer;
    const acc = Number(savedTimer.accumulatedMs ?? savedTimer.accumulatedTime) || 0;
    state.timer = {
      ...savedTimer,
      accumulatedMs: acc,
      accumulatedTime: acc,
    };
    if (state.timer.subjectId) els.timerSubject.value = state.timer.subjectId;
  }

  setTheme(saved.cfo_ext_theme || 'dark');
  updateLevelingUI();
  updateTimerDisplay();
  if (state.timer.status === 'RUNNING' || state.timer.status === 'PAUSED') {
    startTimerTicker();
  }

  sendRuntimeMessage({ type: 'GET_TIMER_STATE' }, (response) => {
    if (!response?.timer) return;
    if (typeof response.serverOffset === 'number') {
      state.serverOffset = response.serverOffset;
    }
    const respAcc = Number(response.timer.accumulatedMs ?? response.timer.accumulatedTime) || 0;
    state.timer = {
      ...response.timer,
      accumulatedMs: respAcc,
      accumulatedTime: respAcc,
    };
    if (state.timer.subjectId) els.timerSubject.value = state.timer.subjectId;
    updateTimerDisplay();
    if (state.timer.status === 'RUNNING' || state.timer.status === 'PAUSED') startTimerTicker();
  });

  if (state.settings.serverUrl && state.settings.token) {
    setConnectionStatus('connecting');
    fetch(`${state.settings.serverUrl}/api/timer/status`, {
      headers: { Authorization: `Bearer ${state.settings.token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('status error');
        setConnectionStatus('connected');
        const cloud = await response.json();
        if (cloud && cloud.status) {
          if (typeof cloud.serverTime === 'number') {
            state.serverOffset = cloud.serverTime - Date.now();
            storage.set({ cfo_ext_server_offset: state.serverOffset });
          }
          const cloudAcc = Number(cloud.accumulatedTime ?? cloud.accumulatedMs ?? 0);
          const cloudRestAcc = Number(cloud.restAccumulatedMs ?? cloud.totalRestMs) || 0;

          if (cloud.status === 'STOPPED') {
            state.timer = {
              status: 'STOPPED',
              accumulatedMs: 0,
              accumulatedTime: 0,
              startTime: null,
              restAccumulatedMs: 0,
              restStartTime: null,
              subjectId: 'geral',
              subjectName: 'Estudo Geral',
            };
            await storage.set({ cfo_ext_timer: state.timer });
            updateTimerDisplay();
            stopTimerTicker();
          } else if (cloud.status === 'RUNNING') {
            state.timer = {
              status: 'RUNNING',
              accumulatedMs: cloudAcc,
              accumulatedTime: cloudAcc,
              startTime: cloud.startTime || getServerNow(),
              restAccumulatedMs: cloudRestAcc,
              restStartTime: null,
              subjectId: cloud.activeSubjectId || state.timer.subjectId || 'geral',
              subjectName: cloud.activeSubjectName || state.timer.subjectName || 'Estudo Geral',
            };
            await storage.set({ cfo_ext_timer: state.timer });
            updateTimerDisplay();
            startTimerTicker();
          } else if (cloud.status === 'PAUSED') {
            state.timer = {
              status: 'PAUSED',
              accumulatedMs: cloudAcc,
              accumulatedTime: cloudAcc,
              startTime: null,
              restAccumulatedMs: cloudRestAcc,
              restStartTime: cloud.restStartTime || getServerNow(),
              subjectId: cloud.activeSubjectId || state.timer.subjectId || 'geral',
              subjectName: cloud.activeSubjectName || state.timer.subjectName || 'Estudo Geral',
            };
            await storage.set({ cfo_ext_timer: state.timer });
            updateTimerDisplay();
            startTimerTicker();
          }
        }
        fetchLevelingFromCloud();
      })
      .catch(() => setConnectionStatus('error'));
  } else {
    setConnectionStatus('disconnected');
  }

  // Listener para sincronização instantânea caso o cronômetro ou configurações mudem
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes['cfo_ext_timer']) {
        const next = changes['cfo_ext_timer'].newValue;
        if (next) {
          state.timer = {
            ...state.timer,
            ...next,
            accumulatedMs: Number(next.accumulatedMs ?? next.accumulatedTime) || 0,
            accumulatedTime: Number(next.accumulatedMs ?? next.accumulatedTime) || 0,
          };
          updateTimerDisplay();
          if (state.timer.status === 'RUNNING' || state.timer.status === 'PAUSED') {
            startTimerTicker();
          } else {
            stopTimerTicker();
          }
        }
      }

      if (changes['cfo_ext_settings']) {
        const nextSettings = changes['cfo_ext_settings'].newValue;
        if (nextSettings) {
          state.settings = nextSettings;
          if (els.serverUrl) els.serverUrl.value = nextSettings.serverUrl || 'https://cfo-oficial-agorasim.onrender.com';
          if (els.authToken) els.authToken.value = nextSettings.token || '';
          if (nextSettings.token) {
            setConnectionStatus('connected');
          } else {
            setConnectionStatus('disconnected');
          }
        }
      }

      if (changes['cfo_ext_server_offset']) {
        if (typeof changes['cfo_ext_server_offset'].newValue === 'number') {
          state.serverOffset = changes['cfo_ext_server_offset'].newValue;
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initPopup);
