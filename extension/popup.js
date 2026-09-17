/**
 * CFO CBMERJ — Controlador de Interface do Popup (popup.js)
 * Gerencia o cronômetro visual, o marcador de questões (certa/errada) e a sincronização.
 */

// Estado da Aplicação no Popup
const state = {
  activeTab: 'timer',
  settings: {
    serverUrl: 'https://cfo-oficial-agorasim.onrender.com',
    token: '',
  },
  timer: {
    status: 'STOPPED',
    accumulatedMs: 0,
    startTime: null,
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

let timerInterval = null;

// Elementos do DOM
const els = {
  // Tabs
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  // Header
  connectionBadge: document.getElementById('connection-badge'),
  connectionText: document.getElementById('connection-text'),
  // Timer
  timerSubject: document.getElementById('timer-subject'),
  timerDisplay: document.getElementById('timer-display'),
  timerStatusSub: document.getElementById('timer-status-sub'),
  btnTimerToggle: document.getElementById('btn-timer-toggle'),
  timerToggleIcon: document.getElementById('timer-toggle-icon'),
  timerToggleLabel: document.getElementById('timer-toggle-label'),
  btnTimerSave: document.getElementById('btn-timer-save'),
  btnTimerReset: document.getElementById('btn-timer-reset'),
  // Leveling
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
  // Settings
  formSettings: document.getElementById('form-settings'),
  serverUrl: document.getElementById('server-url'),
  authToken: document.getElementById('auth-token'),
  settingsFeedback: document.getElementById('settings-feedback'),
  // Toast
  toast: document.getElementById('toast'),
};

// ============================================================================
// Utilitários e Formatação
// ============================================================================
function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function showToast(message, duration = 2500) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  setTimeout(() => {
    els.toast.classList.add('hidden');
  }, duration);
}

// ============================================================================
// Navegação entre Abas
// ============================================================================
els.tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  state.activeTab = tabName;
  els.tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  els.tabContents.forEach((content) => {
    content.classList.toggle('active', content.id === `tab-content-${tabName}`);
  });
}

// ============================================================================
// Cronômetro (Timer)
// ============================================================================
function getElapsedTimerMs() {
  if (state.timer.status === 'RUNNING' && state.timer.startTime) {
    return state.timer.accumulatedMs + Math.max(0, Date.now() - state.timer.startTime);
  }
  return state.timer.accumulatedMs || 0;
}

function updateTimerDisplay() {
  const elapsed = getElapsedTimerMs();
  els.timerDisplay.textContent = formatTime(elapsed);

  if (state.timer.status === 'RUNNING') {
    els.timerStatusSub.textContent = 'EM ANDAMENTO (FOCO)';
    els.timerStatusSub.style.color = '#34d399';
    els.timerToggleIcon.textContent = '⏸';
    els.timerToggleLabel.textContent = 'Pausar Estudo';
    els.btnTimerToggle.style.background = 'linear-gradient(135deg, #d97706, #f59e0b)';
  } else if (state.timer.status === 'PAUSED') {
    els.timerStatusSub.textContent = 'PAUSADO';
    els.timerStatusSub.style.color = '#fbbf24';
    els.timerToggleIcon.textContent = '▶';
    els.timerToggleLabel.textContent = 'Continuar';
    els.btnTimerToggle.style.background = 'var(--color-blue)';
  } else {
    els.timerStatusSub.textContent = 'PARADO';
    els.timerStatusSub.style.color = 'var(--text-muted)';
    els.timerToggleIcon.textContent = '▶';
    els.timerToggleLabel.textContent = 'Iniciar Foco';
    els.btnTimerToggle.style.background = 'var(--color-blue)';
  }
}

function startTimerTicker() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (state.timer.status === 'RUNNING') {
      updateTimerDisplay();
    }
  }, 500);
}

els.btnTimerToggle.addEventListener('click', () => {
  const sel = els.timerSubject;
  const subjectId = sel.value;
  const subjectName = sel.options[sel.selectedIndex].text;

  if (state.timer.status === 'RUNNING') {
    chrome.runtime.sendMessage({ type: 'TIMER_PAUSE' }, (res) => {
      if (res?.timer) {
        state.timer = res.timer;
        updateTimerDisplay();
      }
    });
  } else {
    chrome.runtime.sendMessage({
      type: 'TIMER_START',
      payload: { subjectId, subjectName },
    }, (res) => {
      if (res?.timer) {
        state.timer = res.timer;
        updateTimerDisplay();
        startTimerTicker();
      }
    });
  }
});

els.btnTimerReset.addEventListener('click', () => {
  if (state.timer.status === 'RUNNING' && !confirm('Deseja realmente zerar o cronômetro?')) {
    return;
  }
  chrome.runtime.sendMessage({ type: 'TIMER_RESET' }, (res) => {
    if (res?.timer) {
      state.timer = res.timer;
      updateTimerDisplay();
      showToast('Cronômetro zerado.');
    }
  });
});

els.btnTimerSave.addEventListener('click', async () => {
  const elapsedMs = getElapsedTimerMs();
  const seconds = Math.floor(elapsedMs / 1000);

  if (seconds < 30) {
    showToast('Estude pelo menos 30 segundos para registrar a sessão.');
    return;
  }

  if (!state.settings.token) {
    showToast('Conecte a extensão na aba "Conexão" para salvar no site.');
    switchTab('settings');
    return;
  }

  const sel = els.timerSubject;
  const subjectId = sel.value;
  const subjectName = sel.options[sel.selectedIndex].text;

  try {
    els.btnTimerSave.disabled = true;
    els.btnTimerSave.textContent = 'Salvando...';

    const res = await fetch(`${state.settings.serverUrl}/api/timer/save-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.settings.token}`,
      },
      body: JSON.stringify({
        subjectId,
        subjectName,
        durationSeconds: seconds,
        notes: 'Sessão registrada via Extensão CFO CBMERJ',
      }),
    });

    if (!res.ok) throw new Error('Falha na resposta do servidor');

    // Reset local do timer após salvar com sucesso
    chrome.runtime.sendMessage({ type: 'TIMER_RESET' }, (r) => {
      if (r?.timer) state.timer = r.timer;
      updateTimerDisplay();
    });

    showToast(`✅ Sessão de ${Math.round(seconds / 60)} min salva no site!`);
  } catch (err) {
    showToast('Erro ao salvar no servidor. Verifique a conexão.');
  } finally {
    els.btnTimerSave.disabled = false;
    els.btnTimerSave.textContent = '💾 Salvar no Site';
  }
});

// ============================================================================
// Nivelamento (Questões Certa / Errada)
// ============================================================================
function updateLevelingUI() {
  const { total, answers } = state.leveling;
  const answered = answers.length;
  const correct = answers.filter((a) => a === 'correct').length;
  const wrong = answers.filter((a) => a === 'wrong').length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const requiredCorrect = Math.ceil(total * 0.8);
  const isGoalSecured = correct >= requiredCorrect;

  // Atualiza valores nas caixas
  els.statProgress.textContent = `${answered}/${total}`;
  els.statCorrect.textContent = String(correct);
  els.statWrong.textContent = String(wrong);
  els.statAccuracy.textContent = `${accuracy}%`;

  // Barra de progresso
  const progressPct = total > 0 ? Math.min(100, (answered / total) * 100) : 0;
  els.progressFill.style.width = `${progressPct}%`;

  // Status da meta
  if (answered === 0) {
    els.levelingStatusLabel.textContent = 'Inicie as resoluções';
    els.levelingStatusLabel.style.color = 'var(--text-primary)';
  } else if (isGoalSecured) {
    els.levelingStatusLabel.textContent = 'Meta assegurada! 🏆';
    els.levelingStatusLabel.style.color = '#34d399';
  } else {
    const missing = Math.max(0, requiredCorrect - correct);
    els.levelingStatusLabel.textContent = `Faltam ${missing} acerto${missing > 1 ? 's' : ''}`;
    els.levelingStatusLabel.style.color = '#fbbf24';
  }

  // Renderiza o mini cartão-resposta
  renderAnswerSheet(total, answers);
}

function renderAnswerSheet(total, answers) {
  els.answerSheetGrid.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'answer-dot';
    dot.textContent = String(i + 1);

    if (i < answers.length) {
      if (answers[i] === 'correct') dot.classList.add('correct');
      else if (answers[i] === 'wrong') dot.classList.add('wrong');
    }

    els.answerSheetGrid.appendChild(dot);
  }
}

async function persistLevelingState() {
  // Salva no storage local da extensão
  await chrome.storage.local.set({ cfo_ext_leveling: state.leveling });

  // Sincroniza com o servidor se conectado
  if (state.settings.serverUrl && state.settings.token) {
    try {
      fetch(`${state.settings.serverUrl}/api/leveling/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.settings.token}`,
        },
        body: JSON.stringify({
          mode: 'live',
          total: state.leveling.total,
          answers: state.leveling.answers,
          started: state.leveling.answers.length > 0,
        }),
      }).catch(() => {});
    } catch {
      // Falha silenciosa em offline
    }
  }
}

function recordAnswer(answerType) {
  if (state.leveling.answers.length >= state.leveling.total) {
    showToast('Bateria concluída! Inicie uma nova se desejar.');
    return;
  }

  state.leveling.answers.push(answerType);
  updateLevelingUI();
  persistLevelingState();

  if (state.leveling.answers.length === state.leveling.total) {
    const correct = state.leveling.answers.filter((a) => a === 'correct').length;
    const required = Math.ceil(state.leveling.total * 0.8);
    if (correct >= required) {
      showToast('🎉 Parabéns! Meta de 80% atingida no Nivelamento!');
    } else {
      showToast('Bateria finalizada. Revise seus erros no site.');
    }
  }
}

els.btnQuestionCorrect.addEventListener('click', () => recordAnswer('correct'));
els.btnQuestionWrong.addEventListener('click', () => recordAnswer('wrong'));

els.btnLevelingUndo.addEventListener('click', () => {
  if (state.leveling.answers.length === 0) return;
  state.leveling.answers.pop();
  updateLevelingUI();
  persistLevelingState();
  showToast('Última questão desfeita.');
});

els.btnLevelingReset.addEventListener('click', () => {
  if (state.leveling.answers.length > 0 && !confirm('Deseja iniciar uma nova bateria de nivelamento?')) {
    return;
  }
  state.leveling.answers = [];
  updateLevelingUI();
  persistLevelingState();
  showToast('Nova bateria iniciada.');
});

els.levelingTotal.addEventListener('change', (e) => {
  const newTotal = Number(e.target.value) || 30;
  state.leveling.total = newTotal;
  if (state.leveling.answers.length > newTotal) {
    state.leveling.answers = state.leveling.answers.slice(0, newTotal);
  }
  updateLevelingUI();
  persistLevelingState();
});

// ============================================================================
// Configurações & Vínculo com a Plataforma
// ============================================================================
els.formSettings.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = els.serverUrl.value.trim().replace(/\/+$/, '');
  const token = els.authToken.value.trim();

  els.settingsFeedback.className = 'feedback-msg';
  els.settingsFeedback.textContent = 'Testando conexão com o servidor...';

  try {
    const res = await fetch(`${url}/api/timer/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (res.ok) {
      state.settings.serverUrl = url;
      state.settings.token = token;
      state.isConnected = true;

      await chrome.storage.local.set({
        cfo_ext_settings: state.settings,
      });

      setConnectionStatus(true);
      els.settingsFeedback.className = 'feedback-msg success';
      els.settingsFeedback.textContent = '✅ Conectado com sucesso à plataforma CFO CBMERJ!';
      showToast('Conectado à sua conta!');

      // Sincroniza sessão de nivelamento da nuvem
      fetchLevelingFromCloud();
    } else {
      throw new Error(`Código HTTP ${res.status}`);
    }
  } catch (err) {
    state.isConnected = false;
    setConnectionStatus(false);
    els.settingsFeedback.className = 'feedback-msg error';
    els.settingsFeedback.textContent = '❌ Falha ao conectar. Verifique se o servidor está ativo e o token está correto.';
  }
});

function setConnectionStatus(connected) {
  state.isConnected = connected;
  if (connected) {
    els.connectionBadge.className = 'badge badge-online';
    els.connectionText.textContent = 'Conectado';
  } else {
    els.connectionBadge.className = 'badge badge-offline';
    els.connectionText.textContent = 'Desconectado';
  }
}

async function fetchLevelingFromCloud() {
  if (!state.settings.serverUrl || !state.settings.token) return;
  try {
    const res = await fetch(`${state.settings.serverUrl}/api/leveling/session`, {
      headers: { 'Authorization': `Bearer ${state.settings.token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.session && Array.isArray(data.session.answers)) {
      state.leveling.total = data.session.total || state.leveling.total;
      state.leveling.answers = data.session.answers || [];
      els.levelingTotal.value = String(state.leveling.total);
      updateLevelingUI();
    }
  } catch (e) {
    // Modo offline preservado
  }
}

// ============================================================================
// Inicialização Geral do Popup
// ============================================================================
async function initPopup() {
  // Carrega configurações salvas
  const storage = await chrome.storage.local.get([
    'cfo_ext_settings',
    'cfo_ext_timer',
    'cfo_ext_leveling',
  ]);

  if (storage.cfo_ext_settings) {
    state.settings = storage.cfo_ext_settings;
    els.serverUrl.value = state.settings.serverUrl || 'https://cfo-oficial-agorasim.onrender.com';
    els.authToken.value = state.settings.token || '';
  }

  if (storage.cfo_ext_leveling) {
    state.leveling = storage.cfo_ext_leveling;
    els.levelingTotal.value = String(state.leveling.total || 30);
  }

  // Consulta estado do cronômetro com o background worker
  chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' }, (res) => {
    if (res?.timer) {
      state.timer = res.timer;
      if (state.timer.subjectId) {
        els.timerSubject.value = state.timer.subjectId;
      }
      updateTimerDisplay();
      if (state.timer.status === 'RUNNING') {
        startTimerTicker();
      }
    }
  });

  // Testa conexão se já tiver token configurado
  if (state.settings.serverUrl && state.settings.token) {
    fetch(`${state.settings.serverUrl}/api/timer/status`, {
      headers: { 'Authorization': `Bearer ${state.settings.token}` },
    }).then((res) => {
      setConnectionStatus(res.ok);
      if (res.ok) fetchLevelingFromCloud();
    }).catch(() => {
      setConnectionStatus(false);
    });
  }

  updateLevelingUI();
  updateTimerDisplay();
}

document.addEventListener('DOMContentLoaded', initPopup);
