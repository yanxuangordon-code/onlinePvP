'use strict';

// Game constants
const TICK_RATE = 20; // 20 ticks per second
const PLAYER_SPEED = 0.15;
const GRAVITY = -0.015;
const JUMP_FORCE = 0.25;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const RESPAWN_TIME = 3000; // ms

const WEAPONS = {
  rifle: {
    damage: 25,
    fireRate: 100, // ms between shots
    ammo: 30,
    maxAmmo: 90,
    range: 200,
    spread: 0.02,
    reloadTime: 2000,
    automatic: true
  },
  pistol: {
    damage: 35,
    fireRate: 400,
    ammo: 12,
    maxAmmo: 36,
    range: 150,
    spread: 0.04,
    reloadTime: 1500,
    automatic: false
  }
};

// Map walls/obstacles for server-side collision
const MAP_BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

// Simplified wall list for server-side collision detection
// Format: { x, z, w, d } = position and size of box obstacles
// Wall dimensions match visual geometry in client/game.js _buildMap()
const WALLS = [
  // Central building
  { x: 0, z: 0, w: 6, d: 6 },
  // CT long walls (visual depth 0.4)
  { x: -15, z: -20, w: 8, d: 0.5 },
  { x: 15, z: -20, w: 8, d: 0.5 },
  // CT pillars (visual width 0.4)
  { x: -8, z: -30, w: 0.5, d: 8 },
  { x: 8, z: -30, w: 0.5, d: 8 },
  // T long walls
  { x: -15, z: 20, w: 8, d: 0.5 },
  { x: 15, z: 20, w: 8, d: 0.5 },
  // T pillars
  { x: -8, z: 30, w: 0.5, d: 8 },
  { x: 8, z: 30, w: 0.5, d: 8 },
  // Mid crates
  { x: -10, z: 0, w: 3, d: 3 },
  { x: 10, z: 0, w: 3, d: 3 },
  { x: 0, z: -12, w: 3, d: 3 },
  { x: 0, z: 12, w: 3, d: 3 },
  // Side long walls (visual width 0.4)
  { x: -25, z: 0, w: 0.5, d: 20 },
  { x: 25, z: 0, w: 0.5, d: 20 },
  // Small barriers near center
  { x: -5, z: -5, w: 0.4, d: 4 },
  { x: 5, z: -5, w: 0.4, d: 4 },
  { x: -5, z: 5, w: 0.4, d: 4 },
  { x: 5, z: 5, w: 0.4, d: 4 },
  // Scattered crates
  { x: -18, z: -10, w: 1.5, d: 1.5 },
  { x: -18, z: 10, w: 1.5, d: 1.5 },
  { x: 18, z: -10, w: 1.5, d: 1.5 },
  { x: 18, z: 10, w: 1.5, d: 1.5 },
  // Spawn back walls
  { x: 0, z: -45.5, w: 20, d: 0.6 },
  { x: 0, z: 45.5, w: 20, d: 0.6 },
];

const SPAWN_POINTS = {
  ct: [
    { x: -5, z: -38 },
    { x: 0, z: -38 },
    { x: 5, z: -38 },
    { x: -5, z: -35 },
    { x: 5, z: -35 },
  ],
  terrorist: [
    { x: -5, z: 38 },
    { x: 0, z: 38 },
    { x: 5, z: 38 },
    { x: -5, z: 35 },
    { x: 5, z: 35 },
  ]
};

// CTF flag base positions
const CTF_FLAG_BASES = {
  ct: { x: 0, z: -36 },
  terrorist: { x: 0, z: 36 }
};

function collidesWithWall(x, z, radius) {
  if (x - radius < MAP_BOUNDS.minX || x + radius > MAP_BOUNDS.maxX) return true;
  if (z - radius < MAP_BOUNDS.minZ || z + radius > MAP_BOUNDS.maxZ) return true;

  for (const wall of WALLS) {
    const halfW = wall.w / 2 + radius;
    const halfD = wall.d / 2 + radius;
    if (
      x > wall.x - halfW && x < wall.x + halfW &&
      z > wall.z - halfD && z < wall.z + halfD
    ) {
      return true;
    }
  }
  return false;
}

function getSpawnPoint(team, usedSpawns) {
  const spawns = SPAWN_POINTS[team] || SPAWN_POINTS.ct;
  for (const sp of spawns) {
    const key = `${sp.x},${sp.z}`;
    if (!usedSpawns.has(key)) {
      usedSpawns.add(key);
      return { x: sp.x, y: PLAYER_HEIGHT / 2, z: sp.z };
    }
  }
  const sp = spawns[Math.floor(Math.random() * spawns.length)];
  return { x: sp.x, y: PLAYER_HEIGHT / 2, z: sp.z };
}

function createPlayer(id, name, team) {
  const usedSpawns = new Set();
  const pos = getSpawnPoint(team, usedSpawns);
  return {
    id,
    name,
    team,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    vy: 0,
    yaw: team === 'ct' ? Math.PI : 0,
    pitch: 0,
    health: 100,
    alive: true,
    weapon: 'rifle',
    ammo: { ...WEAPONS.rifle },
    pistolAmmo: { ...WEAPONS.pistol },
    lastShot: 0,
    reloading: false,
    reloadEnd: 0,
    kills: 0,
    deaths: 0,
    score: 0,
    onGround: false,
    moveForward: false,
    moveBack: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    isBot: false,
  };
}

let _botCounter = 0;

class GameLoop {
  constructor(io, roomId, mode) {
    this.io = io;
    this.roomId = roomId || 'default';
    this.mode = mode || 'tdm'; // 'tdm', 'ffa', 'ctf', 'pvc'
    this.players = new Map();
    this.killFeed = [];
    this.scores = { ct: 0, terrorist: 0 };
    this.interval = null;

    // CTF flag state
    if (this.mode === 'ctf') {
      this.ctfFlags = {
        ct: { x: CTF_FLAG_BASES.ct.x, z: CTF_FLAG_BASES.ct.z, y: 0.5, carriedBy: null, atBase: true, returnTimeout: null },
        terrorist: { x: CTF_FLAG_BASES.terrorist.x, z: CTF_FLAG_BASES.terrorist.z, y: 0.5, carriedBy: null, atBase: true, returnTimeout: null },
      };
    }
  }

  // Broadcast to everyone in this room
  _broadcast(event, data) {
    this.io.to(this.roomId).emit(event, data);
  }

  // Send to specific socket
  _send(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }

  start() {
    this.interval = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  addPlayer(id, name, team) {
    const player = createPlayer(id, name, team);
    this.players.set(id, player);
    return player;
  }

  addBot(team) {
    _botCounter++;
    const id = `bot_${_botCounter}`;
    const botNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Ghost', 'Hawk', 'Iron', 'Jade'];
    const name = 'BOT_' + botNames[(_botCounter - 1) % botNames.length];
    const bot = createPlayer(id, name, team);
    bot.isBot = true;
    bot._botDirTimer = 0;
    bot._botShootCooldown = Math.floor(Math.random() * 10);
    this.players.set(id, bot);
    return bot;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  handleInput(id, input) {
    const player = this.players.get(id);
    if (!player || !player.alive || player.isBot) return;

    player.moveForward = input.forward;
    player.moveBack = input.back;
    player.moveLeft = input.left;
    player.moveRight = input.right;
    player.jump = input.jump;
    player.yaw = input.yaw;
    player.pitch = input.pitch;

    if (input.switchWeapon && input.switchWeapon !== player.weapon) {
      player.weapon = input.switchWeapon;
    }
  }

  handleShoot(id, shootData) {
    const player = this.players.get(id);
    if (!player || !player.alive) return;

    const now = Date.now();
    const weapon = WEAPONS[player.weapon];
    const ammoKey = player.weapon === 'rifle' ? 'ammo' : 'pistolAmmo';
    const ammoObj = player[ammoKey];

    if (player.reloading) return;
    if (now - player.lastShot < weapon.fireRate) return;
    if (ammoObj.ammo <= 0) {
      if (player.isBot) this.handleReload(id);
      return;
    }

    player.lastShot = now;
    ammoObj.ammo--;

    // Raycast against all players
    const origin = { x: player.x, y: player.y + 0.6, z: player.z };
    const dir = {
      x: Math.sin(player.yaw) * Math.cos(player.pitch) + (Math.random() - 0.5) * weapon.spread,
      y: -Math.sin(player.pitch) + (Math.random() - 0.5) * weapon.spread,
      z: Math.cos(player.yaw) * Math.cos(player.pitch) + (Math.random() - 0.5) * weapon.spread
    };
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    dir.x /= len; dir.y /= len; dir.z /= len;

    let hit = null;
    let minDist = weapon.range;

    for (const [otherId, other] of this.players) {
      if (otherId === id || !other.alive) continue;
      // FFA: everyone is an enemy. TDM/CTF/PvC: opposite team only
      const isEnemy = this.mode === 'ffa' ? true : other.team !== player.team;
      if (!isEnemy) continue;

      // Simple sphere intersection
      const dx = other.x - origin.x;
      const dy = (other.y + 0.3) - origin.y;
      const dz = other.z - origin.z;

      const dot = dx * dir.x + dy * dir.y + dz * dir.z;
      if (dot < 0) continue;

      const cx = origin.x + dir.x * dot - other.x;
      const cy = origin.y + dir.y * dot - (other.y + 0.3);
      const cz = origin.z + dir.z * dot - other.z;
      const distSq = cx * cx + cy * cy + cz * cz;

      if (distSq < 0.6 * 0.6 && dot < minDist) {
        minDist = dot;
        hit = other;
      }
    }

    const hitPoint = {
      x: origin.x + dir.x * minDist,
      y: origin.y + dir.y * minDist,
      z: origin.z + dir.z * minDist
    };

    if (hit) {
      const headshot = shootData && shootData.headshot;
      const dmg = headshot ? weapon.damage * 2.5 : weapon.damage;
      hit.health -= dmg;

      if (!hit.isBot) this._send(hit.id, 'damaged', { health: hit.health, attackerId: id });

      if (hit.health <= 0) {
        this.killPlayer(hit, player);
      }

      this._broadcast('hitConfirm', { shooterId: id, targetId: hit.id, hitPoint, headshot: !!headshot });
    } else {
      this._broadcast('bulletImpact', { shooterId: id, hitPoint, dir });
    }

    // Notify shooter of updated ammo
    if (!player.isBot) {
      this._send(id, 'ammoUpdate', {
        ammo: player.ammo.ammo,
        maxAmmo: player.ammo.maxAmmo,
        pistolAmmo: player.pistolAmmo.ammo,
        pistolMaxAmmo: player.pistolAmmo.maxAmmo
      });
    }
  }

  handleReload(id) {
    const player = this.players.get(id);
    if (!player || player.reloading) return;
    const weapon = WEAPONS[player.weapon];
    const ammoKey = player.weapon === 'rifle' ? 'ammo' : 'pistolAmmo';
    const ammoObj = player[ammoKey];

    const needed = weapon.ammo - ammoObj.ammo;
    if (needed <= 0 || ammoObj.maxAmmo <= 0) return;

    player.reloading = true;
    player.reloadEnd = Date.now() + weapon.reloadTime;

    if (!player.isBot) this._send(id, 'reloadStart', { duration: weapon.reloadTime, weapon: player.weapon });

    setTimeout(() => {
      if (!this.players.has(id)) return;
      const take = Math.min(needed, ammoObj.maxAmmo);
      ammoObj.ammo += take;
      ammoObj.maxAmmo -= take;
      player.reloading = false;
      if (!player.isBot) {
        this._send(id, 'reloadEnd', {
          ammo: ammoObj.ammo,
          maxAmmo: ammoObj.maxAmmo
        });
      }
    }, weapon.reloadTime);
  }

  killPlayer(victim, killer) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths++;
    killer.kills++;
    killer.score += 100;
    this.scores[killer.team] = (this.scores[killer.team] || 0) + 1;

    // Drop CTF flag if victim was carrying it
    if (this.mode === 'ctf' && this.ctfFlags) {
      for (const [team, flag] of Object.entries(this.ctfFlags)) {
        if (flag.carriedBy === victim.id) {
          flag.carriedBy = null;
          if (flag.returnTimeout) clearTimeout(flag.returnTimeout);
          flag.returnTimeout = setTimeout(() => {
            flag.x = CTF_FLAG_BASES[team].x;
            flag.z = CTF_FLAG_BASES[team].z;
            flag.y = 0.5;
            flag.atBase = true;
            this._broadcast('flagEvent', { type: 'returned', team });
          }, 10000);
          this._broadcast('flagEvent', { type: 'dropped', team, x: victim.x, z: victim.z });
        }
      }
    }

    const killEvent = {
      killerId: killer.id,
      killerName: killer.name,
      killerTeam: killer.team,
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      weapon: killer.weapon,
      timestamp: Date.now()
    };

    this.killFeed.unshift(killEvent);
    if (this.killFeed.length > 10) this.killFeed.pop();

    this._broadcast('playerKilled', killEvent);
    this._broadcast('scoreUpdate', this.scores);

    // Schedule respawn
    setTimeout(() => {
      if (!this.players.has(victim.id)) return;
      const usedSpawns = new Set();
      const pos = getSpawnPoint(victim.team, usedSpawns);
      victim.x = pos.x;
      victim.y = pos.y;
      victim.z = pos.z;
      victim.vy = 0;
      victim.health = 100;
      victim.alive = true;
      victim.ammo = { ...WEAPONS.rifle };
      victim.pistolAmmo = { ...WEAPONS.pistol };
      victim.reloading = false;
      victim.weapon = 'rifle';
      if (!victim.isBot) this._send(victim.id, 'respawn', { x: victim.x, y: victim.y, z: victim.z });
    }, RESPAWN_TIME);
  }

  // ---- Bot AI ----
  _tickBot(bot) {
    if (!bot.alive) return;

    // Wander: periodically change direction
    bot._botDirTimer--;
    if (bot._botDirTimer <= 0) {
      bot.yaw = Math.random() * Math.PI * 2;
      bot._botDirTimer = 30 + Math.floor(Math.random() * 50);
      bot.moveForward = true;
      bot.moveBack = false;
      bot.moveLeft = false;
      bot.moveRight = false;
    }

    // Find nearest enemy
    let nearest = null, minDist = Infinity;
    for (const [id, p] of this.players) {
      if (id === bot.id || !p.alive) continue;
      const isEnemy = this.mode === 'ffa' ? true : p.team !== bot.team;
      if (!isEnemy) continue;
      const dx = p.x - bot.x, dz = p.z - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) { minDist = dist; nearest = p; }
    }

    if (nearest && minDist < 28) {
      // Aim toward nearest enemy with slight inaccuracy
      const dx = nearest.x - bot.x, dz = nearest.z - bot.z;
      bot.yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.25;
      bot.pitch = (Math.random() - 0.5) * 0.1;
      bot.moveForward = minDist > 5;

      // Shoot
      bot._botShootCooldown--;
      if (bot._botShootCooldown <= 0) {
        this.handleShoot(bot.id, {});
        bot._botShootCooldown = 2 + Math.floor(Math.random() * 5);
      }
    }
  }

  // ---- CTF Logic ----
  _tickCTF() {
    const pickupRadius = 1.5;
    const captureRadius = 3.5;

    for (const [id, player] of this.players) {
      if (!player.alive) continue;

      for (const [flagTeam, flag] of Object.entries(this.ctfFlags)) {
        const isEnemyFlag = flagTeam !== player.team;
        const dx = player.x - flag.x;
        const dz = player.z - flag.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Pick up enemy flag
        if (isEnemyFlag && flag.atBase && !flag.carriedBy && dist < pickupRadius) {
          flag.carriedBy = id;
          flag.atBase = false;
          this._broadcast('flagEvent', { type: 'pickup', team: flagTeam, playerId: id, playerName: player.name });
        }

        // Capture: carrying enemy flag, reached own base
        const enemyFlagTeam = player.team === 'ct' ? 'terrorist' : 'ct';
        const enemyFlag = this.ctfFlags[enemyFlagTeam];
        const ownFlag = this.ctfFlags[player.team];

        if (!isEnemyFlag && ownFlag.atBase && enemyFlag.carriedBy === id) {
          const bdx = player.x - ownFlag.x;
          const bdz = player.z - ownFlag.z;
          if (Math.sqrt(bdx * bdx + bdz * bdz) < captureRadius) {
            enemyFlag.carriedBy = null;
            enemyFlag.atBase = true;
            enemyFlag.x = CTF_FLAG_BASES[enemyFlagTeam].x;
            enemyFlag.z = CTF_FLAG_BASES[enemyFlagTeam].z;
            enemyFlag.y = 0.5;
            if (enemyFlag.returnTimeout) clearTimeout(enemyFlag.returnTimeout);
            this.scores[player.team] = (this.scores[player.team] || 0) + 1;
            player.score += 200;
            player.kills += 1;
            this._broadcast('flagEvent', { type: 'captured', team: enemyFlagTeam, playerId: id, playerName: player.name });
            this._broadcast('scoreUpdate', this.scores);
          }
        }
      }
    }

    // Move flags with carriers; drop if carrier gone
    for (const [team, flag] of Object.entries(this.ctfFlags)) {
      if (flag.carriedBy) {
        const carrier = this.players.get(flag.carriedBy);
        if (carrier && carrier.alive) {
          flag.x = carrier.x;
          flag.z = carrier.z;
          flag.y = carrier.y + 1.8;
        } else {
          flag.carriedBy = null;
          if (flag.returnTimeout) clearTimeout(flag.returnTimeout);
          flag.returnTimeout = setTimeout(() => {
            flag.x = CTF_FLAG_BASES[team].x;
            flag.z = CTF_FLAG_BASES[team].z;
            flag.y = 0.5;
            flag.atBase = true;
            this._broadcast('flagEvent', { type: 'returned', team });
          }, 10000);
          this._broadcast('flagEvent', { type: 'dropped', team, x: flag.x, z: flag.z });
        }
      }
    }
  }

  tick() {
    for (const [id, player] of this.players) {
      if (!player.alive) continue;

      // Tick bots
      if (player.isBot) this._tickBot(player);

      // Movement
      let dx = 0, dz = 0;
      const cos = Math.cos(player.yaw);
      const sin = Math.sin(player.yaw);

      // Camera faces -Z when yaw=0, so forward = (-sin, 0, -cos)
      if (player.moveForward) { dx -= sin; dz -= cos; }
      if (player.moveBack)    { dx += sin; dz += cos; }
      if (player.moveLeft)    { dx -= cos; dz += sin; }
      if (player.moveRight)   { dx += cos; dz -= sin; }

      const moveLen = Math.sqrt(dx * dx + dz * dz);
      if (moveLen > 0) {
        dx = (dx / moveLen) * PLAYER_SPEED;
        dz = (dz / moveLen) * PLAYER_SPEED;
      }

      // Apply gravity
      player.vy += GRAVITY;
      const newY = player.y + player.vy;

      if (newY <= PLAYER_HEIGHT / 2) {
        player.y = PLAYER_HEIGHT / 2;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.y = newY;
        player.onGround = false;
      }

      if (player.jump && player.onGround) {
        player.vy = JUMP_FORCE;
        player.onGround = false;
      }

      // Try X movement
      const newX = player.x + dx;
      if (!collidesWithWall(newX, player.z, PLAYER_RADIUS)) {
        player.x = newX;
      }
      // Try Z movement
      const newZ = player.z + dz;
      if (!collidesWithWall(player.x, newZ, PLAYER_RADIUS)) {
        player.z = newZ;
      }
    }

    // CTF flag logic
    if (this.mode === 'ctf' && this.ctfFlags) this._tickCTF();

    // Broadcast game state
    const state = [];
    for (const [id, p] of this.players) {
      state.push({
        id: p.id,
        name: p.name,
        team: p.team,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        health: p.health,
        alive: p.alive,
        weapon: p.weapon,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        isBot: p.isBot || false,
      });
    }

    const payload = { players: state, scores: this.scores, mode: this.mode };
    if (this.mode === 'ctf' && this.ctfFlags) {
      payload.flags = {
        ct: {
          x: this.ctfFlags.ct.x, z: this.ctfFlags.ct.z, y: this.ctfFlags.ct.y,
          atBase: this.ctfFlags.ct.atBase, carriedBy: this.ctfFlags.ct.carriedBy
        },
        terrorist: {
          x: this.ctfFlags.terrorist.x, z: this.ctfFlags.terrorist.z, y: this.ctfFlags.terrorist.y,
          atBase: this.ctfFlags.terrorist.atBase, carriedBy: this.ctfFlags.terrorist.carriedBy
        },
      };
    }
    this._broadcast('gameState', payload);
  }
}

module.exports = { GameLoop, WEAPONS, SPAWN_POINTS, WALLS, MAP_BOUNDS };
