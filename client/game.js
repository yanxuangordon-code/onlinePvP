// Main FPS Game Engine using Three.js

class FPSGame {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.socket = new GameSocket();
    this.ui = new UIManager();

    // Callbacks (set by caller)
    this.onJoined = null;
    this.onPointerLockChange = null;
    this.onKill = null;
    this.onDeath = null;
    this.onConnectionError = null;

    // Player state
    this.localId = null;
    this.localTeam = null;
    this.alive = true;
    this.health = 100;
    this.weapon = 'ak47';
    this.primaryWeapon = 'ak47';
    this.secondaryWeapon = 'pistol';
    this.ammo = {
      ak47:    { ammo: 30, maxAmmo: 90 },
      m4a1:    { ammo: 30, maxAmmo: 90 },
      awp:     { ammo: 5,  maxAmmo: 20 },
      shotgun: { ammo: 8,  maxAmmo: 32 },
      smg:     { ammo: 25, maxAmmo: 100 },
      pistol:  { ammo: 12, maxAmmo: 36 },
      deagle:  { ammo: 7,  maxAmmo: 28 },
    };
    this.kills = 0;

    // Remote players
    this.remotePlayers = new Map(); // id -> { mesh, nameLabel }

    // Input
    this.keys = {};
    this.mouse = { dx: 0, dy: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.pointerLocked = false;
    this.lastShot = 0;
    this.reloading = false;

    // Weapon fire rates (ms between shots)
    this.WEAPON_FIRE_RATE = { ak47: 100, m4a1: 80, awp: 1500, shotgun: 900, smg: 55, pistol: 400, deagle: 500, rifle: 100 };
    this.WEAPON_AUTO = { ak47: true, m4a1: true, smg: true, awp: false, shotgun: false, pistol: false, deagle: false, rifle: true };

    // Map constants
    this.MAP_SIZE = 50;

    // Wall collision data — must match server/gameloop.js WALLS array
    // Dimensions match visual geometry in _buildMap()
    this.CLIENT_WALLS = [
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
      // Mid crates (with stacked crate above — same footprint)
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

    // Particle effects
    this.particles = [];

    // Bullet tracers
    this.tracers = [];

    // Input send interval
    this.lastInputSend = 0;
    this.INPUT_RATE = 50; // ms

    // Scores
    this.scores = { ct: 0, terrorist: 0 };
    this.allPlayers = [];
  }

  // Client-side wall collision (mirrors server collidesWithWall)
  _collidesWithWall(x, z, radius) {
    if (x - radius < -50 || x + radius > 50) return true;
    if (z - radius < -50 || z + radius > 50) return true;
    for (const wall of this.CLIENT_WALLS) {
      const halfW = wall.w / 2 + radius;
      const halfD = wall.d / 2 + radius;
      if (x > wall.x - halfW && x < wall.x + halfW &&
          z > wall.z - halfD && z < wall.z + halfD) return true;
    }
    return false;
  }

  init() {
    this._initRenderer();
    this._initScene();
    this._initLights();
    this._buildMap();
    this._initCamera();
    this._initInput();
    this.ui.init();

    this.socket.connect(this.serverUrl);
    this._setupSocketEvents();

    this._animate();
  }

  // ---- Renderer ----

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.getElementById('gameCanvas').appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    // Gun model (simple box visible in first person)
    this._buildGunModel();
  }

  _buildGunModel() {
    const dark   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.7 });
    const metal  = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.8 });
    const metal2 = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.45, metalness: 0.75 });
    const wood   = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 0.9, metalness: 0.0 });
    const blk    = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.9 });
    const tan    = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.85, metalness: 0.0 });

    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || metal);
    const addParts = (group, parts) => { parts.forEach(([m, px, py, pz]) => { m.position.set(px, py, pz); group.add(m); }); };

    this.weaponModels = {};

    // --- AK-47 ---
    const ak = new THREE.Group();
    addParts(ak, [
      [box(0.08, 0.08, 0.5, metal), 0, 0, 0],
      [box(0.03, 0.03, 0.28, dark), 0, 0.025, -0.32],
      [box(0.06, 0.1, 0.16, wood), 0, -0.02, 0.22],
      [box(0.04, 0.13, 0.06, dark), 0, -0.095, 0.02],
      [box(0.07, 0.04, 0.12, tan), 0, 0.06, -0.02],
    ]);
    ak.position.set(0.2, -0.18, -0.38); this.camera.add(ak);
    this.weaponModels.ak47 = ak;

    // --- M4A1 ---
    const m4 = new THREE.Group();
    addParts(m4, [
      [box(0.075, 0.075, 0.48, metal2), 0, 0, 0],
      [box(0.025, 0.025, 0.3, dark), 0, 0.025, -0.32],
      [box(0.055, 0.09, 0.14, dark), 0, -0.018, 0.2],
      [box(0.04, 0.12, 0.055, dark), 0, -0.09, 0.02],
      [box(0.065, 0.035, 0.1, metal), 0, 0.055, -0.02],
      [box(0.02, 0.02, 0.08, dark), -0.03, 0.048, -0.3], // sight
    ]);
    m4.position.set(0.2, -0.18, -0.38); m4.visible = false; this.camera.add(m4);
    this.weaponModels.m4a1 = m4;

    // --- AWP (Sniper) ---
    const awp = new THREE.Group();
    addParts(awp, [
      [box(0.07, 0.07, 0.7, metal), 0, 0, 0],
      [box(0.025, 0.025, 0.5, dark), 0, 0.025, -0.55],
      [box(0.055, 0.1, 0.18, wood), 0, -0.025, 0.3],
      [box(0.035, 0.1, 0.05, dark), 0, -0.075, 0.05],
      [box(0.04, 0.06, 0.22, blk), 0, 0.065, -0.05], // scope
      [box(0.03, 0.03, 0.18, blk), 0, 0.065, -0.05], // scope lens
    ]);
    awp.position.set(0.22, -0.18, -0.55); awp.visible = false; this.camera.add(awp);
    this.weaponModels.awp = awp;

    // --- Shotgun ---
    const sg = new THREE.Group();
    addParts(sg, [
      [box(0.1, 0.09, 0.45, dark), 0, 0, 0],
      [box(0.06, 0.06, 0.22, metal), 0, 0.02, -0.3],
      [box(0.09, 0.12, 0.18, wood), 0, -0.025, 0.18],
      [box(0.045, 0.06, 0.04, blk), 0, -0.05, -0.02],
    ]);
    sg.position.set(0.2, -0.18, -0.35); sg.visible = false; this.camera.add(sg);
    this.weaponModels.shotgun = sg;

    // --- SMG (UMP-45) ---
    const smg = new THREE.Group();
    addParts(smg, [
      [box(0.07, 0.07, 0.36, metal2), 0, 0, 0],
      [box(0.025, 0.025, 0.18, dark), 0, 0.02, -0.25],
      [box(0.05, 0.09, 0.1, dark), 0, -0.018, 0.14],
      [box(0.035, 0.1, 0.05, dark), 0, -0.082, 0.03],
    ]);
    smg.position.set(0.18, -0.18, -0.3); smg.visible = false; this.camera.add(smg);
    this.weaponModels.smg = smg;

    // --- Pistol (Glock) ---
    const pistol = new THREE.Group();
    addParts(pistol, [
      [box(0.055, 0.12, 0.2, metal2), 0, 0, 0],
      [box(0.03, 0.03, 0.12, dark), 0, 0.04, -0.14],
      [box(0.05, 0.1, 0.07, wood), 0, -0.1, 0.04],
    ]);
    pistol.position.set(0.15, -0.18, -0.3); pistol.visible = false; this.camera.add(pistol);
    this.weaponModels.pistol = pistol;

    // --- Desert Eagle ---
    const deagle = new THREE.Group();
    addParts(deagle, [
      [box(0.065, 0.14, 0.25, dark), 0, 0, 0],
      [box(0.035, 0.035, 0.15, metal), 0, 0.05, -0.18],
      [box(0.055, 0.11, 0.09, dark), 0, -0.12, 0.06],
      [box(0.04, 0.06, 0.04, blk), 0, -0.045, 0.02],
    ]);
    deagle.position.set(0.15, -0.18, -0.3); deagle.visible = false; this.camera.add(deagle);
    this.weaponModels.deagle = deagle;

    // Aliases for backward compat
    this.rifleModel  = this.weaponModels.ak47;
    this.pistolModel = this.weaponModels.pistol;
  }

  // ---- Scene ----

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a2a3a);
    this.scene.fog = new THREE.Fog(0x1a2a3a, 55, 130);
  }

  _initLights() {
    // Ambient base
    const ambient = new THREE.AmbientLight(0x223344, 0.6);
    this.scene.add(ambient);

    // Hemisphere: cool night sky / warm ground bounce
    const hemi = new THREE.HemisphereLight(0x334466, 0x4a3520, 0.8);
    this.scene.add(hemi);

    // Main overhead directional (stadium-style)
    const sun = new THREE.DirectionalLight(0xddeeff, 1.8);
    sun.position.set(10, 80, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 250;
    sun.shadow.camera.left = -75;
    sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -75;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);

    // CT side — blue accent light
    const ctLight = new THREE.PointLight(0x4488ff, 2.5, 35);
    ctLight.position.set(0, 8, -38);
    this.scene.add(ctLight);

    // T side — red accent light
    const tLight = new THREE.PointLight(0xff4422, 2.5, 35);
    tLight.position.set(0, 8, 38);
    this.scene.add(tLight);

    // Mid center — warm fill
    const midLight = new THREE.PointLight(0xffcc44, 1.2, 20);
    midLight.position.set(0, 6, 0);
    this.scene.add(midLight);

    // Fill from opposite side
    const fill = new THREE.DirectionalLight(0x7799cc, 0.4);
    fill.position.set(-30, 15, -20);
    this.scene.add(fill);
  }

  _buildMap() {
    const self = this;

    // Procedural textures
    function makeTexture(color1, color2, size, pattern) {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color1;
      ctx.fillRect(0, 0, 128, 128);
      if (pattern === 'grid') {
        ctx.strokeStyle = color2;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 128; i += 32) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
        }
      } else if (pattern === 'concrete') {
        // Subtle noise for concrete look
        for (let x = 0; x < 128; x += 4) for (let y = 0; y < 128; y += 4) {
          const v = Math.random() * 12 - 6;
          ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)/100})`;
          ctx.fillRect(x, y, 4, 4);
        }
        ctx.strokeStyle = color2; ctx.lineWidth = 1;
        for (let i = 0; i <= 128; i += 32) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
        }
      } else if (pattern === 'checker') {
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
          if ((x + y) % 2 === 0) { ctx.fillStyle = color2; ctx.fillRect(x * 32, y * 32, 32, 32); }
        }
      } else if (pattern === 'planks') {
        // Wooden planks
        for (let y = 0; y < 128; y += 16) {
          const off = (Math.floor(y / 16) % 2) * 64;
          ctx.fillStyle = color2;
          ctx.fillRect(0, y, 128, 1);
          for (let x = off; x < 128; x += 64) ctx.fillRect(x, y, 1, 16);
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(size, size);
      return tex;
    }

    const floorTex  = makeTexture('#7a7a7a', '#5a5a5a', 25, 'grid');
    const wallTex   = makeTexture('#9a9590', '#7a7570', 3, 'concrete');
    const ctTex     = makeTexture('#0d2a4a', '#0f3560', 6, 'grid');
    const tTex      = makeTexture('#4a1008', '#6a1810', 6, 'grid');
    const boxTex    = makeTexture('#9a7828', '#7a5818', 3, 'planks');

    function makeMat(tex, color, roughness, metalness) {
      return new THREE.MeshStandardMaterial({ map: tex, color: color || 0xffffff, roughness: roughness !== undefined ? roughness : 0.85, metalness: metalness !== undefined ? metalness : 0.0 });
    }

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      makeMat(floorTex)
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    self.scene.add(floor);

    // Boundary walls
    const wallH = 6;
    const wallMat = makeMat(wallTex);
    const boundaryWalls = [
      { pos: [0, wallH/2, -50], size: [100, wallH, 0.5] },
      { pos: [0, wallH/2,  50], size: [100, wallH, 0.5] },
      { pos: [-50, wallH/2, 0], size: [0.5, wallH, 100] },
      { pos: [ 50, wallH/2, 0], size: [0.5, wallH, 100] },
    ];
    for (const w of boundaryWalls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
      mesh.position.set(...w.pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      self.scene.add(mesh);
    }

    // CT spawn area (blue)
    const ctSpawn = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 12),
      makeMat(ctTex)
    );
    ctSpawn.rotation.x = -Math.PI / 2;
    ctSpawn.position.set(0, 0.01, -41);
    self.scene.add(ctSpawn);

    // T spawn area (red)
    const tSpawn = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 12),
      makeMat(tTex)
    );
    tSpawn.rotation.x = -Math.PI / 2;
    tSpawn.position.set(0, 0.01, 41);
    self.scene.add(tSpawn);

    // Spawn walls (CT)
    const spawnWallMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.7, metalness: 0.1 });
    const spawnWall_CT = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 0.5), spawnWallMat);
    spawnWall_CT.position.set(0, 2.5, -45.5);
    self.scene.add(spawnWall_CT);

    // Spawn walls (T)
    const spawnWallMatT = new THREE.MeshStandardMaterial({ color: 0xaa4422, roughness: 0.7, metalness: 0.1 });
    const spawnWall_T = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 0.5), spawnWallMatT);
    spawnWall_T.position.set(0, 2.5, 45.5);
    self.scene.add(spawnWall_T);

    // --- CS-style map structures ---
    const boxMat = makeMat(boxTex);
    const concreteMatDark = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9, metalness: 0.0 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.85, metalness: 0.0 });

    function addBox(x, y, z, w, h, d, mat) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || boxMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      self.scene.add(mesh);
      return mesh;
    }

    // Central building
    addBox(0, 2, 0, 6, 4, 6, concreteMat);
    // Roof
    addBox(0, 4.1, 0, 6.4, 0.2, 6.4, concreteMatDark);

    // CT side long wall cover
    addBox(-15, 1, -20, 8, 2, 0.4, concreteMat);
    addBox(15, 1, -20, 8, 2, 0.4, concreteMat);
    // CT pillars
    addBox(-8, 1.5, -30, 0.4, 3, 8, concreteMat);
    addBox(8, 1.5, -30, 0.4, 3, 8, concreteMat);

    // T side cover
    addBox(-15, 1, 20, 8, 2, 0.4, concreteMat);
    addBox(15, 1, 20, 8, 2, 0.4, concreteMat);
    // T pillars
    addBox(-8, 1.5, 30, 0.4, 3, 8, concreteMat);
    addBox(8, 1.5, 30, 0.4, 3, 8, concreteMat);

    // Mid boxes (cover/crates)
    addBox(-10, 0.75, 0, 3, 1.5, 3); // Left mid crate
    addBox(10, 0.75, 0, 3, 1.5, 3);  // Right mid crate
    addBox(0, 0.75, -12, 3, 1.5, 3); // CT mid crate
    addBox(0, 0.75, 12, 3, 1.5, 3);  // T mid crate

    // Stacked crates
    addBox(-10, 2.25, 0, 2, 1, 2);
    addBox(10, 2.25, 0, 2, 1, 2);

    // Side long walls
    addBox(-25, 2, 0, 0.4, 4, 20, concreteMat);
    addBox(25, 2, 0, 0.4, 4, 20, concreteMat);

    // Catwalks/platforms on sides
    addBox(-22, 2.5, -8, 6, 0.3, 3, concreteMatDark);
    addBox(-22, 2.5, 8, 6, 0.3, 3, concreteMatDark);
    addBox(22, 2.5, -8, 6, 0.3, 3, concreteMatDark);
    addBox(22, 2.5, 8, 6, 0.3, 3, concreteMatDark);

    // Small barriers near center
    addBox(-5, 0.5, -5, 0.3, 1, 4, concreteMat);
    addBox(5, 0.5, -5, 0.3, 1, 4, concreteMat);
    addBox(-5, 0.5, 5, 0.3, 1, 4, concreteMat);
    addBox(5, 0.5, 5, 0.3, 1, 4, concreteMat);

    // Extra scattered crates
    addBox(-18, 0.6, -10, 1.5, 1.2, 1.5);
    addBox(-18, 0.6, 10, 1.5, 1.2, 1.5);
    addBox(18, 0.6, -10, 1.5, 1.2, 1.5);
    addBox(18, 0.6, 10, 1.5, 1.2, 1.5);
    addBox(-18, 1.8, -10, 1.2, 1, 1.2);
    addBox(18, 1.8, 10, 1.2, 1, 1.2);

    // Objective markers (A/B sites visual)
    const siteMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x333300, roughness: 0.7, metalness: 0.0 });
    const siteA = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), siteMat);
    siteA.rotation.x = -Math.PI / 2;
    siteA.position.set(-20, 0.02, 0);
    self.scene.add(siteA);
    const siteB = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), siteMat);
    siteB.rotation.x = -Math.PI / 2;
    siteB.position.set(20, 0.02, 0);
    self.scene.add(siteB);

    // Add site labels
    // (done via canvas texture for simplicity)
    function makeLabelTexture(text, color) {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 64);
      return new THREE.CanvasTexture(canvas);
    }

    const labelA = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('A', '#000'), transparent: true })
    );
    labelA.rotation.x = -Math.PI / 2;
    labelA.position.set(-20, 0.03, 0);
    self.scene.add(labelA);

    const labelB = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('B', '#000'), transparent: true })
    );
    labelB.rotation.x = -Math.PI / 2;
    labelB.position.set(20, 0.03, 0);
    self.scene.add(labelB);

    // Fog matches dark arena sky
    this.scene.fog = new THREE.Fog(0x1a2a3a, 55, 130);
  }

  // ---- Input ----

  _initInput() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        this.ui.toggleScoreboard(true);
      }
      if (e.code === 'KeyR' && !this.reloading && this.alive) {
        this.socket.sendReload();
      }
      if (e.code === 'Digit1') this._switchToPrimary();
      if (e.code === 'Digit2') this._switchToSecondary();
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Tab') {
        this.ui.toggleScoreboard(false);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) {
        const canvas = document.getElementById('gameCanvas');
        // Only lock pointer when actually in-game (canvas visible), not on home page
        if (!canvas || !canvas.classList.contains('active')) return;
        const renderer = canvas.children[0];
        if (renderer) renderer.requestPointerLock();
        return;
      }
      if (e.button === 0 && this.alive) {
        this._shoot();
        if (this.WEAPON_AUTO[this.weapon]) {
          this.shootHeld = true;
        }
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shootHeld = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === document.getElementById('gameCanvas').children[0];
      if (this.onPointerLockChange) this.onPointerLockChange(this.pointerLocked);
    });

    document.addEventListener('wheel', (e) => {
      if (!this.pointerLocked) return;
      if (e.deltaY < 0) this._switchToPrimary();
      else this._switchToSecondary();
    });
  }

  _switchWeapon(weapon) {
    if (this.weapon === weapon || this.reloading) return;
    if (!this.ammo[weapon]) return; // weapon not in loadout
    this.weapon = weapon;
    // Hide all models, show current
    for (const [k, m] of Object.entries(this.weaponModels)) {
      m.visible = (k === weapon);
    }
    this.ui.updateWeapon(weapon);
    const a = this.ammo[weapon];
    if (a) this.ui.updateAmmo(a.ammo, a.maxAmmo);
    this.socket.switchWeapon(weapon);
  }

  _switchToPrimary() { this._switchWeapon(this.primaryWeapon); }
  _switchToSecondary() { this._switchWeapon(this.secondaryWeapon); }

  // ---- Shooting ----

  _shoot() {
    const now = Date.now();
    const fireRate = this.WEAPON_FIRE_RATE[this.weapon] || 200;
    if (now - this.lastShot < fireRate) return;
    if (this.reloading) return;

    const a = this.ammo[this.weapon];
    if (a.ammo <= 0) {
      this.socket.sendReload();
      return;
    }

    this.lastShot = now;
    a.ammo--;
    this.ui.updateAmmo(a.ammo, a.maxAmmo);

    // Muzzle flash
    this._muzzleFlash();

    // Gun recoil animation
    this._recoilAnim();

    // Send to server
    this.socket.sendShoot({
      yaw: this.yaw,
      pitch: this.pitch
    });

    if (a.ammo <= 0) {
      setTimeout(() => {
        if (a.ammo <= 0) this.socket.sendReload();
      }, 100);
    }
  }

  _muzzleFlash() {
    const flashGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    const secondary = new Set(['pistol','deagle']);
    const gunPos = secondary.has(this.weapon) ? { x: 0.15, y: -0.15, z: -0.42 } : { x: 0.2, y: -0.16, z: -0.58 };
    flash.position.set(gunPos.x, gunPos.y, gunPos.z);
    this.camera.add(flash);
    setTimeout(() => this.camera.remove(flash), 50);

    // Point light flash
    const light = new THREE.PointLight(0xffaa00, 3, 5);
    light.position.copy(this.camera.position);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 60);
  }

  _recoilAnim() {
    const model = this.weaponModels[this.weapon] || this.rifleModel;
    const origY = model.position.y;
    const origZ = model.position.z;
    model.position.y += 0.03;
    model.position.z += 0.04;
    model.rotation.x -= 0.08;
    let t = 0;
    const anim = setInterval(() => {
      t += 0.15;
      model.position.y = origY + 0.03 * (1 - t);
      model.position.z = origZ + 0.04 * (1 - t);
      model.rotation.x += 0.08 * 0.15;
      if (t >= 1) {
        model.position.y = origY;
        model.position.z = origZ;
        model.rotation.x = 0;
        clearInterval(anim);
      }
    }, 16);
  }

  // ---- Particles ----

  _spawnImpactParticles(position, color) {
    const c = color || 0xd4b483;
    // Spark chips
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.SphereGeometry(0.025 + Math.random() * 0.03, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: c });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(position);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.22,
        Math.random() * 0.22 + 0.04,
        (Math.random() - 0.5) * 0.22
      );
      this.scene.add(p);
      this.particles.push({ mesh: p, vel, life: 0.5, maxLife: 0.5 });
    }
    // Expanding ring flash
    const ringGeo = new THREE.RingGeometry(0.05, 0.18, 12);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.lookAt(this.camera.position);
    this.scene.add(ring);
    let rf = 0;
    const ringAnim = setInterval(() => {
      rf += 0.12;
      ring.scale.setScalar(1 + rf * 3);
      ringMat.opacity = 0.85 * (1 - rf);
      if (rf >= 1) { clearInterval(ringAnim); this.scene.remove(ring); }
    }, 16);
    // Point light flash at hit
    const fl = new THREE.PointLight(0xffcc44, 4, 3);
    fl.position.copy(position);
    this.scene.add(fl);
    setTimeout(() => this.scene.remove(fl), 80);
  }

  _spawnBloodParticles(position) {
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.05, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(position);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.2,
        (Math.random() - 0.5) * 0.2
      );
      this.scene.add(p);
      this.particles.push({ mesh: p, vel, life: 0.4, maxLife: 0.4 });
    }
  }

  _addBulletTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.01, 0.01, Math.min(len, 3), 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.7 });
    const tracer = new THREE.Mesh(geo, mat);
    tracer.position.copy(from).addScaledVector(dir.normalize(), Math.min(len / 2, 1.5));
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.1 });
  }

  // ---- Remote Players ----

  _createPlayerMesh(team) {
    const group = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: team === 'ct' ? 0x1a3a7c : 0x7c3a1a, roughness: 0.8, metalness: 0.1
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.3), bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    // Head
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.9, metalness: 0.0 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), headMat);
    head.position.y = 1.3;
    head.castShadow = true;
    group.add(head);

    // Helmet
    const helmetMat = new THREE.MeshStandardMaterial({
      color: team === 'ct' ? 0x2255aa : 0x553311, roughness: 0.5, metalness: 0.4
    });
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.45), helmetMat);
    helmet.position.y = 1.55;
    group.add(helmet);

    // Arms
    const armMat = bodyMat;
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), armMat);
    lArm.position.set(-0.4, 0.5, 0);
    lArm.castShadow = true;
    group.add(lArm);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), armMat);
    rArm.position.set(0.4, 0.5, 0);
    rArm.castShadow = true;
    group.add(rArm);

    // Gun (carried by remote player)
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), gunMat);
    gun.position.set(0.4, 0.8, -0.3);
    group.add(gun);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: team === 'ct' ? 0x0a1a3c : 0x2a1000, roughness: 0.8, metalness: 0.05 });
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
    lLeg.position.set(-0.17, -0.35, 0);
    lLeg.castShadow = true;
    group.add(lLeg);

    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
    rLeg.position.set(0.17, -0.35, 0);
    rLeg.castShadow = true;
    group.add(rLeg);

    return group;
  }

  _createNameLabel(name, team) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = team === 'ct' ? 'rgba(30,80,180,0.8)' : 'rgba(180,60,30,0.8)';
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 16), 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  _updateRemotePlayers(players) {
    const seen = new Set();

    for (const p of players) {
      if (p.id === this.localId) continue;
      seen.add(p.id);

      if (!this.remotePlayers.has(p.id)) {
        const mesh = this._createPlayerMesh(p.team);
        const label = this._createNameLabel(p.name, p.team);
        label.position.y = 2.1;
        mesh.add(label);
        this.scene.add(mesh);
        this.remotePlayers.set(p.id, { mesh, label, team: p.team, alive: p.alive });
      }

      const rp = this.remotePlayers.get(p.id);
      rp.mesh.position.set(p.x, p.y - 0.9, p.z);
      rp.mesh.rotation.y = -p.yaw;
      rp.mesh.visible = p.alive;
      rp.label.visible = p.alive;
      rp.alive = p.alive;
    }

    // Remove disconnected players
    for (const [id, rp] of this.remotePlayers) {
      if (!seen.has(id)) {
        this.scene.remove(rp.mesh);
        this.remotePlayers.delete(id);
      }
    }
  }

  // ---- Socket Events ----

  _setupSocketEvents() {
    this.socket.on('connect', () => {
      const name = window.PLAYER_NAME || 'Player' + Math.floor(Math.random() * 1000);
      const weapons = window.PLAYER_WEAPONS || { primary: 'ak47', secondary: 'pistol' };
      if (this._pendingJoinRoomId) {
        this.socket.joinRoom(name, this._pendingJoinRoomId, weapons);
      } else {
        this.socket.quickPlay(name, weapons);
      }
    });

    this.socket.on('joined', (data) => {
      this.localId = data.id;
      this.localTeam = data.team;
      this.localMode = data.mode || 'tdm';
      this.ui.localPlayerId = data.id;

      this.camera.position.set(data.x, data.y + 0.6, data.z);
      this.yaw = data.yaw || 0;
      this.pitch = 0;

      this.primaryWeapon = data.primaryWeapon || 'ak47';
      this.secondaryWeapon = data.secondaryWeapon || 'pistol';
      this.weapon = this.primaryWeapon;
      this.ammo[this.primaryWeapon] = { ammo: data.ammo, maxAmmo: data.maxAmmo };
      this.ammo[this.secondaryWeapon] = { ammo: data.pistolAmmo, maxAmmo: data.pistolMaxAmmo };

      // Show correct gun model
      for (const [k, m] of Object.entries(this.weaponModels)) m.visible = (k === this.weapon);

      this.ui.updateTeam(data.team);
      this.ui.updateHealth(100);
      this.ui.updateAmmo(data.ammo, data.maxAmmo);
      this.ui.updateWeapon(this.primaryWeapon);

      if (this.onJoined) this.onJoined(data);
    });

    this.socket.on('gameState', (data) => {
      this._updateRemotePlayers(data.players);
      this.allPlayers = data.players;
      this.scores = data.scores;
      this.ui.updateScoreboard(data.players, data.scores);
      this.ui.updateMinimap(data.players, this.localId, this.MAP_SIZE);

      // Sync local player state from server (kills + Y for jump)
      const me = data.players.find(p => p.id === this.localId);
      if (me) {
        this.kills = me.kills;
        this.ui.updateKillScore(me.kills);
        // Sync Y position so jump is visible
        const serverCamY = me.y + 0.6;
        if (Math.abs(serverCamY - this.camera.position.y) > 0.02) {
          this.camera.position.y = serverCamY;
        }
      }

      // CTF flag HUD
      if (data.flags && window.updateCTFHud) {
        window.updateCTFHud(data.flags);
      }
    });

    this.socket.on('damaged', (data) => {
      this.health = data.health;
      this.ui.updateHealth(data.health);

      // Screen flash
      const flash = document.getElementById('damageFlash');
      if (flash) {
        flash.style.opacity = '0.4';
        setTimeout(() => { flash.style.opacity = '0'; }, 300);
      }
    });

    this.socket.on('playerKilled', (data) => {
      this.ui.addKillFeedEntry(
        data.killerName, data.killerTeam,
        data.victimName, data.victimTeam,
        data.weapon
      );

      if (data.victimId === this.localId) {
        this.alive = false;
        this.ui.showDeathScreen(3000);
        this.ui.hideReloading();
        if (this.onDeath) this.onDeath();
      }

      if (data.killerId === this.localId) {
        if (this.onKill) this.onKill();
      }
    });

    this.socket.on('respawn', (data) => {
      this.alive = true;
      this.health = 100;
      this.reloading = false;
      this.camera.position.set(data.x, data.y + 0.6, data.z);
      // Reset ammo from weapon defaults
      const WFR = this.WEAPON_FIRE_RATE;
      const AMMO_DEFAULTS = { ak47:{ammo:30,maxAmmo:90}, m4a1:{ammo:30,maxAmmo:90}, awp:{ammo:5,maxAmmo:20}, shotgun:{ammo:8,maxAmmo:32}, smg:{ammo:25,maxAmmo:100}, pistol:{ammo:12,maxAmmo:36}, deagle:{ammo:7,maxAmmo:28} };
      this.ammo[this.primaryWeapon] = { ...(AMMO_DEFAULTS[this.primaryWeapon] || AMMO_DEFAULTS.ak47) };
      this.ammo[this.secondaryWeapon] = { ...(AMMO_DEFAULTS[this.secondaryWeapon] || AMMO_DEFAULTS.pistol) };
      this.weapon = this.primaryWeapon;
      for (const [k, m] of Object.entries(this.weaponModels)) m.visible = (k === this.weapon);
      this.ui.updateHealth(100);
      const a = this.ammo[this.weapon];
      this.ui.updateAmmo(a.ammo, a.maxAmmo);
      this.ui.updateWeapon(this.weapon);
      this.ui.hideDeathScreen();
    });

    this.socket.on('hitConfirm', (data) => {
      if (data.shooterId === this.localId) {
        this.ui.showHitMarker();
      }
      const pos = new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
      this._spawnBloodParticles(pos);
    });

    this.socket.on('bulletImpact', (data) => {
      const pos = new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
      this._spawnImpactParticles(pos);

      // Bullet hole decal — orient toward camera so it's always visible
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(0.07, 8),
        new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85 })
      );
      decal.position.copy(pos);
      decal.lookAt(this.camera.position);
      this.scene.add(decal);
      // Fade out then remove
      let fade = 1;
      const fadeInterval = setInterval(() => {
        fade -= 0.005;
        decal.material.opacity = 0.85 * fade;
        if (fade <= 0) { clearInterval(fadeInterval); this.scene.remove(decal); }
      }, 100);
    });

    this.socket.on('ammoUpdate', (data) => {
      this.ammo[this.primaryWeapon] = { ammo: data.ammo, maxAmmo: data.maxAmmo };
      this.ammo[this.secondaryWeapon] = { ammo: data.pistolAmmo, maxAmmo: data.pistolMaxAmmo };
      const a = this.ammo[this.weapon];
      if (a) this.ui.updateAmmo(a.ammo, a.maxAmmo);
    });

    this.socket.on('reloadStart', (data) => {
      this.reloading = true;
      this.ui.showReloading(data.duration);
    });

    this.socket.on('reloadEnd', (data) => {
      this.reloading = false;
      this.ui.hideReloading();
      if (this.ammo[this.weapon]) {
        this.ammo[this.weapon].ammo = data.ammo;
        this.ammo[this.weapon].maxAmmo = data.maxAmmo;
      }
      this.ui.updateAmmo(data.ammo, data.maxAmmo);
    });

    this.socket.on('connect_error', () => {
      if (this.onConnectionError) this.onConnectionError();
    });
  }

  // ---- Game Loop ----

  _animate() {
    requestAnimationFrame(() => this._animate());

    const now = Date.now();
    this._processInput(now);
    this._updateParticles();
    this._updateTracers();

    // Auto-fire for automatic weapons
    if (this.shootHeld && this.WEAPON_AUTO[this.weapon] && this.alive && this.pointerLocked) {
      this._shoot();
    }

    this.renderer.render(this.scene, this.camera);
  }

  _processInput(now) {
    if (!this.localId || !this.pointerLocked) return;

    // Mouse look
    const sensitivity = 0.002;
    this.yaw -= this.mouse.dx * sensitivity;
    this.pitch -= this.mouse.dy * sensitivity;
    this.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.pitch));
    this.mouse.dx = 0;
    this.mouse.dy = 0;

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Send input to server
    if (now - this.lastInputSend >= this.INPUT_RATE) {
      this.lastInputSend = now;
      this.socket.sendInput({
        forward: !!this.keys['KeyW'],
        back: !!this.keys['KeyS'],
        left: !!this.keys['KeyA'],
        right: !!this.keys['KeyD'],
        jump: !!this.keys['Space'],
        yaw: this.yaw,
        pitch: this.pitch
      });
    }

    // Client-side position prediction (smooth movement)
    if (this.alive) {
      const speed = 0.12;
      let dx = 0, dz = 0;
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);

      // Camera looks at -Z when yaw=0, so forward = (-sin, 0, -cos)
      if (this.keys['KeyW']) { dx -= sin; dz -= cos; }
      if (this.keys['KeyS']) { dx += sin; dz += cos; }
      if (this.keys['KeyA']) { dx -= cos; dz += sin; }
      if (this.keys['KeyD']) { dx += cos; dz -= sin; }

      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0) {
        const moveX = (dx / len) * speed;
        const moveZ = (dz / len) * speed;
        const PLAYER_R = 0.35;
        const newX = this.camera.position.x + moveX;
        const newZ = this.camera.position.z + moveZ;
        if (!this._collidesWithWall(newX, this.camera.position.z, PLAYER_R)) {
          this.camera.position.x = newX;
        }
        if (!this._collidesWithWall(this.camera.position.x, newZ, PLAYER_R)) {
          this.camera.position.z = newZ;
        }
      }

      // Bobbing
      if (len > 0) {
        const bob = Math.sin(now * 0.008) * 0.03;
        this.camera.position.y = 1.6 + bob;
      }
    }
  }

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= 0.016;
      p.vel.y -= 0.01;
      p.mesh.position.add(p.vel);
      p.mesh.material.opacity = p.life / p.maxLife;
      p.mesh.material.transparent = true;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  _updateTracers() {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= 0.016;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
  }
}

// (WEAPON_AUTO is now instance property on FPSGame)

window.FPSGame = FPSGame;
