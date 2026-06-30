// ============================================================
// TETRIS FIGHTERS ONLINE — game.js
// Core Tetris engine + renderer + CPU AI + game loop
// ============================================================

const COLS = 10, ROWS = 20, BLOCK = 30;
const COLORS = ['', '#ff6ec7','#7ef4fb','#ffe66d','#56f06e','#ff4f4f','#b57bff','#ff9a3c'];
const CHARS = ['\uD83D\uDC31','\uD83E\uDD8A','\uD83D\uDC3C','\uD83D\uDC30'];
const CHAR_NAMES = ['Miko','Kira','Zuko','Nova'];

const PIECES = [
  [[1,1,1,1]],
  [[2,2],[2,2]],
  [[0,3,0],[3,3,3]],
  [[0,4,4],[4,4,0]],
  [[5,5,0],[0,5,5]],
  [[6,0,0],[6,6,6]],
  [[0,0,7],[7,7,7]]
];

function rotatePiece(piece) {
  return piece[0].map((_, i) => piece.map(row => row[i]).reverse());
}
function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}
function randPiece() {
  return JSON.parse(JSON.stringify(PIECES[Math.floor(Math.random() * PIECES.length)]));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let selectedChar = 0;
function selectChar(idx) {
  selectedChar = idx;
  document.querySelectorAll('.char-option').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.char-option[data-char="${idx}"]`).classList.add('selected');
}

let game = null;

class TetrisGame {
  constructor(canvasP1, canvasP2, canvasHold, canvasNext, cpuMode = false) {
    this.cvs1 = canvasP1;
    this.ctx1 = canvasP1.getContext('2d');
    this.cvs2 = canvasP2;
    this.ctx2 = canvasP2.getContext('2d');
    this.ctxHold = canvasHold.getContext('2d');
    this.ctxNext = canvasNext.getContext('2d');
    this.cpuMode = cpuMode;
    this.reset();
  }

  reset() {
    this.board = emptyBoard();
    this.boardP2 = emptyBoard();
    this.current = randPiece();
    this.currentX = 3;
    this.currentY = 0;
    this.next = randPiece();
    this.held = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.scoreP2 = 0;
    this.linesP2 = 0;
    this.levelP2 = 1;
    this.hpP1 = 100;
    this.hpP2 = 100;
    this.garbageQueue = 0;
    this.over = false;
    this.dropInterval = 800;
    this.lastDrop = performance.now();
    this.particles = [];
    this.cpuState = { board: emptyBoard(), current: randPiece(), x: 3, y: 0, next: randPiece(), dropInterval: 600, lastDrop: performance.now() };
    this.loop = null;
    this.keys = {};
    this.setupKeys();
  }

  setupKeys() {
    this._keydown = (e) => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','KeyZ','KeyC'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      if (e.code === 'ArrowLeft') this.move(-1);
      if (e.code === 'ArrowRight') this.move(1);
      if (e.code === 'ArrowUp' || e.code === 'KeyZ') this.rotate();
      if (e.code === 'Space') this.hardDrop();
      if (e.code === 'KeyC') this.holdPiece();
    };
    this._keyup = (e) => { this.keys[e.code] = false; };
    document.addEventListener('keydown', this._keydown);
    document.addEventListener('keyup', this._keyup);
  }

  destroy() {
    document.removeEventListener('keydown', this._keydown);
    document.removeEventListener('keyup', this._keyup);
    if (this.loop) cancelAnimationFrame(this.loop);
  }

  start() {
    const tick = (now) => {
      this.update(now);
      this.draw();
      if (!this.over) this.loop = requestAnimationFrame(tick);
    };
    this.loop = requestAnimationFrame(tick);
  }

  collides(piece, board, ox, oy) {
    for (let r = 0; r < piece.length; r++)
      for (let c = 0; c < piece[r].length; c++)
        if (piece[r][c]) {
          const nx = ox + c, ny = oy + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
    return false;
  }

  move(dir) {
    if (!this.collides(this.current, this.board, this.currentX + dir, this.currentY))
      this.currentX += dir;
  }

  rotate() {
    const r = rotatePiece(this.current);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks)
      if (!this.collides(r, this.board, this.currentX + k, this.currentY)) {
        this.current = r; this.currentX += k; break;
      }
  }

  hardDrop() {
    while (!this.collides(this.current, this.board, this.currentX, this.currentY + 1))
      this.currentY++;
    this.lock();
  }

  holdPiece() {
    if (!this.canHold) return;
    if (this.held) {
      [this.current, this.held] = [this.held, this.current];
    } else {
      this.held = this.current;
      this.current = this.next;
      this.next = randPiece();
    }
    this.currentX = 3; this.currentY = 0;
    this.canHold = false;
  }

  ghostY() {
    let gy = this.currentY;
    while (!this.collides(this.current, this.board, this.currentX, gy + 1)) gy++;
    return gy;
  }

  lock() {
    for (let r = 0; r < this.current.length; r++)
      for (let c = 0; c < this.current[r].length; c++)
        if (this.current[r][c]) {
          const y = this.currentY + r;
          if (y < 0) { this.endGame(false); return; }
          this.board[y][this.currentX + c] = this.current[r][c];
        }
    const cleared = this.clearLines();
    if (cleared > 0) this.onClear(cleared);
    this.applyGarbage();
    this.current = this.next;
    this.next = randPiece();
    this.currentX = 3; this.currentY = 0;
    this.canHold = true;
    if (this.collides(this.current, this.board, this.currentX, this.currentY)) this.endGame(false);
  }

  clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(v => v !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(0));
        cleared++; r++;
      }
    }
    return cleared;
  }

  onClear(n) {
    const pts = [0, 100, 300, 500, 800];
    this.score += (pts[n] || 800) * this.level;
    this.lines += n;
    this.level = Math.floor(this.lines / 10) + 1;
    this.dropInterval = Math.max(100, 800 - (this.level - 1) * 70);
    const attackLines = [0, 0, 1, 2, 4][n] || 4;
    this.triggerAttack(attackLines);
    this.spawnParticles(n);
    this.triggerCharAttack('p1', n);
    document.getElementById('score-p1').textContent = this.score;
    document.getElementById('lines-p1').textContent = this.lines;
    document.getElementById('level-p1').textContent = this.level;
    if (window.gameSocket) window.gameSocket.emit('attack', { lines: attackLines });
  }

  triggerAttack(lines) {
    if (this.cpuMode) {
      this.addGarbageToCPU(lines);
      this.hpP2 = Math.max(0, this.hpP2 - lines * 8);
      this.updateHP();
    }
  }

  applyGarbage() {
    if (this.garbageQueue <= 0) return;
    for (let i = 0; i < this.garbageQueue; i++) {
      this.board.shift();
      const gap = Math.floor(Math.random() * COLS);
      const row = Array(COLS).fill(8);
      row[gap] = 0;
      this.board.push(row);
    }
    this.garbageQueue = 0;
  }

  receiveGarbage(lines) {
    this.garbageQueue += lines;
    this.hpP1 = Math.max(0, this.hpP1 - lines * 8);
    this.updateHP();
    this.triggerCharAttack('p2', lines);
  }

  updateHP() {
    document.querySelector('#hp-bar-p1 .hp-fill').style.width = this.hpP1 + '%';
    document.querySelector('#hp-bar-p2 .hp-fill').style.width = this.hpP2 + '%';
    if (this.hpP1 <= 0) this.endGame(false);
    if (this.hpP2 <= 0) this.endGame(true);
  }

  triggerCharAttack(who, n) {
    const id = who === 'p1' ? 'char-portrait-p1' : 'char-portrait-p2';
    const victimId = who === 'p1' ? 'char-portrait-p2' : 'char-portrait-p1';
    const el = document.getElementById(id);
    const victim = document.getElementById(victimId);
    el.classList.add('attack');
    victim.classList.add('hit');
    if (n >= 2) {
      document.getElementById('screen-game').classList.add('shake');
      setTimeout(() => document.getElementById('screen-game').classList.remove('shake'), 200);
    }
    setTimeout(() => { el.classList.remove('attack'); victim.classList.remove('hit'); }, 300);
  }

  spawnParticles(n) {
    const colors = ['#ff6ec7','#7ef4fb','#ffe66d','#56f06e'];
    for (let i = 0; i < n * 8; i++) {
      this.particles.push({
        x: Math.random() * COLS * BLOCK,
        y: Math.random() * ROWS * BLOCK,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 2,
        life: 40,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 4
      });
    }
  }

  // won      = true if this player won
  // isRemote = true when triggered by opponent_lost event (winner side)
  //            skip emitting game_over so we don't loop back to the loser
  endGame(won, isRemote = false) {
    this.over = true;
    this.destroy();
    if (!won && !isRemote && window.gameSocket) {
      // Only the loser tells the server they lost
      window.gameSocket.emit('game_over');
    }
    setTimeout(() => {
      document.getElementById('result-title').textContent = won ? '\uD83C\uDF89 YOU WIN!' : '\uD83D\uDC80 YOU LOSE';
      document.getElementById('result-char').textContent = CHARS[selectedChar];
      showScreen('screen-result');
    }, 800);
  }

  cpuBestMove(board, piece) {
    let best = null, bestScore = -Infinity;
    const rotations = [piece, rotatePiece(piece), rotatePiece(rotatePiece(piece)), rotatePiece(rotatePiece(rotatePiece(piece)))];
    const seen = new Set();
    for (const rot of rotations) {
      const key = JSON.stringify(rot);
      if (seen.has(key)) continue; seen.add(key);
      for (let x = -1; x < COLS; x++) {
        let y = 0;
        while (!this.collides(rot, board, x, y + 1) && y < ROWS) y++;
        if (this.collides(rot, board, x, y)) continue;
        const testBoard = board.map(r => [...r]);
        for (let r = 0; r < rot.length; r++)
          for (let c = 0; c < rot[r].length; c++)
            if (rot[r][c] && y + r >= 0) testBoard[y + r][x + c] = rot[r][c];
        const score = this.evalBoard(testBoard);
        if (score > bestScore) { bestScore = score; best = { rot, x, y }; }
      }
    }
    return best;
  }

  evalBoard(board) {
    let holes = 0, height = 0, bumpiness = 0;
    const heights = [];
    for (let c = 0; c < COLS; c++) {
      let h = 0;
      for (let r = 0; r < ROWS; r++) if (board[r][c]) { h = ROWS - r; break; }
      heights.push(h);
      height += h;
    }
    for (let c = 0; c < COLS; c++)
      for (let r = ROWS - heights[c]; r < ROWS; r++)
        if (!board[r][c]) holes++;
    for (let c = 0; c < COLS - 1; c++) bumpiness += Math.abs(heights[c] - heights[c + 1]);
    let cleared = 0;
    for (let r = 0; r < ROWS; r++) if (board[r].every(v => v)) cleared++;
    return cleared * 300 - holes * 200 - bumpiness * 30 - height * 10;
  }

  addGarbageToCPU(lines) {
    for (let i = 0; i < lines; i++) {
      this.cpuState.board.shift();
      const gap = Math.floor(Math.random() * COLS);
      const row = Array(COLS).fill(8);
      row[gap] = 0;
      this.cpuState.board.push(row);
    }
  }

  updateCPU(now) {
    if (!this.cpuMode) return;
    const cs = this.cpuState;
    if (now - cs.lastDrop > cs.dropInterval) {
      cs.lastDrop = now;
      if (!this.collides(cs.current, cs.board, cs.x, cs.y + 1)) {
        cs.y++;
      } else {
        for (let r = 0; r < cs.current.length; r++)
          for (let c = 0; c < cs.current[r].length; c++)
            if (cs.current[r][c] && cs.y + r >= 0) cs.board[cs.y + r][cs.x + c] = cs.current[r][c];
        const n = this.clearCPULines();
        if (n > 0) {
          const a = [0, 0, 1, 2, 4][n] || 4;
          this.garbageQueue += a;
          this.hpP1 = Math.max(0, this.hpP1 - a * 8);
          this.updateHP();
          this.triggerCharAttack('p2', n);
          this.scoreP2 += ([0,100,300,500,800][n]||800);
          this.linesP2 += n;
          this.levelP2 = Math.floor(this.linesP2 / 10) + 1;
          document.getElementById('score-p2').textContent = this.scoreP2;
          document.getElementById('lines-p2').textContent = this.linesP2;
          document.getElementById('level-p2').textContent = this.levelP2;
        }
        cs.current = cs.next;
        cs.next = randPiece();
        cs.x = 3; cs.y = 0;
        if (this.collides(cs.current, cs.board, cs.x, cs.y)) { this.endGame(true); return; }
        const best = this.cpuBestMove(cs.board, cs.current);
        if (best) { cs.current = best.rot; cs.x = best.x; }
      }
    }
  }

  clearCPULines() {
    let cleared = 0;
    const cs = this.cpuState;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (cs.board[r].every(v => v !== 0)) {
        cs.board.splice(r, 1);
        cs.board.unshift(Array(COLS).fill(0));
        cleared++; r++;
      }
    }
    return cleared;
  }

  update(now) {
    if (this.over) return;
    const interval = this.keys['ArrowDown'] ? Math.min(80, this.dropInterval) : this.dropInterval;
    if (now - this.lastDrop > interval) {
      this.lastDrop = now;
      if (!this.collides(this.current, this.board, this.currentX, this.currentY + 1)) {
        this.currentY++;
      } else {
        this.lock();
      }
    }
    this.updateCPU(now);
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--; });
  }

  drawBlock(ctx, x, y, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, BLOCK - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, 4);
    ctx.globalAlpha = 1;
  }

  drawBoard(ctx, board) {
    ctx.clearRect(0, 0, COLS * BLOCK, ROWS * BLOCK);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      ctx.strokeRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
    }
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c]) this.drawBlock(ctx, c, r, COLORS[board[r][c]] || '#555');
  }

  drawPiece(ctx, piece, ox, oy, alpha = 1) {
    for (let r = 0; r < piece.length; r++)
      for (let c = 0; c < piece[r].length; c++)
        if (piece[r][c]) this.drawBlock(ctx, ox + c, oy + r, COLORS[piece[r][c]], alpha);
  }

  drawMiniPiece(ctx, piece, canvasSize) {
    if (!piece) return;
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    const mB = 18;
    const offX = Math.floor((canvasSize - piece[0].length * mB) / 2);
    const offY = Math.floor((canvasSize - piece.length * mB) / 2);
    for (let r = 0; r < piece.length; r++)
      for (let c = 0; c < piece[r].length; c++)
        if (piece[r][c]) {
          ctx.fillStyle = COLORS[piece[r][c]];
          ctx.fillRect(offX + c * mB, offY + r * mB, mB - 2, mB - 2);
        }
  }

  draw() {
    this.drawBoard(this.ctx1, this.board);
    this.drawPiece(this.ctx1, this.current, this.currentX, this.ghostY(), 0.25);
    this.drawPiece(this.ctx1, this.current, this.currentX, this.currentY);
    this.particles.forEach(p => {
      this.ctx1.globalAlpha = p.life / 40;
      this.ctx1.fillStyle = p.color;
      this.ctx1.fillRect(p.x, p.y, p.size, p.size);
      this.ctx1.globalAlpha = 1;
    });
    this.drawMiniPiece(this.ctxHold, this.held, 80);
    this.drawMiniPiece(this.ctxNext, this.next, 80);
    if (this.cpuMode) {
      this.drawBoard(this.ctx2, this.cpuState.board);
      const gy2 = (() => { let y = this.cpuState.y; while (!this.collides(this.cpuState.current, this.cpuState.board, this.cpuState.x, y + 1)) y++; return y; })();
      this.drawPiece(this.ctx2, this.cpuState.current, this.cpuState.x, gy2, 0.25);
      this.drawPiece(this.ctx2, this.cpuState.current, this.cpuState.x, this.cpuState.y);
    }
  }
}

function startGame(cpuMode = false, p2Char = 1, p1Name = null, p2Name = null) {
  const c1 = document.getElementById('canvas-p1');
  const c2 = document.getElementById('canvas-p2');
  const ch = document.getElementById('canvas-hold');
  const cn = document.getElementById('canvas-next');

  const lobbyNickname = document.getElementById('nickname').value.trim();
  const displayP1 = p1Name || lobbyNickname || 'You';
  const displayP2 = p2Name
    ? (cpuMode ? `\uD83E\uDD16 ${p2Name}` : p2Name)
    : (cpuMode ? `\uD83E\uDD16 CPU` : 'Opponent');

  document.getElementById('char-portrait-p1').textContent = CHARS[selectedChar];
  document.getElementById('char-name-p1').textContent = displayP1;
  document.getElementById('char-portrait-p2').textContent = CHARS[p2Char];
  document.getElementById('char-name-p2').textContent = displayP2;

  document.getElementById('score-p1').textContent = '0';
  document.getElementById('lines-p1').textContent = '0';
  document.getElementById('level-p1').textContent = '1';
  document.getElementById('score-p2').textContent = '0';
  document.getElementById('lines-p2').textContent = '0';
  document.getElementById('level-p2').textContent = '1';
  document.querySelector('#hp-bar-p1 .hp-fill').style.width = '100%';
  document.querySelector('#hp-bar-p2 .hp-fill').style.width = '100%';

  if (game) game.destroy();
  game = new TetrisGame(c1, c2, ch, cn, cpuMode);
  game.start();
}

function startCPUGame() {
  const cpuChar = (selectedChar + 1) % CHARS.length;
  const lobbyNickname = document.getElementById('nickname').value.trim() || 'You';
  const cpuName = CHAR_NAMES[cpuChar];
  showScreen('screen-game');
  requestAnimationFrame(() => startGame(true, cpuChar, lobbyNickname, cpuName));
}
