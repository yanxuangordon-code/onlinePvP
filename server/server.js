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
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.static(path.join(__dirname, '..')));

app.get('/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

const rooms = new Map();      // roomId -> { id, name, map, gameLoop, sockets }
const playerRoom = new Map(); // socketId -> roomId

function genRoomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getRoomsList() {
  const list = [];
  for (const [id, room] of rooms) {
    list.push({ id, name: room.name, map: room.map, playerCount: room.sockets.size, maxPlayers: 10 });
  }
  return list;
}

function assignTeam(room) {
  let ct = 0, t = 0;
  for (const [, p] of room.gameLoop.players) {
    if (p.team === 'ct') ct++; else t++;
  }
  return ct <= t ? 'ct' : 'terrorist';
}

function joinRoom(socket, roomId, playerName, weapon) {
  const room = rooms.get(roomId);
  if (!room) { socket.emit('joinError', { message: 'Room not found' }); return; }
  if (room.sockets.size >= 10) { socket.emit('joinError', { message: 'Room is full' }); return; }

  const name = (playerName || 'Player').slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, '') || 'Player';
  const team = assignTeam(room);
  const player = room.gameLoop.addPlayer(socket.id, name, team, weapon);

  socket.join(roomId);
  room.sockets.add(socket.id);
  playerRoom.set(socket.id, roomId);

  socket.emit('joined', {
    id: socket.id, team, map: room.map,
    x: player.x, y: player.y, z: player.z, yaw: player.yaw,
    health: player.health, weapon: player.weapon,
    rifleAmmo:      player.rifleAmmo.ammo,   rifleMaxAmmo:   player.rifleAmmo.maxAmmo,
    pistolAmmo:     player.pistolAmmo.ammo,  pistolMaxAmmo:  player.pistolAmmo.maxAmmo,
    shotgunAmmo:    player.shotgunAmmo.ammo, shotgunMaxAmmo: player.shotgunAmmo.maxAmmo,
  });

  io.to(roomId).emit('playerJoined', { id: socket.id, name, team });
  io.emit('roomsList', getRoomsList());
  console.log(`  ${name} joined room ${roomId} (${room.map}) as ${team}`);
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('listRooms', () => {
    socket.emit('roomsList', getRoomsList());
  });

  socket.on('createRoom', ({ name, map, playerName, weapon }) => {
    const roomId = genRoomId();
    const roomName = (name || 'Room ' + roomId).slice(0, 30).trim() || 'Room ' + roomId;
    const validMaps = ['arena', 'dust', 'forest', 'facility', 'rooftop'];
    const mapName = validMaps.includes(map) ? map : 'arena';

    const gameLoop = new GameLoop(io, roomId, mapName);
    const room = { id: roomId, name: roomName, map: mapName, gameLoop, sockets: new Set() };
    rooms.set(roomId, room);
    gameLoop.start();

    joinRoom(socket, roomId, playerName, weapon);
    console.log(`[Room] Created: "${roomName}" map=${mapName} id=${roomId}`);
  });

  socket.on('joinRoom', ({ roomId, name, weapon }) => {
    joinRoom(socket, roomId, name, weapon);
  });

  socket.on('input', (input) => {
    const roomId = playerRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (room) room.gameLoop.handleInput(socket.id, input);
  });

  socket.on('shoot', (data) => {
    const roomId = playerRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (room) room.gameLoop.handleShoot(socket.id, data);
  });

  socket.on('reload', () => {
    const roomId = playerRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (room) room.gameLoop.handleReload(socket.id);
  });

  socket.on('switchWeapon', ({ weapon }) => {
    const roomId = playerRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (!room) return;
    const player = room.gameLoop.players.get(socket.id);
    if (player && !player.reloading && ['rifle', 'pistol', 'shotgun'].includes(weapon)) {
      player.weapon = weapon;
      socket.emit('weaponSwitched', { weapon });
    }
  });

  socket.on('disconnect', () => {
    const roomId = playerRoom.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const player = room.gameLoop.players.get(socket.id);
        if (player) io.to(roomId).emit('playerLeft', { id: socket.id, name: player.name });
        room.gameLoop.removePlayer(socket.id);
        room.sockets.delete(socket.id);
        if (room.sockets.size === 0) {
          room.gameLoop.stop();
          rooms.delete(roomId);
          console.log(`[Room] Removed empty room: ${roomId}`);
        }
        io.emit('roomsList', getRoomsList());
      }
      playerRoom.delete(socket.id);
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 FPS Server running on http://localhost:${PORT}`);
  console.log(`   Tick rate: ${1000 / 50} TPS | Maps: arena, dust, forest, facility, rooftop`);
});
