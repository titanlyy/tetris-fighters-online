// ============================================================
// TETRIS FIGHTERS ONLINE — lobby.js
// Socket.IO lobby, room create/join, multiplayer game start
// ============================================================

let socket = null;
let currentRoom = null;

// Called from PLAY NOW and Back to Lobby buttons
// Connects socket FIRST so room list is live before player does anything
function enterLobby() {
  showScreen('screen-lobby');
  initSocket();
}

function initSocket() {
  if (socket && socket.connected) return;
  socket = io();
  window.gameSocket = socket;

  socket.on('connect', () => {
    // Request current lobby state as soon as we connect
    socket.emit('get_lobby');
  });

  socket.on('room_created', ({ roomId, room }) => {
    currentRoom = room;
    document.getElementById('room-code-display').textContent = roomId;
    renderWaitingPlayers(room);
    showScreen('screen-waiting');
  });

  // Joiner: switch to waiting screen + show room code on room_update
  socket.on('room_update', ({ roomId, room }) => {
    currentRoom = room;
    const waitingScreen = document.getElementById('screen-waiting');
    if (!waitingScreen.classList.contains('active')) {
      document.getElementById('room-code-display').textContent = roomId;
      showScreen('screen-waiting');
    }
    renderWaitingPlayers(room);
  });

  // Real-time lobby list — fires whenever any room is created, joined, or closed
  socket.on('lobby_update', (rooms) => {
    renderRoomList(rooms);
  });

  // Show screen first, then init canvas in next animation frame
  socket.on('game_start', (room) => {
    currentRoom = room;
    const myIdx = room.players.findIndex(p => p.id === socket.id);
    const oppIdx = myIdx === 0 ? 1 : 0;
    const oppChar = room.players[oppIdx] ? room.players[oppIdx].character : 1;
    showScreen('screen-game');
    requestAnimationFrame(() => {
      startGame(false, oppChar);
      setupMultiplayerSync();
    });
  });

  socket.on('opponent_state', (state) => {
    if (!game || game.over) return;
    renderOpponentBoard(state);
  });

  socket.on('receive_garbage', ({ lines }) => {
    if (game && !game.over) game.receiveGarbage(lines);
  });

  socket.on('opponent_lost', () => {
    if (game && !game.over) game.endGame(true);
  });

  socket.on('opponent_disconnected', () => {
    if (game && !game.over) {
      game.over = true;
      game.destroy();
      document.getElementById('result-title').textContent = '🚪 Opponent Left';
      document.getElementById('result-char').textContent = CHARS[selectedChar];
      showScreen('screen-result');
    }
  });

  socket.on('error', ({ message }) => {
    alert('Error: ' + message);
  });
}

function setupMultiplayerSync() {
  const syncInterval = setInterval(() => {
    if (!game || game.over) { clearInterval(syncInterval); return; }
    socket.emit('game_state', serializeBoard(game.board));
  }, 100);
}

function serializeBoard(board) {
  return board.map(row => row.join(','));
}

function renderOpponentBoard(state) {
  if (!game) return;
  const ctx = game.ctx2;
  const board = state.map(row => row.split(',').map(Number));
  game.drawBoard(ctx, board);
}

// ---- Lobby UI ----
function createRoom() {
  const nickname = document.getElementById('nickname').value.trim();
  if (!nickname) { alert('Enter a nickname first!'); return; }
  initSocket();
  socket.emit('create_room', { nickname, character: selectedChar });
}

function joinRoom(roomId) {
  const nickname = document.getElementById('nickname').value.trim();
  if (!nickname) { alert('Enter a nickname first!'); return; }
  initSocket();
  socket.emit('join_room', { roomId, nickname, character: selectedChar });
}

function setReady() {
  if (!socket) return;
  const btn = document.getElementById('btn-ready');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Waiting...';
  }
  socket.emit('player_ready');
}

function leaveRoom() {
  if (socket) socket.disconnect();
  socket = null;
  window.gameSocket = null;
  currentRoom = null;
  enterLobby();
}

function renderWaitingPlayers(room) {
  const el = document.getElementById('waiting-players');
  el.innerHTML = room.players.map(p => `
    <div class="waiting-player">
      <span>${CHARS[p.character]} ${p.nickname}</span>
      <span class="ready-badge">${p.ready ? '✅ READY' : '⏳ Waiting'}</span>
    </div>
  `).join('');
  if (room.players.length < 2) {
    el.innerHTML += `<div class="waiting-player"><span style="color:#6a6a8e">Waiting for opponent...</span></div>`;
  }
  const btn = document.getElementById('btn-ready');
  if (btn && room.players.length < 2) {
    btn.disabled = false;
    btn.textContent = '✅ READY';
  }
}

function renderRoomList(rooms) {
  const el = document.getElementById('room-list');
  if (!rooms || rooms.length === 0) {
    el.innerHTML = '<p class="muted">No open rooms. Create one!</p>';
    return;
  }
  el.innerHTML = rooms.map(r => `
    <div class="room-entry">
      <div class="room-info">
        <span class="room-id">${r.id}</span>
        <span class="room-players">${r.players.map(p => `${CHARS[p.character]} ${p.nickname}`).join(' vs ')} • ${r.slots} slot${r.slots !== 1 ? 's' : ''} open</span>
      </div>
      <button class="btn btn-secondary" onclick="joinRoom('${r.id}')">JOIN</button>
    </div>
  `).join('');
}
