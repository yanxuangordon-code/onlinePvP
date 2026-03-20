'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { RoomManager } = require('./rooms');

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// In-memory stats store (cloud save — persists for server session)
const playerStatsStore = new Map();

// Room manager
const roomManager = new RoomManager(io);

// Periodically clean up empty rooms
setInterval(() => roomManager.cleanup(), 60000);

// ---- REST API ----

// Health check for Railway
app.get('/health', (req, res) => res.json({ status: 'ok', players: roomManager.totalPlayers() }));

// Player count endpoint (used by home page)
app.get('/api/playercount', (req, res) => {
  res.json({ count: roomManager.totalPlayers() });
});

// List all rooms
app.get('/api/rooms', (req, res) => {
  res.json(roomManager.listRooms());
});

// Create a new room
app.post('/api/rooms', (req, res) => {
  const { name, mode, map, maxPlayers, botCount } = req.body || {};
  try {
    const room = roomManager.createRoom({ name, mode, map, maxPlayers, botCount });
    res.json(room.info);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Load cloud stats for a player
app.get('/api/stats/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const stats = playerStatsStore.get(name);
  res.json(stats || {});
});

// Save cloud stats for a player
app.post('/api/stats/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const existing = playerStatsStore.get(name) || {};
  const incoming = req.body || {};
  const merged = {
    playerName: name,
    totalKills: Math.max(existing.totalKills || 0, incoming.totalKills || 0),
    totalDeaths: Math.max(existing.totalDeaths || 0, incoming.totalDeaths || 0),
    totalGames: Math.max(existing.totalGames || 0, incoming.totalGames || 0),
    bestKillStreak: Math.max(existing.bestKillStreak || 0, incoming.bestKillStreak || 0),
    highestScore: Math.max(existing.highestScore || 0, incoming.highestScore || 0),
    lastPlayed: incoming.lastPlayed || existing.lastPlayed || null
  };
  playerStatsStore.set(name, merged);
  res.json({ ok: true, stats: merged });
});

// ---- Socket events ----

function assignTeam(gameLoop, mode) {
  if (mode === 'ffa') return 'ct'; // team irrelevant in FFA
  let ct = 0, t = 0;
  for (const [, p] of gameLoop.players) {
    if (p.isBot) continue;
    if (p.team === 'ct') ct++;
    else t++;
  }
  return ct <= t ? 'ct' : 'terrorist';
}

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);
  let currentRoomId = null;

  // Request list of rooms
  socket.on('listRooms', () => {
    socket.emit('roomList', roomManager.listRooms());
  });

  // Quick play: join best available room
  socket.on('quickPlay', ({ name }) => {
    const room = roomManager.getBestRoom();
    joinRoom(socket, room, name);
  });

  // Join specific room
  socket.on('joinRoom', ({ name, roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('joinError', { message: 'Room not found' }); return; }
    if (room.isFull()) { socket.emit('joinError', { message: 'Room is full' }); return; }
    joinRoom(socket, room, name);
  });

  // Legacy 'join' — join best room
  socket.on('join', ({ name }) => {
    const room = roomManager.getBestRoom();
    joinRoom(socket, room, name);
  });

  function joinRoom(sock, room, rawName) {
    if (currentRoomId) leaveRoom(sock, currentRoomId);

    const playerName = (rawName || 'Player').slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, '');
    const team = assignTeam(room.gameLoop, room.mode);
    const player = room.gameLoop.addPlayer(sock.id, playerName, team);

    sock.join(room.id);
    currentRoomId = room.id;

    sock.emit('joined', {
      id: sock.id,
      team,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      health: player.health,
      ammo: player.ammo.ammo,
      maxAmmo: player.ammo.maxAmmo,
      pistolAmmo: player.pistolAmmo.ammo,
      pistolMaxAmmo: player.pistolAmmo.maxAmmo,
      roomId: room.id,
      roomName: room.name,
      mode: room.mode,
      map: room.map,
    });

    io.to(room.id).emit('playerJoined', { id: sock.id, name: playerName, team });
    io.emit('roomListUpdate', roomManager.listRooms());
    console.log(`  ${playerName} joined room "${room.name}" (${room.mode}) as ${team.toUpperCase()}`);
  }

  function leaveRoom(sock, roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.gameLoop.players.get(sock.id);
    if (player) {
      io.to(roomId).emit('playerLeft', { id: sock.id, name: player.name });
      console.log(`[-] ${player.name} left room "${room.name}"`);
    }
    room.gameLoop.removePlayer(sock.id);
    sock.leave(roomId);
    io.emit('roomListUpdate', roomManager.listRooms());
  }

  socket.on('input', (input) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (room) room.gameLoop.handleInput(socket.id, input);
  });

  socket.on('shoot', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (room) room.gameLoop.handleShoot(socket.id, data);
  });

  socket.on('reload', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (room) room.gameLoop.handleReload(socket.id);
  });

  socket.on('switchWeapon', ({ weapon }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const player = room.gameLoop.players.get(socket.id);
    if (player && !player.reloading) {
      player.weapon = weapon;
      socket.emit('weaponSwitched', { weapon });
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId) {
      leaveRoom(socket, currentRoomId);
      currentRoomId = null;
    }
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🔥 HYPERFIRE Server running on http://localhost:${PORT}`);
  console.log(`   Game tick rate: 20 TPS`);
});
