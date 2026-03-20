'use strict';

const TICK_RATE = 20;
const PLAYER_SPEED = 0.15;
const GRAVITY = -0.015;
const JUMP_FORCE = 0.25;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const RESPAWN_TIME = 3000;

const WEAPONS = {
  rifle: {
    damage: 25, fireRate: 100, ammo: 30, maxAmmo: 90,
    range: 200, spread: 0.02, reloadTime: 2000, automatic: true, pellets: 1
  },
  pistol: {
    damage: 35, fireRate: 400, ammo: 12, maxAmmo: 36,
    range: 150, spread: 0.04, reloadTime: 1500, automatic: false, pellets: 1
  },
  shotgun: {
    damage: 18, fireRate: 900, ammo: 8, maxAmmo: 24,
    range: 20, spread: 0.15, reloadTime: 2500, automatic: false, pellets: 6
  }
};

const MAP_CONFIGS = {
  arena: {
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    walls: [
      { x: 0, z: 0, w: 6, d: 6 },
      { x: -15, z: -20, w: 8, d: 2 }, { x: 15, z: -20, w: 8, d: 2 },
      { x: -8, z: -30, w: 2, d: 8 },  { x: 8, z: -30, w: 2, d: 8 },
      { x: -15, z: 20, w: 8, d: 2 },  { x: 15, z: 20, w: 8, d: 2 },
      { x: -8, z: 30, w: 2, d: 8 },   { x: 8, z: 30, w: 2, d: 8 },
      { x: -10, z: 0, w: 3, d: 3 },   { x: 10, z: 0, w: 3, d: 3 },
      { x: 0, z: -12, w: 3, d: 3 },   { x: 0, z: 12, w: 3, d: 3 },
      { x: -25, z: 0, w: 2, d: 20 },  { x: 25, z: 0, w: 2, d: 20 },
    ],
    spawns: {
      ct: [{ x: -5, z: -38 }, { x: 0, z: -38 }, { x: 5, z: -38 }, { x: -5, z: -35 }, { x: 5, z: -35 }],
      terrorist: [{ x: -5, z: 38 }, { x: 0, z: 38 }, { x: 5, z: 38 }, { x: -5, z: 35 }, { x: 5, z: 35 }]
    }
  },
  dust: {
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    walls: [
      { x: 0, z: -10, w: 5, d: 5 },   { x: 0, z: 10, w: 5, d: 5 },
      { x: -18, z: 0, w: 5, d: 5 },   { x: 18, z: 0, w: 5, d: 5 },
      { x: -20, z: -20, w: 4, d: 4 }, { x: 20, z: 20, w: 4, d: 4 },
      { x: -20, z: 20, w: 4, d: 4 },  { x: 20, z: -20, w: 4, d: 4 },
      { x: -8, z: -30, w: 3, d: 3 },  { x: 8, z: -30, w: 3, d: 3 },
      { x: -8, z: 30, w: 3, d: 3 },   { x: 8, z: 30, w: 3, d: 3 },
    ],
    spawns: {
      ct: [{ x: -5, z: -38 }, { x: 0, z: -38 }, { x: 5, z: -38 }, { x: -5, z: -35 }, { x: 5, z: -35 }],
      terrorist: [{ x: -5, z: 38 }, { x: 0, z: 38 }, { x: 5, z: 38 }, { x: -5, z: 35 }, { x: 5, z: 35 }]
    }
  },
  forest: {
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    walls: [
      { x: -10, z: -10, w: 2, d: 2 }, { x: 10, z: -10, w: 2, d: 2 },
      { x: -10, z: 10, w: 2, d: 2 },  { x: 10, z: 10, w: 2, d: 2 },
      { x: 0, z: 0, w: 3, d: 3 },
      { x: -20, z: 5, w: 2, d: 2 },   { x: 20, z: -5, w: 2, d: 2 },
      { x: -5, z: -22, w: 2, d: 2 },  { x: 5, z: 22, w: 2, d: 2 },
      { x: -15, z: 20, w: 2, d: 2 },  { x: 15, z: -20, w: 2, d: 2 },
      { x: -25, z: -12, w: 2, d: 2 }, { x: 25, z: 12, w: 2, d: 2 },
      { x: 0, z: -28, w: 6, d: 2 },   { x: 0, z: 28, w: 6, d: 2 },
      { x: 18, z: 0, w: 2, d: 2 },    { x: -18, z: 0, w: 2, d: 2 },
    ],
    spawns: {
      ct: [{ x: -5, z: -38 }, { x: 0, z: -38 }, { x: 5, z: -38 }, { x: -8, z: -35 }, { x: 8, z: -35 }],
      terrorist: [{ x: -5, z: 38 }, { x: 0, z: 38 }, { x: 5, z: 38 }, { x: -8, z: 35 }, { x: 8, z: 35 }]
    }
  },
  facility: {
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    walls: [
      { x: -18, z: 0, w: 2, d: 24 },  { x: 18, z: 0, w: 2, d: 24 },
      { x: 0, z: -18, w: 24, d: 2 },  { x: 0, z: 18, w: 24, d: 2 },
      { x: -8, z: -8, w: 8, d: 2 },   { x: 8, z: -8, w: 8, d: 2 },
      { x: -8, z: 8, w: 8, d: 2 },    { x: 8, z: 8, w: 8, d: 2 },
      { x: 0, z: 0, w: 3, d: 3 },
      { x: -30, z: 0, w: 2, d: 8 },   { x: 30, z: 0, w: 2, d: 8 },
      { x: 0, z: -30, w: 8, d: 2 },   { x: 0, z: 30, w: 8, d: 2 },
    ],
    spawns: {
      ct: [{ x: -5, z: -40 }, { x: 0, z: -40 }, { x: 5, z: -40 }, { x: -5, z: -37 }, { x: 5, z: -37 }],
      terrorist: [{ x: -5, z: 40 }, { x: 0, z: 40 }, { x: 5, z: 40 }, { x: -5, z: 37 }, { x: 5, z: 37 }]
    }
  },
  rooftop: {
    bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    walls: [
      { x: 0, z: 0, w: 8, d: 4 },
      { x: -12, z: -8, w: 4, d: 4 },  { x: 12, z: 8, w: 4, d: 4 },
      { x: -12, z: 8, w: 4, d: 4 },   { x: 12, z: -8, w: 4, d: 4 },
      { x: 0, z: -20, w: 6, d: 2 },   { x: 0, z: 20, w: 6, d: 2 },
      { x: -20, z: 0, w: 2, d: 6 },   { x: 20, z: 0, w: 2, d: 6 },
      { x: -5, z: -15, w: 2, d: 2 },  { x: 5, z: -15, w: 2, d: 2 },
      { x: -5, z: 15, w: 2, d: 2 },   { x: 5, z: 15, w: 2, d: 2 },
    ],
    spawns: {
      ct: [{ x: -5, z: -30 }, { x: 0, z: -30 }, { x: 5, z: -30 }, { x: -5, z: -28 }, { x: 5, z: -28 }],
      terrorist: [{ x: -5, z: 30 }, { x: 0, z: 30 }, { x: 5, z: 30 }, { x: -5, z: 28 }, { x: 5, z: 28 }]
    }
  }
};

function collidesWithWall(x, z, radius, bounds, walls) {
  if (x - radius < bounds.minX || x + radius > bounds.maxX) return true;
  if (z - radius < bounds.minZ || z + radius > bounds.maxZ) return true;
  for (const wall of walls) {
    const halfW = wall.w / 2 + radius;
    const halfD = wall.d / 2 + radius;
    if (x > wall.x - halfW && x < wall.x + halfW && z > wall.z - halfD && z < wall.z + halfD) {
      return true;
    }
  }
  return false;
}

function getSpawnPoint(team, spawns) {
  const list = spawns[team];
  return list[Math.floor(Math.random() * list.length)];
}

function createPlayer(id, name, team, startWeapon, spawns) {
  const sp = getSpawnPoint(team, spawns);
  const weapon = WEAPONS[startWeapon] ? startWeapon : 'rifle';
  return {
    id, name, team,
    x: sp.x, y: PLAYER_HEIGHT / 2, z: sp.z,
    vy: 0,
    yaw: team === 'ct' ? Math.PI : 0,
    pitch: 0,
    health: 100,
    alive: true,
    weapon,
    rifleAmmo:   { ammo: WEAPONS.rifle.ammo,   maxAmmo: WEAPONS.rifle.maxAmmo },
    pistolAmmo:  { ammo: WEAPONS.pistol.ammo,  maxAmmo: WEAPONS.pistol.maxAmmo },
    shotgunAmmo: { ammo: WEAPONS.shotgun.ammo, maxAmmo: WEAPONS.shotgun.maxAmmo },
    lastShot: 0,
    reloading: false,
    kills: 0, deaths: 0, score: 0,
    onGround: false,
    moveForward: false, moveBack: false, moveLeft: false, moveRight: false, jump: false,
  };
}

class GameLoop {
  constructor(io, roomId, mapName) {
    this.io = io;
    this.roomId = roomId;
    this.mapName = mapName || 'arena';
    this.mapConfig = MAP_CONFIGS[this.mapName] || MAP_CONFIGS.arena;
    this.players = new Map();
    this.scores = { ct: 0, terrorist: 0 };
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  emit(event, data) {
    this.io.to(this.roomId).emit(event, data);
  }

  emitTo(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }

  getAmmoKey(weapon) {
    if (weapon === 'pistol') return 'pistolAmmo';
    if (weapon === 'shotgun') return 'shotgunAmmo';
    return 'rifleAmmo';
  }

  addPlayer(id, name, team, startWeapon) {
    const player = createPlayer(id, name, team, startWeapon, this.mapConfig.spawns);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  handleInput(id, input) {
    const player = this.players.get(id);
    if (!player || !player.alive) return;
    player.moveForward = input.forward;
    player.moveBack    = input.back;
    player.moveLeft    = input.left;
    player.moveRight   = input.right;
    player.jump        = input.jump;
    player.yaw         = input.yaw;
    player.pitch       = input.pitch;
  }

  handleShoot(id, shootData) {
    const player = this.players.get(id);
    if (!player || !player.alive) return;

    const now = Date.now();
    const weapon = WEAPONS[player.weapon];
    const ammoKey = this.getAmmoKey(player.weapon);
    const ammoObj = player[ammoKey];

    if (player.reloading || now - player.lastShot < weapon.fireRate || ammoObj.ammo <= 0) return;

    player.lastShot = now;
    ammoObj.ammo--;

    const pellets = weapon.pellets || 1;
    const origin = { x: player.x, y: player.y + 0.6, z: player.z };

    for (let p = 0; p < pellets; p++) {
      const sx = (Math.random() - 0.5) * weapon.spread;
      const sy = (Math.random() - 0.5) * weapon.spread;
      const sz = (Math.random() - 0.5) * weapon.spread;

      // Correct forward direction: -sin(yaw), -cos(yaw)
      const dir = {
        x: -Math.sin(player.yaw) * Math.cos(player.pitch) + sx,
        y: -Math.sin(player.pitch) + sy,
        z: -Math.cos(player.yaw) * Math.cos(player.pitch) + sz
      };
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      dir.x /= len; dir.y /= len; dir.z /= len;

      let hit = null;
      let minDist = weapon.range;

      for (const [otherId, other] of this.players) {
        if (otherId === id || !other.alive || other.team === player.team) continue;
        const dx = other.x - origin.x;
        const dy = (other.y + 0.3) - origin.y;
        const dz = other.z - origin.z;
        const dot = dx * dir.x + dy * dir.y + dz * dir.z;
        if (dot < 0) continue;
        const cx = origin.x + dir.x * dot - other.x;
        const cy = origin.y + dir.y * dot - (other.y + 0.3);
        const cz = origin.z + dir.z * dot - other.z;
        if (cx * cx + cy * cy + cz * cz < 0.6 * 0.6 && dot < minDist) {
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
        const headshot = shootData && shootData.headshot && pellets === 1;
        const dmg = headshot ? weapon.damage * 2.5 : weapon.damage;
        hit.health -= dmg;
        this.emitTo(hit.id, 'damaged', { health: Math.max(0, hit.health), attackerId: id });
        if (hit.health <= 0) this.killPlayer(hit, player);
        this.emit('hitConfirm', { shooterId: id, targetId: hit.id, hitPoint, headshot: !!headshot });
      } else {
        this.emit('bulletImpact', { shooterId: id, hitPoint, dir });
      }
    }

    this.emitTo(id, 'ammoUpdate', {
      rifleAmmo:      player.rifleAmmo.ammo,   rifleMaxAmmo:   player.rifleAmmo.maxAmmo,
      pistolAmmo:     player.pistolAmmo.ammo,  pistolMaxAmmo:  player.pistolAmmo.maxAmmo,
      shotgunAmmo:    player.shotgunAmmo.ammo, shotgunMaxAmmo: player.shotgunAmmo.maxAmmo,
    });
  }

  handleReload(id) {
    const player = this.players.get(id);
    if (!player || player.reloading) return;
    const weapon = WEAPONS[player.weapon];
    const ammoKey = this.getAmmoKey(player.weapon);
    const ammoObj = player[ammoKey];
    const needed = weapon.ammo - ammoObj.ammo;
    if (needed <= 0 || ammoObj.maxAmmo <= 0) return;

    player.reloading = true;
    this.emitTo(id, 'reloadStart', { duration: weapon.reloadTime, weapon: player.weapon });

    setTimeout(() => {
      if (!this.players.has(id)) return;
      const take = Math.min(needed, ammoObj.maxAmmo);
      ammoObj.ammo += take;
      ammoObj.maxAmmo -= take;
      player.reloading = false;
      this.emitTo(id, 'reloadEnd', { weapon: player.weapon, ammo: ammoObj.ammo, maxAmmo: ammoObj.maxAmmo });
    }, weapon.reloadTime);
  }

  killPlayer(victim, killer) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths++;
    killer.kills++;
    killer.score += 100;
    this.scores[killer.team]++;

    this.emit('playerKilled', {
      killerId: killer.id, killerName: killer.name, killerTeam: killer.team,
      victimId: victim.id, victimName: victim.name, victimTeam: victim.team,
      weapon: killer.weapon
    });
    this.emit('scoreUpdate', this.scores);

    setTimeout(() => {
      if (!this.players.has(victim.id)) return;
      const sp = getSpawnPoint(victim.team, this.mapConfig.spawns);
      victim.x = sp.x; victim.y = PLAYER_HEIGHT / 2; victim.z = sp.z;
      victim.vy = 0; victim.health = 100; victim.alive = true;
      victim.rifleAmmo   = { ammo: WEAPONS.rifle.ammo,   maxAmmo: WEAPONS.rifle.maxAmmo };
      victim.pistolAmmo  = { ammo: WEAPONS.pistol.ammo,  maxAmmo: WEAPONS.pistol.maxAmmo };
      victim.shotgunAmmo = { ammo: WEAPONS.shotgun.ammo, maxAmmo: WEAPONS.shotgun.maxAmmo };
      victim.reloading = false;
      victim.weapon = 'rifle';
      this.emitTo(victim.id, 'respawn', { x: victim.x, y: victim.y, z: victim.z });
    }, RESPAWN_TIME);
  }

  tick() {
    const { bounds, walls } = this.mapConfig;

    for (const [, player] of this.players) {
      if (!player.alive) continue;

      let dx = 0, dz = 0;
      const cos = Math.cos(player.yaw);
      const sin = Math.sin(player.yaw);

      // Correct Three.js convention: forward = -sin(yaw), -cos(yaw)
      if (player.moveForward) { dx -= sin; dz -= cos; }
      if (player.moveBack)    { dx += sin; dz += cos; }
      if (player.moveLeft)    { dx -= cos; dz += sin; }
      if (player.moveRight)   { dx += cos; dz -= sin; }

      const moveLen = Math.sqrt(dx * dx + dz * dz);
      if (moveLen > 0) {
        dx = (dx / moveLen) * PLAYER_SPEED;
        dz = (dz / moveLen) * PLAYER_SPEED;
      }

      player.vy += GRAVITY;
      const newY = player.y + player.vy;
      if (newY <= PLAYER_HEIGHT / 2) {
        player.y = PLAYER_HEIGHT / 2; player.vy = 0; player.onGround = true;
      } else {
        player.y = newY; player.onGround = false;
      }
      if (player.jump && player.onGround) {
        player.vy = JUMP_FORCE; player.onGround = false;
      }

      const newX = player.x + dx;
      if (!collidesWithWall(newX, player.z, PLAYER_RADIUS, bounds, walls)) player.x = newX;
      const newZ = player.z + dz;
      if (!collidesWithWall(player.x, newZ, PLAYER_RADIUS, bounds, walls)) player.z = newZ;
    }

    const state = [];
    for (const [, p] of this.players) {
      state.push({
        id: p.id, name: p.name, team: p.team,
        x: p.x, y: p.y, z: p.z,
        yaw: p.yaw, pitch: p.pitch,
        health: p.health, alive: p.alive, weapon: p.weapon,
        kills: p.kills, deaths: p.deaths, score: p.score
      });
    }
    this.emit('gameState', { players: state, scores: this.scores });
  }
}

module.exports = { GameLoop, WEAPONS, MAP_CONFIGS };
