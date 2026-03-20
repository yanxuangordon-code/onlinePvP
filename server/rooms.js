'use strict';

const { GameLoop } = require('./gameloop');

let _nextRoomId = 1;

const MAPS = ['arena'];
const MODES = ['tdm', 'ffa', 'ctf', 'pvc'];
const MODE_LABELS = { tdm: 'Team Deathmatch', ffa: 'Free For All', ctf: 'Capture the Flag', pvc: 'vs Bots' };
const MAP_LABELS = { arena: 'FPS Arena' };

class Room {
  constructor(io, options = {}) {
    this.id = 'room_' + (_nextRoomId++);
    this.name = (options.name || 'Room').slice(0, 32);
    this.mode = MODES.includes(options.mode) ? options.mode : 'tdm';
    this.map = MAPS.includes(options.map) ? options.map : 'arena';
    this.maxPlayers = Math.max(2, Math.min(options.maxPlayers || 12, 16));
    this.io = io;
    this.gameLoop = new GameLoop(io, this.id, this.mode);
    this.gameLoop.start();
    this.createdAt = Date.now();

    // Seed PvC rooms with bots
    if (this.mode === 'pvc') {
      const botCount = options.botCount || 4;
      for (let i = 0; i < botCount; i++) {
        this.gameLoop.addBot('terrorist');
      }
    }
  }

  get playerCount() {
    let count = 0;
    for (const [, p] of this.gameLoop.players) {
      if (!p.isBot) count++;
    }
    return count;
  }

  get info() {
    return {
      id: this.id,
      name: this.name,
      mode: this.mode,
      modeLabel: MODE_LABELS[this.mode] || this.mode,
      map: this.map,
      mapLabel: MAP_LABELS[this.map] || this.map,
      maxPlayers: this.maxPlayers,
      playerCount: this.playerCount,
      createdAt: this.createdAt,
    };
  }

  isFull() { return this.playerCount >= this.maxPlayers; }
  isEmpty() { return this.playerCount === 0; }

  destroy() {
    this.gameLoop.stop();
  }
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    // Default room
    this._defaultRoomId = this.createRoom({ name: 'Main Arena', mode: 'tdm', map: 'arena' }).id;
  }

  createRoom(options) {
    const room = new Room(this.io, options);
    this.rooms.set(room.id, room);
    console.log(`[Room] Created: ${room.id} "${room.name}" mode=${room.mode}`);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(id) || null;
  }

  listRooms() {
    return Array.from(this.rooms.values()).map(r => r.info);
  }

  getBestRoom() {
    // Find the most populated non-full non-pvc room
    let best = null;
    for (const room of this.rooms.values()) {
      if (!room.isFull() && room.mode !== 'pvc') {
        if (!best || room.playerCount > best.playerCount) best = room;
      }
    }

    // If no humans are currently online, fall back to a bot room so the
    // player isn't alone in an empty arena
    if (!best || best.playerCount === 0) {
      const totalHumans = this.totalPlayers();
      if (totalHumans === 0) {
        // Reuse an existing non-full pvc room first
        for (const room of this.rooms.values()) {
          if (!room.isFull() && room.mode === 'pvc') return room;
        }
        return this.createRoom({ name: 'Quick Bot Arena', mode: 'pvc', map: 'arena', botCount: 5 });
      }
    }

    if (!best) {
      // All non-pvc rooms full — create a new TDM room
      best = this.createRoom({ name: 'Auto Arena', mode: 'tdm', map: 'arena' });
    }
    return best;
  }

  cleanup() {
    if (this.rooms.size <= 1) return;
    for (const [id, room] of this.rooms) {
      if (id !== this._defaultRoomId && room.isEmpty()) {
        room.destroy();
        this.rooms.delete(id);
        console.log(`[Room] Removed empty room: ${id}`);
      }
    }
  }

  totalPlayers() {
    let n = 0;
    for (const room of this.rooms.values()) n += room.playerCount;
    return n;
  }
}

module.exports = { RoomManager, MODES, MAPS, MODE_LABELS, MAP_LABELS };
