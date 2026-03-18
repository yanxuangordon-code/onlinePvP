# FPS Arena - 3D Multiplayer Browser FPS

A Counter-Strike / Krunker.io style multiplayer FPS game built with Three.js, Socket.io, Node.js, and Express.

## Features

- **First-person 3D view** with mouse look and WASD movement
- **2 Teams**: Counter-Terrorists (CT) vs Terrorists (T) — auto-balanced
- **Weapons**: AK-47 (rifle, automatic) and Pistol (semi-auto)
- **Full health system**: 100 HP, respawn after 3 seconds
- **CS-style map**: Walls, boxes, catwalks, A/B sites, team spawn zones
- **Real-time multiplayer** via Socket.io (20 TPS server tick rate)
- **Kill feed**, **scoreboard** (Tab), **minimap**, **ammo counter**, **health bar**
- **Particle effects**: muzzle flash, impact particles, blood effects
- **Gun models**: 3D first-person weapon with recoil animation

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look |
| Left Click | Shoot |
| R | Reload |
| 1 | Switch to Rifle (AK-47) |
| 2 | Switch to Pistol |
| Scroll | Cycle weapons |
| Space | Jump |
| Tab | Toggle scoreboard |

## Project Structure

```
project/
├── index.html          # Main game page (frontend)
├── client/
│   ├── game.js         # Three.js game engine, rendering, input
│   ├── socket.js       # Socket.io client wrapper
│   └── ui.js           # HUD: health, ammo, minimap, scoreboard, kill feed
├── server/
│   ├── server.js       # Express + Socket.io server
│   └── gameloop.js     # Server-side game loop, physics, hit detection
├── assets/
│   └── textures/       # (Procedurally generated, no files needed)
├── package.json
└── README.md
```

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repo
git clone <your-repo-url>
cd online-pvp-fps

# Install dependencies
npm install

# Start server
npm start
# or with auto-reload:
npm run dev
```

Open `http://localhost:3000` in your browser (multiple tabs = multiple players).

## Deployment

### Backend → Railway.app

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select this repository
4. Railway auto-detects Node.js and runs `npm start`
5. Add environment variable if needed:
   - `PORT` is set automatically by Railway
   - `CLIENT_ORIGIN` = your GitHub Pages URL (for CORS)
6. Copy your Railway deployment URL (e.g. `https://yourapp.up.railway.app`)

### Frontend → GitHub Pages

1. Push code to GitHub
2. Go to repo **Settings → Pages**
3. Source: Deploy from branch `main`, folder `/` (root)
4. After deploy, edit `index.html` to point to your Railway backend:

```html
<!-- In index.html, change this line: -->
const SERVER_URL = window.SOCKET_SERVER_URL || null;

<!-- To this (your Railway URL): -->
const SERVER_URL = 'https://yourapp.up.railway.app';
```

Or set it via a script tag before the game scripts:

```html
<script>window.SOCKET_SERVER_URL = 'https://yourapp.up.railway.app';</script>
```

## Game Technical Details

### Server Architecture
- **Tick rate**: 20 TPS (50ms intervals)
- **Input handling**: Client sends WASD + mouse angles every 50ms
- **Hit detection**: Server-authoritative sphere intersection raycasting
- **Physics**: Gravity, jump, collision detection against wall AABBs
- **Respawn**: 3 second timer, auto-assigns to team spawn point

### Client Architecture
- **Rendering**: Three.js r128, WebGL
- **Movement prediction**: Client-side interpolation for smooth feel
- **Shadows**: Directional sun light with shadow maps
- **Particles**: Impact sparks, blood effects, muzzle flash
- **Fog**: Distance fog for atmosphere

### Weapons

| Weapon | Damage | Fire Rate | Ammo | Range | Auto |
|--------|--------|-----------|------|-------|------|
| AK-47 (Rifle) | 25 (62.5 headshot) | 100ms | 30/90 | 200u | Yes |
| Pistol | 35 (87.5 headshot) | 400ms | 12/36 | 150u | No |

### Map Layout
- **Size**: 100x100 units
- **CT Spawn**: South (-Z direction)
- **T Spawn**: North (+Z direction)
- **A Site**: West side (-X)
- **B Site**: East side (+X)
- **Mid**: Central building + crate cover
- **Flanks**: Side corridors with catwalks

## Customization

### Adding weapons
Edit `server/gameloop.js` → `WEAPONS` object:
```js
sniper: {
  damage: 100,
  fireRate: 1500,
  ammo: 5,
  maxAmmo: 15,
  range: 500,
  spread: 0.001,
  reloadTime: 3000,
  automatic: false
}
```

### Changing map
Edit `client/game.js` → `_buildMap()` to add/move boxes.
Edit `server/gameloop.js` → `WALLS` array to match server-side collision.

### Adjusting game feel
- `PLAYER_SPEED` in `gameloop.js` — movement speed
- `JUMP_FORCE` in `gameloop.js` — jump height
- `sensitivity` in `game.js` `_processInput()` — mouse sensitivity
- `RESPAWN_TIME` in `gameloop.js` — respawn delay

## License

MIT — free to use, modify, and deploy.
