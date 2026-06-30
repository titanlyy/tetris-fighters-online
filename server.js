// ============================================================
// TETRIS FIGHTERS ONLINE — server.js
// Express + Socket.IO — room management, multiplayer sync
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms
const rooms = {};

// In-memory leaderboard: { nickname -> { wins, losses } }
const leaderboard = {};

function ensureEntry(nickname) {
  if (!leaderboard[nickname]) leaderboard[nickname] = { wins: 0, losses: 0 };
}

function getLeaderboard() {
  return Object.entries(leaderboard)
    .map(([nickname, s]) => ({ nickname, wins: s.wins, losses: s.losses }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .slice(0, 20);
}

function broadcastLeaderboard() {
  io.emit('leaderboard_update', getLeaderboard());
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function getLobbyList() {
  return Object.entries(rooms)
    .filter(([, r]) => r.players.length < 2 && r.status === 'waiting')
    .map(([id, r]) => ({
      id,
      players: r.players,
      slots: 2 - r.players.length
    }));
}

function broadcastLobby() {
  io.emit('lobby_update', getLobbyList());
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('get_lobby', () => {
    socket.emit('lobby_update', getLobbyList());
    socket.emit('leaderboard_update', getLeaderboard());
  });

  socket.on('create_room', ({ nickname, character }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      id: roomId,
      status: 'waiting',
      players: [{ id: socket.id, nickname, character, ready: false }]
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room_created', { roomId, room: rooms[roomId] });
    broadcastLobby();
  });

  socket.on('join_room', ({ roomId, nickname, character }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'Room is full.' }); return; }
    if (room.status !== 'waiting') { socket.emit('error', { message: 'Game already in progress.' }); return; }

    room.players.push({ id: socket.id, nickname, character, ready: false });
    socket.join(roomId);
    socket.roomId = roomId;

    io.to(roomId).emit('room_update', { roomId, room });
    broadcastLobby();
  });

  socket.on('player_ready', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.ready = true;

    io.to(roomId).emit('room_update', { roomId, room });

    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      room.status = 'playing';
      io.to(roomId).emit('game_start', room);
      broadcastLobby();
    }
  });

  socket.on('game_state', (boardData) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('opponent_state', boardData);
  });

  socket.on('attack', ({ lines }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('receive_garbage', { lines });
  });

  // Loser emits game_over — server records scores and tells opponent they won
  socket.on('game_over', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    if (room.status === 'done') return; // prevent double-fire
    room.status = 'done';

    // Record win/loss
    const loser = room.players.find(p => p.id === socket.id);
    const winner = room.players.find(p => p.id !== socket.id);
    if (loser) { ensureEntry(loser.nickname); leaderboard[loser.nickname].losses++; }
    if (winner) { ensureEntry(winner.nickname); leaderboard[winner.nickname].wins++; }

    // Tell winner they won (loser already shows lose screen locally)
    socket.to(roomId).emit('opponent_lost');
    broadcastLeaderboard();
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    // If game was in progress, the remaining player wins by default
    if (room.status === 'playing') {
      const winner = room.players.find(p => p.id !== socket.id);
      const loser = room.players.find(p => p.id === socket.id);
      if (winner) { ensureEntry(winner.nickname); leaderboard[winner.nickname].wins++; }
      if (loser) { ensureEntry(loser.nickname); leaderboard[loser.nickname].losses++; }
      broadcastLeaderboard();
    }
    socket.to(roomId).emit('opponent_disconnected');
    delete rooms[roomId];
    broadcastLobby();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Tetris Fighters running on port ${PORT}`));
