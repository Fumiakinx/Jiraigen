// 定数設定
const DIFFICULTIES = {
  beginner: { name: '初級', rows: 9, cols: 9, mines: 10 },
  intermediate: { name: '中級', rows: 16, cols: 16, mines: 40 },
  expert: { name: '上級', rows: 16, cols: 30, mines: 99 }
};

const STORAGE_KEY = 'minesweeper_streaks_v1';
const PLAYER_NAME_KEY = 'jigsaw_player_name';
const RANKING_API_URL = "https://script.google.com/macros/s/AKfycbzIgOMcU1d9kMOfeDjmZmDFcoW8k1LIK0yZbNSCmokaFdb7JyMwa6mHKxxfkVlgaOEt/exec";

const ICON_MINE = '💣';
const ICON_MARKER = '◆';

// ゲームステート
let currentDifficulty = 'beginner';
let rows = 9;
let cols = 9;
let totalMines = 10;
let board = [];
let gameState = 'ready'; // 'ready' | 'playing' | 'won' | 'lost'
let timer = 0;
let timerId = null;
let flagsCount = 0;
let revealedCount = 0;

// 連勝データの読み込み・保存 (ローカル)
function loadStreaks() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('連勝データの読み込みに失敗しました', e);
  }
  return {
    beginner: { current: 0, best: 0 },
    intermediate: { current: 0, best: 0 },
    expert: { current: 0, best: 0 }
  };
}

function saveStreaks(streaks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streaks));
  } catch (e) {
    console.error('連勝データの保存に失敗しました', e);
  }
}

let streaks = loadStreaks();

// DOM要素
const boardEl = document.getElementById('board');
const mineCountEl = document.getElementById('mine-count');
const timerEl = document.getElementById('timer');
const statusBtn = document.getElementById('face-btn');
const statusTextEl = document.getElementById('status-text');
const currentStreakEl = document.getElementById('current-streak');
const bestStreakEl = document.getElementById('best-streak');
const difficultyBtns = document.querySelectorAll('.tab-btn[data-difficulty]');
const btnResetStreak = document.getElementById('btn-reset-streak');

const playerNameInput = document.getElementById('player-name-input');
const saveStatusEl = document.getElementById('save-status');
const rankingTbody = document.getElementById('ranking-tbody');
const sidebarDiffSelect = document.getElementById('sidebar-diff-select');
const btnRefreshRanking = document.getElementById('btn-refresh-ranking');
const btnBackPortal = document.getElementById('btn-back-portal');

// ステータス表示更新
function setStatus(state, label) {
  statusBtn.dataset.state = state;
  statusTextEl.textContent = label;
}

// UI表示更新
function updateDisplayNumbers() {
  const remainingMines = totalMines - flagsCount;
  mineCountEl.textContent = format3Digits(remainingMines);
  timerEl.textContent = format3Digits(timer);
}

function format3Digits(num) {
  if (num < 0) {
    const abs = Math.min(99, Math.abs(num));
    return '-' + String(abs).padStart(2, '0');
  }
  const clamped = Math.min(999, Math.max(0, num));
  return String(clamped).padStart(3, '0');
}

function updateStreakDisplay() {
  const currentDiffStreak = streaks[currentDifficulty] || { current: 0, best: 0 };
  currentStreakEl.textContent = currentDiffStreak.current;
  bestStreakEl.textContent = currentDiffStreak.best;
}

// タイマー制御
function startTimer() {
  if (timerId !== null) return;
  timerId = setInterval(() => {
    if (timer < 999) {
      timer++;
      timerEl.textContent = format3Digits(timer);
    }
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// ==========================================
// 🏆 ランキング通信 & プロフィール同期
// ==========================================

function initPlayerProfile() {
  const savedName = localStorage.getItem(PLAYER_NAME_KEY) || 'ゲスト';
  if (playerNameInput) {
    playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', () => {
      const val = playerNameInput.value.trim();
      localStorage.setItem(PLAYER_NAME_KEY, val);
      if (saveStatusEl) {
        saveStatusEl.classList.add('active');
        setTimeout(() => { saveStatusEl.classList.remove('active'); }, 1000);
      }
    });
  }

  if (btnBackPortal) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    btnBackPortal.href = isLocal ? "../FumiPortal/index.html" : "https://fumiakinx.github.io/";
  }

  if (btnRefreshRanking) {
    btnRefreshRanking.addEventListener('click', () => {
      const targetDiff = sidebarDiffSelect ? sidebarDiffSelect.value : currentDifficulty;
      loadLeaderboard(targetDiff);
    });
  }

  if (sidebarDiffSelect) {
    sidebarDiffSelect.addEventListener('change', (e) => {
      loadLeaderboard(e.target.value);
    });
  }
}

async function loadLeaderboard(diffKey) {
  if (!rankingTbody) return;
  const levelName = DIFFICULTIES[diffKey].name;

  rankingTbody.innerHTML = '<tr><td colspan="3" class="loading-cell">読み込み中...</td></tr>';

  try {
    const url = `${RANKING_API_URL}?action=get_jiraigen_ranking&level=${encodeURIComponent(levelName)}&t=${Date.now()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.records && data.records.length > 0) {
      rankingTbody.innerHTML = '';
      data.records.slice(0, 10).forEach((row, idx) => {
        const tr = document.createElement('tr');
        const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
        tr.innerHTML = `
          <td class="${rankClass}">${idx + 1}位</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px;">${escapeHtml(row.name)}</td>
          <td class="streak-col">${row.streak} 連勝</td>
        `;
        rankingTbody.appendChild(tr);
      });
    } else {
      rankingTbody.innerHTML = '<tr><td colspan="3" class="empty-cell">まだ連勝記録がありません</td></tr>';
    }
  } catch (e) {
    console.warn("ランキング取得エラー (ローカル記録フォールバック):", e);
    const pName = (playerNameInput ? playerNameInput.value.trim() : '') || 'あなた';
    const localBest = streaks[diffKey] ? streaks[diffKey].best : 0;
    rankingTbody.innerHTML = `
      <tr>
        <td class="rank-1">1位</td>
        <td>${escapeHtml(pName)}</td>
        <td class="streak-col">${localBest} 連勝</td>
      </tr>
    `;
  }
}

async function submitStreakRanking(streak, diffKey) {
  const levelName = DIFFICULTIES[diffKey].name;
  const playerName = (playerNameInput ? playerNameInput.value.trim() : '') || 'ゲスト';
  const sendUrl = `${RANKING_API_URL}?action=add_jiraigen_streak&name=${encodeURIComponent(playerName)}&streak=${streak}&level=${encodeURIComponent(levelName)}&t=${Date.now()}`;

  try {
    await fetch(sendUrl);
    const activeViewDiff = sidebarDiffSelect ? sidebarDiffSelect.value : diffKey;
    await loadLeaderboard(activeViewDiff);
  } catch (e) {
    console.error("ランキング送信エラー:", e);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// 🎮 ゲーム制御ロジック
// ==========================================

// ゲーム初期化
function initGame(diffKey) {
  stopTimer();
  timer = 0;
  flagsCount = 0;
  revealedCount = 0;
  gameState = 'ready';
  setStatus('ready', 'READY');

  if (diffKey && DIFFICULTIES[diffKey]) {
    currentDifficulty = diffKey;
  }

  const config = DIFFICULTIES[currentDifficulty];
  rows = config.rows;
  cols = config.cols;
  totalMines = config.mines;

  updateDisplayNumbers();
  updateStreakDisplay();

  if (sidebarDiffSelect) {
    sidebarDiffSelect.value = currentDifficulty;
  }
  loadLeaderboard(currentDifficulty);

  // ボード要素のグリッドスタイル適用
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 24px)`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, 24px)`;
  boardEl.innerHTML = '';

  // 論理ボードの作成
  board = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const cellData = {
        row: r,
        col: c,
        isMine: false,
        isRevealed: false,
        state: 'covered', // 'covered' | 'flagged' | 'question'
        neighborMines: 0,
        element: null
      };

      const cellEl = document.createElement('div');
      cellEl.classList.add('cell', 'covered');
      cellEl.dataset.row = r;
      cellEl.dataset.col = c;

      // イベントリスナー
      cellEl.addEventListener('mousedown', handleCellMouseDown);
      cellEl.addEventListener('mouseup', handleCellMouseUp);
      cellEl.addEventListener('contextmenu', handleCellContextMenu);

      cellData.element = cellEl;
      boardEl.appendChild(cellEl);
      row.push(cellData);
    }
    board.push(row);
  }
}

// 初手安全な地雷配置
function placeMines(firstR, firstC) {
  const forbidden = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = firstR + dr;
      const nc = firstC + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        forbidden.add(`${nr},${nc}`);
      }
    }
  }

  const availableCandidates = [];
  const secondaryCandidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (!forbidden.has(key)) {
        availableCandidates.push({ r, c });
      } else if (r !== firstR || c !== firstC) {
        secondaryCandidates.push({ r, c });
      }
    }
  }

  let placed = 0;
  while (placed < totalMines && availableCandidates.length > 0) {
    const idx = Math.floor(Math.random() * availableCandidates.length);
    const { r, c } = availableCandidates.splice(idx, 1)[0];
    board[r][c].isMine = true;
    placed++;
  }

  while (placed < totalMines && secondaryCandidates.length > 0) {
    const idx = Math.floor(Math.random() * secondaryCandidates.length);
    const { r, c } = secondaryCandidates.splice(idx, 1)[0];
    board[r][c].isMine = true;
    placed++;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
            count++;
          }
        }
      }
      board[r][c].neighborMines = count;
    }
  }
}

// セルを開く処理
function revealCell(r, c) {
  const cell = board[r][c];
  if (cell.isRevealed || cell.state === 'flagged') return;

  if (gameState === 'ready') {
    placeMines(r, c);
    gameState = 'playing';
    setStatus('playing', 'ACTIVE');
    startTimer();
  }

  if (cell.isMine) {
    gameOver(cell);
    return;
  }

  cell.isRevealed = true;
  revealedCount++;
  cell.element.classList.remove('covered');
  cell.element.classList.add('revealed');
  cell.element.textContent = '';

  if (cell.neighborMines > 0) {
    cell.element.textContent = cell.neighborMines;
    cell.element.dataset.num = cell.neighborMines;
  } else {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const neighbor = board[nr][nc];
          if (!neighbor.isRevealed && neighbor.state !== 'flagged') {
            revealCell(nr, nc);
          }
        }
      }
    }
  }

  checkWinCondition();
}

// コード操作 (Chording)
function chordCell(r, c) {
  const cell = board[r][c];
  if (!cell.isRevealed || cell.neighborMines === 0) return;

  let flagCount = 0;
  const neighbors = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        neighbors.push(board[nr][nc]);
        if (board[nr][nc].state === 'flagged') {
          flagCount++;
        }
      }
    }
  }

  if (flagCount === cell.neighborMines) {
    for (const neighbor of neighbors) {
      if (!neighbor.isRevealed && neighbor.state !== 'flagged') {
        revealCell(neighbor.row, neighbor.col);
        if (gameState === 'lost') break;
      }
    }
  }
}

// マーカーのトグル (右クリック)
function toggleFlag(cell) {
  if (cell.isRevealed || gameState === 'lost' || gameState === 'won') return;

  if (cell.state === 'covered') {
    cell.state = 'flagged';
    cell.element.textContent = ICON_MARKER;
    flagsCount++;
  } else if (cell.state === 'flagged') {
    cell.state = 'covered';
    cell.element.textContent = '';
    flagsCount--;
  }

  updateDisplayNumbers();
}

// 勝利判定
function checkWinCondition() {
  const totalSafeCells = rows * cols - totalMines;
  if (revealedCount === totalSafeCells && gameState !== 'lost') {
    gameState = 'won';
    stopTimer();
    setStatus('won', 'CLEAR');

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        if (cell.isMine && cell.state !== 'flagged') {
          cell.state = 'flagged';
          cell.element.textContent = ICON_MARKER;
        }
      }
    }
    flagsCount = totalMines;
    updateDisplayNumbers();

    // 連勝記録更新 (ローカル)
    const diffStreak = streaks[currentDifficulty];
    diffStreak.current++;
    if (diffStreak.current > diffStreak.best) {
      diffStreak.best = diffStreak.current;
    }
    saveStreaks(streaks);
    updateStreakDisplay();

    // 🏆 GASへ連勝スコア送信
    submitStreakRanking(diffStreak.current, currentDifficulty);
  }
}

// ゲームオーバー処理
function gameOver(explodedCell) {
  gameState = 'lost';
  stopTimer();
  setStatus('lost', 'FAILED');

  streaks[currentDifficulty].current = 0;
  saveStreaks(streaks);
  updateStreakDisplay();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell === explodedCell) {
        cell.element.classList.remove('covered');
        cell.element.classList.add('exploded');
        cell.element.textContent = ICON_MINE;
      } else if (cell.isMine) {
        if (cell.state !== 'flagged') {
          cell.element.classList.remove('covered');
          cell.element.classList.add('revealed');
          cell.element.textContent = ICON_MINE;
        }
      } else if (cell.state === 'flagged') {
        cell.element.classList.add('wrong-flag');
        cell.element.textContent = ICON_MINE;
      }
    }
  }
}

// イベントハンドラ
function handleCellMouseDown(e) {
  if (gameState === 'lost' || gameState === 'won') return;

  const r = parseInt(e.currentTarget.dataset.row, 10);
  const c = parseInt(e.currentTarget.dataset.col, 10);
  const cell = board[r][c];

  if (e.button === 0) {
    if (!cell.isRevealed && cell.state === 'covered') {
      cell.element.classList.add('pressed');
    }
  }
}

function handleCellMouseUp(e) {
  if (gameState === 'lost' || gameState === 'won') return;

  const r = parseInt(e.currentTarget.dataset.row, 10);
  const c = parseInt(e.currentTarget.dataset.col, 10);
  const cell = board[r][c];

  if (e.button === 0) {
    if (cell.element.classList.contains('pressed')) {
      cell.element.classList.remove('pressed');
    }

    if (cell.isRevealed) {
      chordCell(r, c);
    } else {
      revealCell(r, c);
    }
  }
}

function handleCellContextMenu(e) {
  e.preventDefault();
  if (gameState === 'lost' || gameState === 'won') return;

  const r = parseInt(e.currentTarget.dataset.row, 10);
  const c = parseInt(e.currentTarget.dataset.col, 10);
  const cell = board[r][c];

  toggleFlag(cell);
}

window.addEventListener('mouseup', () => {
  document.querySelectorAll('.cell.pressed').forEach(el => el.classList.remove('pressed'));
});

// リセットボタン
statusBtn.addEventListener('click', () => {
  initGame(currentDifficulty);
});

// 難易度タブ切り替え
difficultyBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    difficultyBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const diff = btn.dataset.difficulty;
    initGame(diff);
  });
});

// 連勝リセットボタン
btnResetStreak.addEventListener('click', () => {
  if (confirm(`現在の難易度 (${DIFFICULTIES[currentDifficulty].name}) の連勝記録をリセットしますか？`)) {
    streaks[currentDifficulty] = { current: 0, best: 0 };
    saveStreaks(streaks);
    updateStreakDisplay();
  }
});

// 初期化実行
initPlayerProfile();
initGame('beginner');
