// ============================================================
// TETRIS FIGHTERS ONLINE — lobby.js
// Socket.IO lobby, room create/join, multiplayer game start
// ============================================================

let socket = null;
let currentRoom = null;

function initSocket() {
  if (socket) return;
  socket = io();
  window.gameSocket = socket;

  socket.on('room_created', ({ roomId, room }) => {
    currentRoom = room;
    document.getElementById('room-code-display').textContent = roomId;
    renderWaitingPlayers(room);
    showScreen('screen-waiting');
  });

  // FIX 1: joiner never saw the waiting screen — room_update now switches screen
  // FIX 2: joiner had no room code — now we grab it from the room object
  socket.on('room_update', ({ roomId, room }) => {
    currentRoom = room;
    // Switch joiner to waiting screen if they aren't already there
    const waitingScreen = document.getElementById('screen-waiting');
    if (!waitingScreen.classList.contains('active')) {
      document.getElementById('room-code-display').textContent = roomId;
      showScreen('screen-waiting');
    }
    renderWaitingPlayers(room);
  });

  socket.on('lobby_update', (rooms) => {
    renderRoomList(rooms);
  });

  // FIX 3: canvas getContext called before screen visible — show screen first,
  // then defer startGame into requestAnimationFrame so DOM has painted
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
      document.getElementById('result-title').textContent = '\uD83D\uDEAA Opponent Left';
      document.getElementById('result-char').textContent = CHARS[selectedChar];
      showScreen('screen-result');
    }
  });

  socket.on('error', ({ message }) => {
    alert('Error: ' + message);
  });

  socket.emit('get_lobby');
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

// FIX 4: ready button now disables + shows feedback so player knows click registered
function setReady() {
  if (!socket) return;
  const btn = document.getElementById('btn-ready');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '\u23F3 Waiting...';
  }
  socket.emit('player_ready');
}

function leaveRoom() {
  if (socket) socket.disconnect();
  socket = null;
  window.gameSocket = null;
  currentRoom = null;
  showScreen('screen-lobby');
  initSocket();
}

function renderWaitingPlayers(room) {
  const el = document.getElementById('waiting-players');
  el.innerHTML = room.players.map(p => `
    <div class="waiting-player">
      <span>${CHARS[p.character]} ${p.nickname}</span>
      <span class="ready-badge">${p.ready ? '\u2705 READY' : '\u23F3 Waiting'}</span>
    </div>
  `).join('');
  if (room.players.length < 2) {
    el.innerHTML += `<div class="waiting-player"><span style="color:#6a6a8e">Waiting for opponent...</span></div>`;
  }
  // Re-enable ready button if room update comes back (e.g. someone left)
  const btn = document.getElementById('btn-ready');
  if (btn && room.players.length < 2) {
    btn.disabled = false;
    btn.textContent = '\u2705 READY';
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
        <span class="room-players">${r.players.map(p => `${CHARS[p.character]} ${p.nickname}`).join(' vs ')} \u2022 ${r.slots} slot${r.slots !== 1 ? 's' : ''} open</span>
      </div>
      <button class="btn btn-secondary" onclick="joinRoom('${r.id}')">JOIN</button>
    </div>
  `).join('');
}
