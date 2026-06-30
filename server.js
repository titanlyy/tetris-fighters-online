const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// --- Room Manager ---
const rooms = {}; // { roomId: { players: [], state: 'waiting'|'playing' } }

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // Create a new room
  socket.on('create_room', ({ nickname, character }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, nickname, character, ready: false }],
      state: 'waiting'
    };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit('room_created', { roomId, room: rooms[roomId] });
    io.emit('lobby_update', getLobbyList());
    console.log(`[Room] ${roomId} created by ${nickname}`);
  });

  // Join an existing room
  socket.on('join_room', ({ roomId, nickname, character }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.players.length >= 2) return socket.emit('error', { message: 'Room is full' });
    if (room.state !== 'waiting') return socket.emit('error', { message: 'Game already started' });

    room.players.push({ id: socket.id, nickname, character, ready: false });
    socket.join(roomId);
    socket.data.roomId = roomId;
    io.to(roomId).emit('room_update', room);
    io.emit('lobby_update', getLobbyList());
    console.log(`[Room] ${nickname} joined ${roomId}`);
  });

  // Request lobby list
  socket.on('get_lobby', () => {
    socket.emit('lobby_update', getLobbyList());
  });

  // Player ready
  socket.on('player_ready', () => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.ready = true;
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      room.state = 'playing';
      io.to(room.id).emit('game_start', room);
      io.emit('lobby_update', getLobbyList());
    } else {
      io.to(room.id).emit('room_update', room);
    }
  });

  // Game state sync (board state broadcast)
  socket.on('game_state', (state) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('opponent_state', state);
  });

  // Attack event (garbage lines)
  socket.on('attack', ({ lines }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('receive_garbage', { lines });
  });

  // Game over
  socket.on('game_over', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit('opponent_lost');
      if (rooms[roomId]) rooms[roomId].state = 'waiting';
      io.emit('lobby_update', getLobbyList());
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      socket.to(roomId).emit('opponent_disconnected');
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    }
    io.emit('lobby_update', getLobbyList());
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

function getLobbyList() {
  return Object.values(rooms)
    .filter(r => r.state === 'waiting')
    .map(r => ({
      id: r.id,
      players: r.players.map(p => ({ nickname: p.nickname, character: p.character })),
      slots: 2 - r.players.length
    }));
}

server.listen(PORT, () => {
  console.log(`\n🎮 Tetris Fighters Online running at http://localhost:${PORT}\n`);
});
