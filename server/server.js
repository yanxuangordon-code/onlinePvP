'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { GameLoop } = require('./gameloop');

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

// Health check for Railway
app.get('/health', (req, res) => res.json({ status: 'ok', players: gameLoop.players.size }));

// Player count endpoint (used by home page)
app.get('/api/playercount', (req, res) => {
  res.json({ count: gameLoop.players.size });
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
  // Merge: always take the higher value for numeric stats
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

const gameLoop = new GameLoop(io);
gameLoop.start();

function assignTeam() {
  let ct = 0, t = 0;
  for (const [, p] of gameLoop.players) {
    if (p.team === 'ct') ct++;
    else t++;
  }
  return ct <= t ? 'ct' : 'terrorist';
}

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  socket.on('join', ({ name }) => {
    const playerName = (name || 'Player').slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, '');
    const team = assignTeam();
    const player = gameLoop.addPlayer(socket.id, playerName, team);

    socket.emit('joined', {
      id: socket.id,
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
    });

    io.emit('playerJoined', { id: socket.id, name: playerName, team });
    console.log(`  ${playerName} joined as ${team.toUpperCase()}`);
  });

  socket.on('input', (input) => {
    gameLoop.handleInput(socket.id, input);
  });

  socket.on('shoot', (data) => {
    gameLoop.handleShoot(socket.id, data);
  });

  socket.on('reload', () => {
    gameLoop.handleReload(socket.id);
  });

  socket.on('switchWeapon', ({ weapon }) => {
    const player = gameLoop.players.get(socket.id);
    if (player && !player.reloading) {
      player.weapon = weapon;
      socket.emit('weaponSwitched', { weapon });
    }
  });

  socket.on('disconnect', () => {
    const player = gameLoop.players.get(socket.id);
    if (player) {
      io.emit('playerLeft', { id: socket.id, name: player.name });
      console.log(`[-] ${player.name} disconnected`);
    }
    gameLoop.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 FPS Server running on http://localhost:${PORT}`);
  console.log(`   Game tick rate: 20 TPS`);
});
