'use strict';

// ---- Configuração ---------------------------------------------------------
const GRID = 20;              // tabuleiro de 20x20 células
const CELL = 20;              // pixels por célula (canvas 400x400)
const POINTS_PER_FOOD = 10;
const FOODS_PER_LEVEL = 5;
const MAX_LEVEL = 10;
const WRAP_MAX_LEVEL = 5;     // até este nível a cobra atravessa as paredes
const HIGH_SCORE_KEY = 'snake.highScore';

const DIRS = {
  up:    { x: 0,  y: -1 },
  down:  { x: 0,  y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1,  y: 0 },
};

const KEY_TO_DIR = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
};

const COLORS = readColors();

// ---- Elementos ------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('high');
const levelEl = document.getElementById('level');
const wallsEl = document.getElementById('walls');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayBodyEl = document.getElementById('overlay-body');
const overlayHintEl = document.getElementById('overlay-hint');
const toastEl = document.getElementById('toast');
const pauseBtn = document.getElementById('pause-btn');

const SIZE = GRID * CELL;     // tamanho lógico do tabuleiro em px
let scale = 1;                // pixels reais do canvas por px lógico
let gridLayer = null;         // fundo + grade desenhados uma vez só

// ---- Estado ---------------------------------------------------------------
// phase: 'start' | 'playing' | 'paused' | 'over'
const state = {
  phase: 'start',
  snake: [],
  dir: DIRS.right,
  dirQueue: [],
  food: null,
  foods: 0,
  score: 0,
  level: 1,
  high: loadHighScore(),
  newRecord: false,
  won: false,
  deathReason: '',
};

let tickTimer = null;
let toastTimer = null;

// ---- Regras ---------------------------------------------------------------
function levelFor(foods) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(foods / FOODS_PER_LEVEL));
}

function speedFor(level) {
  return Math.max(60, 150 - (level - 1) * 10); // ms por passo
}

function wallsWrap(level) {
  return level <= WRAP_MAX_LEVEL;
}

// ---- Recorde (localStorage; sem ele, state.high vale só nesta sessão) ------
function loadHighScore() {
  try {
    const value = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    // sem armazenamento disponível: o recorde vale só nesta sessão
  }
}

// ---- Ciclo do jogo --------------------------------------------------------
function resetGame() {
  const mid = Math.floor(GRID / 2);
  state.snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  state.dir = DIRS.right;
  state.dirQueue = [];
  state.foods = 0;
  state.score = 0;
  state.level = 1;
  state.newRecord = false;
  state.won = false;
  state.deathReason = '';
  state.food = spawnFood();
  boardEl.classList.remove('danger');
  updateHud();
}

function startGame() {
  resetGame();
  state.phase = 'playing';
  hideOverlay();
  updatePauseButton();
  render();
  scheduleTick();
}

function scheduleTick() {
  clearTimeout(tickTimer);
  tickTimer = setTimeout(step, speedFor(state.level));
}

function step() {
  if (state.phase !== 'playing') return;
  tick();
  render();
  if (state.phase === 'playing') scheduleTick();
}

function tick() {
  if (state.dirQueue.length) state.dir = state.dirQueue.shift();

  const head = state.snake[0];
  let x = head.x + state.dir.x;
  let y = head.y + state.dir.y;

  const outside = x < 0 || x >= GRID || y < 0 || y >= GRID;
  if (outside) {
    if (wallsWrap(state.level)) {
      x = (x + GRID) % GRID;
      y = (y + GRID) % GRID;
    } else {
      gameOver('Você bateu na parede!');
      return;
    }
  }

  const eating = state.food && x === state.food.x && y === state.food.y;
  // Se não comer, a cauda sai do lugar neste passo, então ela não conta como colisão.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if (body.some((s) => s.x === x && s.y === y)) {
    gameOver('Você bateu no próprio corpo!');
    return;
  }

  state.snake.unshift({ x, y });

  if (eating) {
    state.foods += 1;
    state.score += POINTS_PER_FOOD;

    if (state.score > state.high) {
      state.high = state.score;
      state.newRecord = true;
      saveHighScore(state.high);
    }

    const newLevel = levelFor(state.foods);
    if (newLevel !== state.level) {
      state.level = newLevel;
      onLevelUp();
    }

    state.food = spawnFood();
    if (!state.food) {
      gameOver('Você encheu o tabuleiro inteiro!', true);
      return;
    }
  } else {
    state.snake.pop();
  }

  updateHud();
}

function onLevelUp() {
  const danger = !wallsWrap(state.level);
  boardEl.classList.toggle('danger', danger);

  if (state.level === WRAP_MAX_LEVEL + 1) {
    showToast(`Nível ${state.level}: paredes agora matam!`, true);
  } else {
    showToast(`Nível ${state.level}! Mais rápido!`, danger);
  }
}

function gameOver(reason, won = false) {
  state.phase = 'over';
  state.deathReason = reason;
  state.won = won;
  clearTimeout(tickTimer);
  updateHud();
  updatePauseButton();
  showOverlay();
}

function togglePause() {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    clearTimeout(tickTimer);
    showOverlay();
  } else if (state.phase === 'paused') {
    state.phase = 'playing';
    hideOverlay();
    scheduleTick();
  }
  updatePauseButton();
}

function spawnFood() {
  const occupied = new Set(state.snake.map((s) => s.y * GRID + s.x));
  const free = [];
  for (let i = 0; i < GRID * GRID; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  if (!free.length) return null;
  const cell = free[Math.floor(Math.random() * free.length)];
  return { x: cell % GRID, y: Math.floor(cell / GRID) };
}

// ---- Entrada --------------------------------------------------------------
function queueDirection(name) {
  if (state.phase !== 'playing') return;
  const next = DIRS[name];
  const last = state.dirQueue.length ? state.dirQueue[state.dirQueue.length - 1] : state.dir;
  const isSame = next === last;
  const isReverse = next.x === -last.x && next.y === -last.y;
  if (isSame || isReverse) return;
  if (state.dirQueue.length < 2) state.dirQueue.push(next);
}

function primaryAction() {
  if (state.phase === 'start' || state.phase === 'over') startGame();
  else if (state.phase === 'paused') togglePause();
}

document.addEventListener('keydown', (e) => {
  // Atalhos do navegador (Ctrl+S, Alt+←, Cmd+P...) não são comandos do jogo.
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key.toLowerCase();

  if (KEY_TO_DIR[key]) {
    e.preventDefault();
    queueDirection(KEY_TO_DIR[key]);
    return;
  }

  if (key === ' ' || key === 'enter') {
    e.preventDefault();
    // Tecla segurada não pode reiniciar o jogo assim que ele termina.
    if (!e.repeat) primaryAction();
    return;
  }

  if ((key === 'p' || key === 'escape') && !e.repeat) {
    togglePause();
  }
});

overlayEl.addEventListener('click', primaryAction);

// Botão de pausa: o único jeito de pausar pelo toque
pauseBtn.addEventListener('click', () => {
  togglePause();
  pauseBtn.blur(); // sem foco, Espaço/Enter não acionam o botão de novo
});

// Swipe no celular
let touchStart = null;

boardEl.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

boardEl.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; // toque simples: o overlay cuida
  if (Math.abs(dx) > Math.abs(dy)) queueDirection(dx > 0 ? 'right' : 'left');
  else queueDirection(dy > 0 ? 'down' : 'up');
}, { passive: true });

// Pausa sozinho ao trocar de aba
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') togglePause();
});

// ---- Interface ------------------------------------------------------------
// Escreve só quando o texto muda: evita trabalho a cada passo e
// leituras repetidas pelo leitor de tela (o HUD é aria-live).
function setText(el, value) {
  const text = String(value);
  if (el.textContent === text) return false;
  el.textContent = text;
  return true;
}

function updateHud() {
  setText(scoreEl, state.score);
  setText(highEl, state.high);
  setText(levelEl, state.level);

  const wrap = wallsWrap(state.level);
  if (setText(wallsEl, wrap ? 'atravessáveis' : 'perigosas')) {
    wallsEl.classList.toggle('walls-safe', wrap);
    wallsEl.classList.toggle('walls-danger', !wrap);
  }
}

function updatePauseButton() {
  const paused = state.phase === 'paused';
  pauseBtn.disabled = state.phase !== 'playing' && !paused;
  pauseBtn.textContent = paused ? 'Continuar' : 'Pausar';
}

function showOverlay() {
  if (state.phase === 'start') {
    overlayTitleEl.textContent = 'Jogo da Cobra';
    overlayBodyEl.innerHTML =
      `<p>Coma para crescer. A cada ${FOODS_PER_LEVEL} comidas você sobe de nível e a cobra acelera.</p>` +
      `<p>Até o nível ${WRAP_MAX_LEVEL} você atravessa as paredes. Depois disso, elas matam.</p>`;
    overlayHintEl.textContent = 'Pressione Espaço ou toque para começar';
  } else if (state.phase === 'paused') {
    overlayTitleEl.textContent = 'Pausado';
    overlayBodyEl.innerHTML = '';
    overlayHintEl.textContent = 'Pressione P, Espaço ou toque para continuar';
  } else if (state.phase === 'over') {
    overlayTitleEl.textContent = state.won ? 'Vitória!' : 'Fim de jogo';
    overlayBodyEl.innerHTML =
      `<p>${state.deathReason}</p>` +
      '<div class="summary">' +
        `<span>Pontos</span><strong>${state.score}</strong>` +
        `<span>Nível</span><strong>${state.level}</strong>` +
        `<span>Recorde</span><strong>${state.high}</strong>` +
      '</div>' +
      (state.newRecord ? '<p class="record">Novo recorde!</p>' : '');
    overlayHintEl.textContent = state.won
      ? 'Pressione Espaço ou toque para jogar outra partida'
      : 'Pressione Espaço ou toque para jogar de novo';
  }
  overlayEl.classList.remove('hidden');
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function showToast(message, danger) {
  toastEl.textContent = message;
  toastEl.classList.toggle('danger', Boolean(danger));
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// ---- Desenho --------------------------------------------------------------
// Ajusta o canvas ao tamanho exibido × devicePixelRatio, para ficar nítido.
// O desenho continua em coordenadas lógicas (SIZE × SIZE) via setTransform.
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const cssSize = canvas.getBoundingClientRect().width || SIZE;
  const px = Math.max(1, Math.round(cssSize * dpr));
  if (gridLayer && canvas.width === px) return;
  canvas.width = px;
  canvas.height = px;
  scale = px / SIZE;
  gridLayer = buildGridLayer(px);
  render();
}

// Fundo e grade não mudam: desenha uma vez num canvas fora da tela.
// As linhas são posicionadas em pixels reais para não borrar.
function buildGridLayer(px) {
  const layer = document.createElement('canvas');
  layer.width = px;
  layer.height = px;
  const g = layer.getContext('2d');

  g.fillStyle = COLORS.panel;
  g.fillRect(0, 0, px, px);

  const lw = Math.max(1, Math.round(scale));
  const offset = lw % 2 ? 0.5 : 0;
  g.strokeStyle = COLORS.grid;
  g.lineWidth = lw;
  g.beginPath();
  for (let i = 1; i < GRID; i++) {
    const p = Math.round(i * CELL * scale) + offset;
    g.moveTo(p, 0); g.lineTo(p, px);
    g.moveTo(0, p); g.lineTo(px, p);
  }
  g.stroke();
  return layer;
}

function render() {
  if (!gridLayer) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(gridLayer, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (state.food) {
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(state.food.x * CELL + CELL / 2, state.food.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  }

  state.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? COLORS.snakeHead : COLORS.snake;
    roundedRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2, 5);
  });

  if (state.snake.length) drawEyes(state.snake[0]);
}

function drawEyes(head) {
  const cx = head.x * CELL + CELL / 2;
  const cy = head.y * CELL + CELL / 2;
  const { x: dx, y: dy } = state.dir;
  // olhos deslocados para a frente e afastados na perpendicular
  const fwd = 4;
  const side = 4;
  ctx.fillStyle = COLORS.panel;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dx * fwd + dy * side * s, cy + dy * fwd + dx * side * s, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function readColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    panel: get('--panel', '#161a22'),
    grid: get('--grid', '#1c212b'),
    snake: get('--snake', '#39d98a'),
    snakeHead: get('--snake-head', '#7dffbc'),
    food: get('--food', '#ff5c7a'),
  };
}

// ---- Início ---------------------------------------------------------------
resetGame();
resizeCanvas(); // também desenha o primeiro quadro
updatePauseButton();
showOverlay();
window.addEventListener('resize', resizeCanvas); // inclui zoom e troca de tela (DPR)
