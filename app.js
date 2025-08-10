// Basketball Scoreboard Pro — Fixed Model 2

// ================== GLOBAL STATE ==================
const appState = {
  view: 'landing',
  isHost: false,
  gameCode: null,
  game: null,
  gameType: 'friendly',
  timers: { masterTimer: null },
  broadcastChannel: null,
  gameRunning: false,
  shotClockRunning: false,
  selectedPlayer: null,
  actionHistory: [],
  clockEditing: false
};

// ================== SHORTCUTS ==================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ================== HELPERS ==================
function generateGameCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function pad2(n) { return n.toString().padStart(2, '0'); }
function formatTime(m, s) { return `${pad2(m)}:${pad2(s)}`; }
function toast(message, type = 'info', duration = 2000) {
  const c = $('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  const size = message.length > 50 || type === 'error' ? 'large' :
               message.length > 30 || type === 'warning' ? 'medium' : 'small';
  el.className = `toast ${type} ${size}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast('Game code copied!', 'success', 1500);
      return;
    }
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Game code copied!', 'success', 1500);
  } catch {
    toast('Copy failed - copy manually', 'warning', 3000);
  }
  ta.remove();
}

// ================== VIEW ROUTER ==================
function showView(view) {
  const ids = ['landing', 'config', 'setup', 'control', 'viewer'];
  ids.forEach(v => {
    const el = $(`${v}-view`);
    if (!el) return;
    if (v === view) {
      el.classList.remove('hidden');
      el.style.display = 'block';
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });
  appState.view = view;
}

// ================== SHOT CLOCK VIOLATION ==================
function playViolation() {
  const buzzer = $('buzzerSound');
  if (buzzer) {
    buzzer.currentTime = 0;
    buzzer.play().catch(()=>{});
  }
  const alert = $('shotClockViolation');
  if (alert) {
    alert.classList.remove('hidden');
    setTimeout(() => alert.classList.add('hidden'), 2000);
  }
}
function handleShotClockViolation() {
  playViolation();
  toast('SHOT CLOCK VIOLATION!', 'error', 3000);
  appState.shotClockRunning = false;
  if (appState.game) {
    const cur = appState.game.gameState.possession;
    appState.game.gameState.possession = cur === 'teamA' ? 'teamB' : 'teamA';
    appState.game.gameState.shotClock = 0;
    removeShotClockWarning();
    updateControlDisplay();
    updateSpectatorView();
    broadcastUpdate();
    saveGameState();
  }
  toast('Shot clock stopped - use restart buttons', 'warning', 4000);
}

// ================== MASTER TIMER LOOP ==================
function startMasterTimer() {
  stopMasterTimer();
  appState.timers.masterTimer = setInterval(() => {
    const g = appState.game;
    if (!g) return;
    let changed = false;

    // Game clock
    if (appState.gameRunning) {
      const t = g.gameState.gameTime;
      if (t.seconds > 0) {
        t.seconds--; changed = true;
      } else if (t.minutes > 0) {
        t.minutes--; t.seconds = 59; changed = true;
      } else {
        appState.gameRunning = false;
        appState.shotClockRunning = false;
        toast('Period ended!', 'warning', 3000);
        updateMasterStartButton();
      }
    }

    // Shot clock
    if (appState.shotClockRunning && g.settings.shotClockDuration > 0) {
      if (g.gameState.shotClock > 0) {
        g.gameState.shotClock--; changed = true;
        if (g.gameState.shotClock === 5) addShotClockWarning();
      } else {
        handleShotClockViolation();
        changed = true;
      }
    }

    if (changed) {
      updateControlDisplay();
      updateSpectatorView();
      broadcastUpdate();
      saveGameState();
    }
  }, 1000);
}
function stopMasterTimer() {
  if (appState.timers.masterTimer) {
    clearInterval(appState.timers.masterTimer);
    appState.timers.masterTimer = null;
  }
}

// ================== CLOCK CONTROLS ==================
function updateMasterStartButton() {
  const btn = $('startGameBtn');
  if (!btn) return;
  if (appState.gameRunning || appState.shotClockRunning) {
    btn.textContent = 'PAUSE GAME';
    btn.className = 'btn btn--primary master-start-btn pause';
  } else {
    btn.textContent = 'START GAME';
    btn.className = 'btn btn--primary master-start-btn resume';
  }
}
function toggleMasterGame() {
  if (!appState.game) return;
  if (appState.gameRunning || appState.shotClockRunning) {
    appState.gameRunning = false;
    appState.shotClockRunning = false;
    stopMasterTimer();
    toast('Game paused', 'info', 1500);
  } else {
    appState.gameRunning = true;
    if (appState.game.settings.shotClockDuration > 0 && appState.game.gameState.shotClock > 0) {
      appState.shotClockRunning = true;
    }
    startMasterTimer();
    toast('Game started!', 'success', 1500);
  }
  updateMasterStartButton();
  broadcastUpdate();
  saveGameState();
}
function resetAllClocks() {
  if (!appState.game) return;
  const g = appState.game;
  g.gameState.gameTime.minutes = g.settings.periodDuration;
  g.gameState.gameTime.seconds = 0;
  if (g.settings.shotClockDuration > 0) {
    g.gameState.shotClock = g.settings.shotClockDuration;
  } else {
    g.gameState.shotClock = 0;
  }
  removeShotClockWarning();
  updateControlDisplay();
  updateSpectatorView();
  broadcastUpdate();
  saveGameState();
  toast('All clocks reset', 'info', 1500);
}
function addShotClockWarning() {
  $('shotClockDisplay')?.classList
