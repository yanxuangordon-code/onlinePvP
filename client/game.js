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
      rpg:     { ammo: 5,  maxAmmo: 15 },
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
    this.WEAPON_FIRE_RATE = { ak47: 100, m4a1: 80, awp: 1500, shotgun: 900, smg: 55, pistol: 400, deagle: 500, rifle: 100, rpg: 1200 };
    this.WEAPON_AUTO = { ak47: true, m4a1: true, smg: true, awp: false, shotgun: false, pistol: false, deagle: false, rifle: true, rpg: false };

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
    this.INPUT_RATE = 33; // ms (~30Hz)

    // Sensitivity (overrideable via settings)
    this.sensitivity = 0.002;

    // Client-side jump prediction
    this.clientVY = 0;
    this.clientOnGround = true;

    // Scores
    this.scores = { ct: 0, terrorist: 0 };
    this.allPlayers = [];

    // Screen shake
    this.screenShakeAmt = 0;
    this.screenShakeDecay = 0.85;

    // Weapon sway
    this.swayX = 0;
    this.swayY = 0;
    this.walkCycle = 0;
    this.weaponBasePos = {
      ak47:    { x: 0.2,  y: -0.28, z: -0.38 },
      m4a1:    { x: 0.2,  y: -0.28, z: -0.38 },
      awp:     { x: 0.22, y: -0.28, z: -0.55 },
      shotgun: { x: 0.2,  y: -0.28, z: -0.35 },
      smg:     { x: 0.18, y: -0.28, z: -0.3  },
      pistol:  { x: 0.15, y: -0.28, z: -0.3  },
      deagle:  { x: 0.15, y: -0.28, z: -0.3  },
      rifle:   { x: 0.2,  y: -0.28, z: -0.38 },
      rpg:     { x: 0.22, y: -0.25, z: -0.5  },
    };
    this.currentMap = 'arena';

    // Footstep
    this.footstepTimer = 0;
    this.lastFootY = 0;

    // Soldier GLB models (loaded async; null = not yet loaded)
    this.soldierModels = { ct: null, t: null };

    // Audio
    this.audio = new AudioManager();
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
    this._initPostProcessing();
    this._initInput();
    this.ui.init();

    this.audio.init();
    this._preloadSoldierModels();
    this._preloadWeaponModels();

    this.socket.connect(this.serverUrl);
    this._setupSocketEvents();

    this._animate();
  }

  _preloadSoldierModels() {
    if (typeof THREE.GLTFLoader === 'undefined') return;
    const loader = new THREE.GLTFLoader();
    const base = './client/models/';
    const load = (side) => {
      loader.load(
        base + 'soldier_' + side + '.glb',
        (gltf) => {
          const model = gltf.scene;
          model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
          this.soldierModels[side] = model;
          console.log('[HYPERFIRE] Loaded soldier_' + side + '.glb');
          // Swap any already-spawned remote players to use the new model
          for (const [id, rp] of this.remotePlayers) {
            if (rp.team === side && !rp.usingGLTF) {
              this._swapToGLTFModel(rp, side);
            }
          }
        },
        undefined,
        () => { /* file not found — stay with procedural */ }
      );
    };
    load('ct');
    load('t');
  }

  _swapToGLTFModel(rp, side) {
    const template = this.soldierModels[side];
    if (!template) return;
    const clone = template.clone(true);
    clone.scale.setScalar(0.75);
    // Preserve name label and position/rotation from old mesh
    const old = rp.mesh;
    clone.position.copy(old.position);
    clone.rotation.copy(old.rotation);
    // Re-attach name label
    if (rp.label) { old.remove(rp.label); clone.add(rp.label); }
    this.scene.remove(old);
    this.scene.add(clone);
    rp.mesh = clone;
    rp.usingGLTF = true;
    // Copy over animation userData stubs so walking code doesn't crash
    clone.userData.leftLeg  = null;
    clone.userData.rightLeg = null;
    clone.userData.leftArm  = null;
    clone.userData.rightArm = null;
    clone.userData.walkCycle = 0;
    clone.userData.prevX = old.userData.prevX || 0;
    clone.userData.prevZ = old.userData.prevZ || 0;
  }

  _preloadWeaponModels() {
    if (typeof THREE.GLTFLoader === 'undefined') return;
    const loader = new THREE.GLTFLoader();
    const weapons = ['ak47','m4a1','awp','shotgun','smg','pistol','deagle'];
    // Weapon base positions in camera space
    const basePos = this.weaponBasePos;
    weapons.forEach(name => {
      loader.load(
        `./client/models/weapons/weapon_${name}.glb`,
        (gltf) => {
          const model = gltf.scene;
          // Scale to first-person size and orient
          model.scale.setScalar(0.38);
          model.rotation.set(0, Math.PI, 0);
          const bp = basePos[name] || { x: 0.2, y: -0.28, z: -0.38 };
          model.position.set(bp.x, bp.y, bp.z);
          model.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });

          // Hide all then swap in camera
          const old = this.weaponModels[name];
          model.visible = old ? old.visible : false;
          if (old) this.camera.remove(old);
          this.camera.add(model);
          this.weaponModels[name] = model;
          if (name === 'ak47') this.rifleModel = model;
          if (name === 'pistol') this.pistolModel = model;
          console.log(`[HYPERFIRE] Loaded weapon_${name}.glb`);
        },
        undefined,
        () => { /* no GLB yet — keep procedural model */ }
      );
    });
  }

  // ---- Renderer ----

  _initRenderer() {
    // Krunker-style: render at 50% resolution, upscale with nearest-neighbor (pixelated)
    this.pixelScale = 0.5;
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.shadowMap.enabled = false;
    this.renderer.setPixelRatio(1);
    const w = Math.floor(window.innerWidth * this.pixelScale);
    const h = Math.floor(window.innerHeight * this.pixelScale);
    this.renderer.setSize(w, h, false); // false = don't update CSS size

    // Stretch canvas full-screen with pixel-perfect (blocky) upscaling
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.imageRendering = 'crisp-edges'; // Firefox

    document.getElementById('gameCanvas').appendChild(canvas);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      const w = Math.floor(window.innerWidth * this.pixelScale);
      const h = Math.floor(window.innerHeight * this.pixelScale);
      this.renderer.setSize(w, h, false);
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
    // Krunker-style: flat-shaded simple box weapons, dark metal colors
    const F = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
    const dark    = F(0x222222);
    const metal   = F(0x333333);
    const blk     = F(0x111111);
    const wood    = F(0x5a3010);
    const tan     = F(0x7a6040);
    const green   = F(0x2a4a1a); // military green

    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || metal);
    const addParts = (group, parts) => { parts.forEach(([m, px, py, pz]) => { m.position.set(px, py, pz); group.add(m); }); };

    this.weaponModels = {};

    // --- AK-47 (Krunker: chunky receiver, visible magazine, short stock) ---
    const ak = new THREE.Group();
    addParts(ak, [
      [box(0.09, 0.09, 0.46, metal), 0,     0,      0],      // receiver
      [box(0.04, 0.04, 0.26, blk),   0,     0.028, -0.30],   // barrel
      [box(0.07, 0.10, 0.14, wood),  0,    -0.022,  0.20],   // stock
      [box(0.05, 0.16, 0.07, dark),  0,    -0.10,   0.02],   // magazine
      [box(0.07, 0.04, 0.10, tan),   0,     0.065, -0.02],   // top rail
    ]);
    ak.position.set(0.2, -0.28, -0.38); this.camera.add(ak);
    this.weaponModels.ak47 = ak;

    // --- M4A1 (Krunker: similar but slightly sleeker) ---
    const m4 = new THREE.Group();
    addParts(m4, [
      [box(0.085, 0.085, 0.44, dark),  0,     0,      0],
      [box(0.035, 0.035, 0.28, blk),   0,     0.028, -0.28],
      [box(0.065, 0.095, 0.12, dark),  0,    -0.020,  0.18],
      [box(0.045, 0.15,  0.07, blk),   0,    -0.10,   0.02],
      [box(0.070, 0.038, 0.09, metal), 0,     0.060, -0.02],
    ]);
    m4.position.set(0.2, -0.28, -0.38); m4.visible = false; this.camera.add(m4);
    this.weaponModels.m4a1 = m4;

    // --- AWP Sniper (Krunker: long barrel, scope box on top) ---
    const awp = new THREE.Group();
    addParts(awp, [
      [box(0.08, 0.08, 0.65, dark),  0,     0,      0],      // body
      [box(0.035, 0.035, 0.45, blk), 0,     0.030, -0.50],   // barrel
      [box(0.065, 0.11,  0.17, wood),0,    -0.028,  0.28],   // stock
      [box(0.040, 0.12,  0.20, blk), 0,     0.07,  -0.04],   // scope
    ]);
    awp.position.set(0.22, -0.28, -0.55); awp.visible = false; this.camera.add(awp);
    this.weaponModels.awp = awp;

    // --- Shotgun (Krunker: wide body, short barrel) ---
    const sg = new THREE.Group();
    addParts(sg, [
      [box(0.11, 0.10, 0.40, dark),  0,     0,      0],
      [box(0.07, 0.07, 0.20, metal), 0,     0.020, -0.28],
      [box(0.10, 0.13, 0.16, wood),  0,    -0.028,  0.16],
      [box(0.050, 0.07, 0.05, blk),  0,    -0.055, -0.02],
    ]);
    sg.position.set(0.2, -0.28, -0.35); sg.visible = false; this.camera.add(sg);
    this.weaponModels.shotgun = sg;

    // --- SMG (Krunker: compact boxy) ---
    const smg = new THREE.Group();
    addParts(smg, [
      [box(0.08, 0.08, 0.32, dark),  0,     0,      0],
      [box(0.03, 0.03, 0.16, blk),   0,     0.020, -0.22],
      [box(0.06, 0.10, 0.09, dark),  0,    -0.020,  0.12],
      [box(0.040, 0.12, 0.05, blk),  0,    -0.090,  0.03],
    ]);
    smg.position.set(0.18, -0.28, -0.3); smg.visible = false; this.camera.add(smg);
    this.weaponModels.smg = smg;

    // --- Pistol (Krunker: small flat side-view boxy pistol) ---
    const pistol = new THREE.Group();
    addParts(pistol, [
      [box(0.060, 0.13, 0.20, dark),  0,     0,      0],
      [box(0.033, 0.033, 0.13, blk),  0,     0.045, -0.14],
      [box(0.055, 0.11,  0.07, wood), 0,    -0.10,   0.04],
    ]);
    pistol.position.set(0.15, -0.28, -0.3); pistol.visible = false; this.camera.add(pistol);
    this.weaponModels.pistol = pistol;

    // --- Desert Eagle (Krunker: bigger, chunkier pistol) ---
    const deagle = new THREE.Group();
    addParts(deagle, [
      [box(0.070, 0.15, 0.24, dark),  0,     0,      0],
      [box(0.038, 0.038, 0.14, blk),  0,     0.058, -0.17],
      [box(0.060, 0.12,  0.09, dark), 0,    -0.125,  0.06],
    ]);
    deagle.position.set(0.15, -0.28, -0.3); deagle.visible = false; this.camera.add(deagle);
    this.weaponModels.deagle = deagle;

    // --- RPG (Krunker: big tube + warhead) ---
    const rpg = new THREE.Group();
    addParts(rpg, [
      [box(0.13, 0.13, 0.65, green), 0,     0,      0],      // tube
      [box(0.08, 0.06, 0.28, dark),  0,    -0.065,  0.10],   // handle
      [box(0.11, 0.11, 0.14, metal), 0,     0,     -0.42],   // warhead
    ]);
    rpg.position.set(0.22, -0.25, -0.5); rpg.visible = false; this.camera.add(rpg);
    this.weaponModels.rpg = rpg;

    // Aliases for backward compat
    this.rifleModel  = this.weaponModels.ak47;
    this.pistolModel = this.weaponModels.pistol;
  }

  // ---- Scene ----

  _initScene() {
    this.scene = new THREE.Scene();
    // Krunker's iconic bright blue sky
    this.scene.background = new THREE.Color(0x7ec8e3);
    // Krunker fog: light blue-white, starts close, cuts sharply
    this.scene.fog = new THREE.Fog(0x9ddbe8, 45, 120);
  }

  _initLights() {
    // Krunker-style: bright ambient + single strong directional sun
    const ambient = new THREE.AmbientLight(0xffffff, 0.80);
    this.scene.add(ambient);

    // Sun — Krunker has strong directional light from upper-right
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(3, 8, 4);
    this.scene.add(sun);

    // Soft fill from opposite side (prevents pure-black shadows)
    const fill = new THREE.DirectionalLight(0xc8e0ff, 0.25);
    fill.position.set(-2, 4, -3);
    this.scene.add(fill);
  }

  _initPostProcessing() {
    // Krunker uses no post-processing — pixelation is handled at the renderer level
    this.composer = null;
  }

  _buildMap() {
    const self = this;

    // ---- Krunker flat-shaded materials (no textures) ----
    const flat = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });

    const floorMat    = flat(0xc2a55c); // sandy tan ground
    const wallMat     = flat(0xb08840); // darker sandy walls
    const buildingMat = flat(0xc8a85e); // building facade (slightly lighter)
    const roofMat     = flat(0x8c6c30); // darker roof
    const crateMat    = flat(0xa07830); // crate boxes (brown)
    const barrierMat  = flat(0xb89050); // low barriers
    const ctBaseMat   = flat(0x3355cc); // CT spawn highlight (Krunker blue)
    const tBaseMat    = flat(0xcc3322); // T spawn highlight (Krunker red)
    const ctWallMat   = flat(0x2244aa);
    const tWallMat    = flat(0xaa2211);
    const windowMat   = flat(0x88aabb); // window panes (light blue)

    function addBox(x, y, z, w, h, d, mat) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || crateMat);
      mesh.position.set(x, y, z);
      self.scene.add(mesh);
      return mesh;
    }

    // ---- Ground plane (sandy) ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    self.scene.add(floor);

    // ---- Outer boundary walls (Krunker-style tall border) ----
    const wallH = 5;
    for (const [x, y, z, w, d] of [
      [0,    wallH/2, -50,  100, 0.8],
      [0,    wallH/2,  50,  100, 0.8],
      [-50,  wallH/2,  0,   0.8, 100],
      [ 50,  wallH/2,  0,   0.8, 100],
    ]) {
      addBox(x, y, z, w, wallH, d, wallMat);
    }

    // ---- Spawn back walls (team-colored, Krunker style) ----
    addBox(0, 2.5, -45.5, 22, 5, 0.8, ctWallMat);
    addBox(0, 2.5,  45.5, 22, 5, 0.8, tWallMat);
    // Side spawn walls
    addBox(-11, 2.5, -42, 0.8, 5, 8, ctWallMat);
    addBox( 11, 2.5, -42, 0.8, 5, 8, ctWallMat);
    addBox(-11, 2.5,  42, 0.8, 5, 8, tWallMat);
    addBox( 11, 2.5,  42, 0.8, 5, 8, tWallMat);

    // Spawn zone colored floor patches
    addBox(0, 0.01, -41, 22, 0.02, 14, flat(0x2244bb)); // CT blue patch
    addBox(0, 0.01,  41, 22, 0.02, 14, flat(0xbb2211)); // T red patch

    // ---- Central building (Krunker's iconic mid-map box with windows) ----
    // 4 walls of the central building (open top — outdoor Krunker style)
    const cbH = 4, cbW = 6, cbD = 6;
    // Front & back walls with a window cut-out style (just thin strips top/bottom)
    addBox(0, cbH/2, -cbD/2, cbW, cbH, 0.5, buildingMat); // front
    addBox(0, cbH/2,  cbD/2, cbW, cbH, 0.5, buildingMat); // back
    addBox(-cbW/2, cbH/2, 0, 0.5, cbH, cbD, buildingMat); // left
    addBox( cbW/2, cbH/2, 0, 0.5, cbH, cbD, buildingMat); // right
    // Roof
    addBox(0, cbH + 0.15, 0, cbW + 0.5, 0.3, cbD + 0.5, roofMat);
    // Window insets (dark recesses — Krunker windows)
    addBox(0, cbH * 0.6, -cbD/2 - 0.01, cbW * 0.55, cbH * 0.35, 0.15, windowMat); // front window
    addBox(0, cbH * 0.6,  cbD/2 + 0.01, cbW * 0.55, cbH * 0.35, 0.15, windowMat); // back window
    addBox(-cbW/2 - 0.01, cbH * 0.6, 0, 0.15, cbH * 0.35, cbD * 0.55, windowMat); // left window
    addBox( cbW/2 + 0.01, cbH * 0.6, 0, 0.15, cbH * 0.35, cbD * 0.55, windowMat); // right window

    // ---- CT side cover walls (matching CLIENT_WALLS collision data) ----
    addBox(-15, 1.0, -20, 8, 2.0, 0.5, wallMat);
    addBox( 15, 1.0, -20, 8, 2.0, 0.5, wallMat);
    // CT pillars
    addBox(-8, 1.5, -30, 0.5, 3, 8, wallMat);
    addBox( 8, 1.5, -30, 0.5, 3, 8, wallMat);

    // ---- T side cover walls ----
    addBox(-15, 1.0, 20, 8, 2.0, 0.5, wallMat);
    addBox( 15, 1.0, 20, 8, 2.0, 0.5, wallMat);
    // T pillars
    addBox(-8, 1.5, 30, 0.5, 3, 8, wallMat);
    addBox( 8, 1.5, 30, 0.5, 3, 8, wallMat);

    // ---- Mid crates (classic Krunker cover boxes) ----
    addBox(-10, 0.75,  0,  3, 1.5, 3, crateMat);
    addBox( 10, 0.75,  0,  3, 1.5, 3, crateMat);
    addBox(  0, 0.75, -12, 3, 1.5, 3, crateMat);
    addBox(  0, 0.75,  12, 3, 1.5, 3, crateMat);
    // Stacked top crates
    addBox(-10, 2.25, 0, 2, 1.0, 2, flat(0x8c6820));
    addBox( 10, 2.25, 0, 2, 1.0, 2, flat(0x8c6820));

    // ---- Side corridor walls ----
    addBox(-25, 2, 0, 0.5, 4, 20, wallMat);
    addBox( 25, 2, 0, 0.5, 4, 20, wallMat);

    // ---- Small barriers near center (matching CLIENT_WALLS) ----
    addBox(-5, 0.5, -5, 0.4, 1.0, 4, barrierMat);
    addBox( 5, 0.5, -5, 0.4, 1.0, 4, barrierMat);
    addBox(-5, 0.5,  5, 0.4, 1.0, 4, barrierMat);
    addBox( 5, 0.5,  5, 0.4, 1.0, 4, barrierMat);

    // ---- Scattered crates ----
    addBox(-18, 0.6, -10, 1.5, 1.2, 1.5, crateMat);
    addBox(-18, 0.6,  10, 1.5, 1.2, 1.5, crateMat);
    addBox( 18, 0.6, -10, 1.5, 1.2, 1.5, crateMat);
    addBox( 18, 0.6,  10, 1.5, 1.2, 1.5, crateMat);
    // Stacked top crates
    addBox(-18, 1.8, -10, 1.2, 1.0, 1.2, flat(0x8c6820));
    addBox( 18, 1.8,  10, 1.2, 1.0, 1.2, flat(0x8c6820));

    // ---- Decorative side buildings (Krunker has small structures at sides) ----
    for (const [sx] of [[-35], [35]]) {
      // Small house / bunker
      addBox(sx, 1.5, -15, 6, 3, 5, buildingMat);
      addBox(sx, 3.15, -15, 6.4, 0.3, 5.4, roofMat);
      addBox(sx, 1.5,  15, 6, 3, 5, buildingMat);
      addBox(sx, 3.15,  15, 6.4, 0.3, 5.4, roofMat);
    }

    // ---- Krunker-style spawn arch markers ----
    // CT side arch
    addBox(-12, 3, -38, 0.8, 6, 0.8, ctWallMat);
    addBox( 12, 3, -38, 0.8, 6, 0.8, ctWallMat);
    addBox(  0, 5.5, -38, 24, 0.8, 0.8, ctWallMat);
    // T side arch
    addBox(-12, 3,  38, 0.8, 6, 0.8, tWallMat);
    addBox( 12, 3,  38, 0.8, 6, 0.8, tWallMat);
    addBox(  0, 5.5,  38, 24, 0.8, 0.8, tWallMat);
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
        // Don't re-lock when pause/quit overlay is showing — lets buttons be clicked
        const pauseOverlay = document.getElementById('pauseOverlay');
        if (pauseOverlay && pauseOverlay.classList.contains('show')) return;
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
    this.audio.playWeaponSwitch();
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

    // Gunshot sound
    this.audio.playShot(this.weapon);

    // Eject shell casing
    this._spawnCasing(this.weapon);

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
    const secondary = new Set(['pistol','deagle']);
    const gunPos = secondary.has(this.weapon) ? { x: 0.15, y: -0.15, z: -0.42 } : { x: 0.2, y: -0.16, z: -0.58 };

    // Emissive flash sphere (bloom picks this up)
    const flashGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const flashMat = new THREE.MeshStandardMaterial({
      color: 0xffdd00, emissive: new THREE.Color(0xffaa00), emissiveIntensity: 6.0
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(gunPos.x, gunPos.y, gunPos.z);
    this.camera.add(flash);
    setTimeout(() => this.camera.remove(flash), 55);

    // Strong point light for scene illumination
    const light = new THREE.PointLight(0xffaa00, 8, 8);
    light.position.copy(this.camera.position);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 65);
  }

  _recoilAnim() {
    if (this._recoilInterval) clearInterval(this._recoilInterval);
    const model = this.weaponModels[this.weapon] || this.rifleModel;
    if (!model) return;
    const base = this.weaponBasePos[this.weapon] || { x: 0.2, y: -0.28, z: -0.38 };
    let t = 0;
    this._recoilInterval = setInterval(() => {
      t += 0.18;
      model.position.z = base.z + 0.04 * Math.max(0, 1 - t);
      model.rotation.x = -0.08 * Math.max(0, 1 - t);
      if (t >= 1) {
        model.position.z = base.z;
        model.rotation.x = 0;
        clearInterval(this._recoilInterval);
        this._recoilInterval = null;
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

  _spawnFootstepDust() {
    const pos = new THREE.Vector3(
      this.camera.position.x + (Math.random() - 0.5) * 0.3,
      0.05,
      this.camera.position.z + (Math.random() - 0.5) * 0.3
    );
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.06, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.35 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      const vel = new THREE.Vector3((Math.random()-0.5)*0.04, Math.random()*0.05+0.02, (Math.random()-0.5)*0.04);
      this.scene.add(p);
      this.particles.push({ mesh: p, vel, life: 0.6, maxLife: 0.6, isDust: true });
    }
  }

  _showEnemyHealthBar(victimId, health) {
    const rp = this.remotePlayers.get(victimId);
    if (!rp) return;
    if (rp.healthBarMesh) { rp.mesh.remove(rp.healthBarMesh); rp.healthBarMesh = null; }

    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 48;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.roundRect(2, 2, 196, 44, 8);
    ctx.fill();

    const pct = Math.max(0, Math.min(1, health / 100));
    const r = Math.round(255 * (1 - pct));
    const g = Math.round(220 * pct);
    ctx.fillStyle = `rgb(${r},${g},40)`;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(health)}`, 194, 24);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.roundRect(6, 30, 168, 10, 4);
    ctx.fill();

    if (pct > 0) {
      ctx.fillStyle = `rgb(${r},${g},40)`;
      ctx.roundRect(6, 30, Math.round(168 * pct), 10, 4);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.0, 0.48, 1);
    sprite.position.set(0, 2.5, 0);
    rp.mesh.add(sprite);
    rp.healthBarMesh = sprite;

    clearTimeout(rp._hbTimer);
    rp._hbTimer = setTimeout(() => {
      if (rp.healthBarMesh) { rp.mesh.remove(rp.healthBarMesh); rp.healthBarMesh = null; }
    }, 2500);
  }

  _spawnCasing(weaponType) {
    // Eject a brass casing from the gun to the right
    const awp = weaponType === 'awp';
    const shotgun = weaponType === 'shotgun';
    const r = shotgun ? 0.045 : 0.018;
    const h = shotgun ? 0.075 : awp ? 0.055 : 0.038;
    const geo = new THREE.CylinderGeometry(r, r, h, 6);
    const mat = new THREE.MeshStandardMaterial({ color: shotgun ? 0xcc4400 : 0xc8902a, roughness: 0.3, metalness: 0.9 });
    const casing = new THREE.Mesh(geo, mat);
    casing.castShadow = false;

    // Start at camera position (ejection port — slightly right & forward)
    const right = new THREE.Vector3();
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    casing.position.copy(this.camera.position)
      .addScaledVector(right, 0.3)
      .addScaledVector(fwd, -0.2);
    casing.position.y -= 0.15;

    const vel = new THREE.Vector3(
      right.x * (0.12 + Math.random() * 0.08) + (Math.random()-0.5)*0.04,
      0.08 + Math.random() * 0.06,
      right.z * (0.12 + Math.random() * 0.08) + (Math.random()-0.5)*0.04
    );
    const spin = new THREE.Vector3(
      (Math.random()-0.5)*0.4, (Math.random()-0.5)*0.4, (Math.random()-0.5)*0.4
    );
    this.scene.add(casing);
    this.particles.push({ mesh: casing, vel, spin, life: 1.5, maxLife: 1.5, isCasing: true });
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

  _spawnBulletHole(pos) {
    const size = 0.07 + Math.random() * 0.06;
    const geo = new THREE.CircleGeometry(size, 7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x050505,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const hole = new THREE.Mesh(geo, mat);
    hole.position.copy(pos);

    // Orient hole to face camera
    hole.lookAt(this.camera.position);
    // Push slightly toward camera to avoid z-fighting
    const dir = new THREE.Vector3().subVectors(this.camera.position, pos).normalize();
    hole.position.addScaledVector(dir, 0.02);

    // Add cracks around hole
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const len = size * (1.5 + Math.random());
      const crackGeo = new THREE.PlaneGeometry(0.012, len);
      const crack = new THREE.Mesh(crackGeo, mat.clone());
      crack.position.copy(pos).addScaledVector(dir, 0.021);
      crack.lookAt(this.camera.position);
      crack.rotateZ(angle);
      crack.position.x += Math.cos(angle) * len * 0.5;
      crack.position.y += Math.sin(angle) * len * 0.5;
      this.scene.add(crack);
      // fade crack
      setTimeout(() => {
        const fi = setInterval(() => {
          crack.material.opacity -= 0.005;
          if (crack.material.opacity <= 0) { clearInterval(fi); this.scene.remove(crack); }
        }, 500);
      }, 8000);
    }

    this.scene.add(hole);

    // Fade after 10 seconds
    setTimeout(() => {
      const fadeInt = setInterval(() => {
        hole.material.opacity -= 0.004;
        if (hole.material.opacity <= 0) { clearInterval(fadeInt); this.scene.remove(hole); }
      }, 500);
    }, 10000);
  }

  // ---- Remote Players ----

  _createPlayerMesh(team) {
    // Krunker-style: blocky low-poly character (Minecraft proportions, flat shading)
    const isCT = team === 'ct';
    const g = new THREE.Group();

    // Krunker color palette
    const bodyCol  = isCT ? 0x2255cc : 0xcc2211; // blue CT / red T
    const legCol   = isCT ? 0x1a3d99 : 0x991a0d; // darker limbs
    const skinCol  = 0xf4c490;  // Krunker skin tone
    const eyeCol   = 0x222222;  // dark eyes

    const flat = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
    const mk   = (w, h, d, col) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(col));
    const add  = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };

    // ---- Head (Krunker: large cube, skin colored) ----
    const head = mk(0.50, 0.50, 0.50, skinCol);
    add(head, 0, 1.40, 0);
    // Eyes (two dark squares on front face)
    add(mk(0.10, 0.10, 0.02, eyeCol), -0.13, 1.43, -0.26);
    add(mk(0.10, 0.10, 0.02, eyeCol),  0.13, 1.43, -0.26);
    // Mouth (small dark strip)
    add(mk(0.18, 0.06, 0.02, eyeCol), 0, 1.27, -0.26);

    // ---- Body (Krunker: rectangular torso, team color) ----
    add(mk(0.50, 0.60, 0.28, bodyCol), 0, 0.85, 0);

    // ---- Legs (grouped for walking animation) ----
    const leftLeg  = new THREE.Group(); leftLeg.position.set(-0.14, 0.28, 0);
    const rightLeg = new THREE.Group(); rightLeg.position.set( 0.14, 0.28, 0);

    const mkLeg = (group) => {
      // Upper leg
      const upper = mk(0.22, 0.30, 0.22, legCol);
      group.add(upper);
      // Lower leg (boot — slightly darker)
      const lower = mk(0.22, 0.30, 0.24, flat(0x111111));
      lower.position.set(0, -0.30, 0.01);
      group.add(lower);
    };
    mkLeg(leftLeg);
    mkLeg(rightLeg);
    g.add(leftLeg);
    g.add(rightLeg);

    // ---- Arms (grouped for walk swing) ----
    const leftArm  = new THREE.Group(); leftArm.position.set(-0.36, 0.85, 0);
    const rightArm = new THREE.Group(); rightArm.position.set( 0.36, 0.85, 0);

    const mkArm = (group, isRight) => {
      const arm = mk(0.20, 0.55, 0.20, bodyCol);
      group.add(arm);
      if (isRight) {
        // Krunker weapon carried at side (dark box gun)
        const recv = mk(0.07, 0.08, 0.38, flat(0x222222));
        recv.position.set(0, -0.05, -0.25); group.add(recv);
        const brl = mk(0.04, 0.04, 0.22, flat(0x111111));
        brl.position.set(0, -0.03, -0.46); group.add(brl);
        const mag = mk(0.05, 0.14, 0.05, flat(0x1a1a1a));
        mag.position.set(0, -0.15, -0.20); group.add(mag);
      }
    };
    mkArm(leftArm, false);
    mkArm(rightArm, true);
    g.add(leftArm);
    g.add(rightArm);

    // Store refs for walking animation
    g.userData.leftLeg   = leftLeg;
    g.userData.rightLeg  = rightLeg;
    g.userData.leftArm   = leftArm;
    g.userData.rightArm  = rightArm;
    g.userData.walkCycle = 0;
    g.userData.prevX     = 0;
    g.userData.prevZ     = 0;

    return g;
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
        this.remotePlayers.set(p.id, { mesh, label, team: p.team, alive: p.alive, usingGLTF: !!mesh.userData.usingGLTF });
      }

      const rp = this.remotePlayers.get(p.id);

      // Death knockdown: tilt body 90° to the side
      if (rp.alive && !p.alive) {
        // Just died — animate falling
        rp.mesh.userData.deathTilt = 0;
      }
      if (!p.alive && rp.mesh.userData.deathTilt !== undefined) {
        rp.mesh.userData.deathTilt = Math.min(Math.PI / 2, (rp.mesh.userData.deathTilt || 0) + 0.08);
        rp.mesh.rotation.z = rp.mesh.userData.deathTilt;
        rp.mesh.position.y = (p.y - 0.9) - Math.sin(rp.mesh.userData.deathTilt) * 0.4;
      } else if (p.alive) {
        rp.mesh.userData.deathTilt = 0;
        rp.mesh.rotation.z = 0;
        rp.mesh.position.set(p.x, p.y - 0.9, p.z);
      }

      rp.mesh.rotation.y = -p.yaw;
      rp.mesh.visible = p.alive || (rp.mesh.userData.deathTilt < Math.PI / 2);
      rp.label.visible = p.alive;
      rp.alive = p.alive;

      // Walking limb animation
      if (p.alive) {
        const ud = rp.mesh.userData;
        const dx = p.x - (ud.prevX || p.x), dz = p.z - (ud.prevZ || p.z);
        const isMoving = Math.sqrt(dx*dx + dz*dz) > 0.005;
        ud.prevX = p.x; ud.prevZ = p.z;

        if (isMoving) ud.walkCycle = (ud.walkCycle || 0) + 0.18;
        const wc = ud.walkCycle || 0;
        const swing = isMoving ? Math.sin(wc) * 0.4 : 0;
        const bodyBob = isMoving ? Math.abs(Math.sin(wc * 2)) * 0.04 : 0;

        if (ud.leftLeg)  ud.leftLeg.rotation.x  =  swing;
        if (ud.rightLeg) ud.rightLeg.rotation.x  = -swing;
        if (ud.leftArm)  ud.leftArm.rotation.x   = -swing * 0.5;
        if (ud.rightArm) ud.rightArm.rotation.x  =  swing * 0.5;
        rp.mesh.position.y = (p.y - 0.9) + bodyBob;
      }
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
      this.currentMap = data.map || 'arena';
      this._syncClientWalls(data.map);

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
        // Sync Y: gentle correction only — client physics now matches server 20 TPS
        const serverCamY = me.y + 0.6;
        const diff = serverCamY - this.camera.position.y;
        if (Math.abs(diff) > 1.5) {
          // Hard snap only if wildly off (teleport / respawn)
          this.camera.position.y = serverCamY;
          this.clientVY = 0;
          this.clientOnGround = (me.y <= 0.92);
        } else if (Math.abs(diff) > 0.05) {
          // Smooth blend — never fight the client arc mid-air
          this.camera.position.y += diff * 0.08;
        }
      }

      // CTF flag HUD
      if (data.flags && window.updateCTFHud) {
        window.updateCTFHud(data.flags);
      }
    });

    this.socket.on('damaged', (data) => {
      this.audio.playDamaged();
      this.health = data.health;
      this.ui.updateHealth(data.health);

      // Screen flash
      const flash = document.getElementById('damageFlash');
      if (flash) {
        flash.style.opacity = '0.5';
        setTimeout(() => { flash.style.opacity = '0'; }, 350);
      }

      // Screen shake — intensity scales with damage taken
      const prevHealth = this.health + (data.prevHealth ? 0 : 0);
      this.screenShakeAmt = Math.min(0.06, 0.02 + (100 - data.health) * 0.0004);
      this.screenShakeDecay = 0.82;
    });

    this.socket.on('playerKilled', (data) => {
      this.ui.addKillFeedEntry(
        data.killerName, data.killerTeam,
        data.victimName, data.victimTeam,
        data.weapon
      );

      if (data.victimId === this.localId) {
        this.alive = false;
        this.audio.playDeath();
        this.ui.showDeathScreen(3000);
        this.ui.hideReloading();
        if (this.onDeath) this.onDeath();
      }

      if (data.killerId === this.localId) {
        this.audio.playKillConfirm();
        if (this.onKill) this.onKill();
      }
    });

    this.socket.on('respawn', (data) => {
      this.audio.playRespawn();
      this.alive = true;
      this.health = 100;
      this.reloading = false;
      this.camera.position.set(data.x, data.y + 0.6, data.z);
      // Reset ammo from weapon defaults
      const WFR = this.WEAPON_FIRE_RATE;
      const AMMO_DEFAULTS = { ak47:{ammo:30,maxAmmo:90}, m4a1:{ammo:30,maxAmmo:90}, awp:{ammo:5,maxAmmo:20}, shotgun:{ammo:8,maxAmmo:32}, smg:{ammo:25,maxAmmo:100}, pistol:{ammo:12,maxAmmo:36}, deagle:{ammo:7,maxAmmo:28}, rpg:{ammo:5,maxAmmo:15} };
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
        this.audio.playHitConfirm();
      }
      const pos = new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
      this._spawnBloodParticles(pos);
      // Show health bar — always, for any hit (not just when you shoot)
      if (data.victimId !== undefined && data.victimHealth !== undefined) {
        this._showEnemyHealthBar(data.victimId, data.victimHealth);
      }
    });

    this.socket.on('bulletImpact', (data) => {
      this.audio.playBulletImpact();
      const pos = new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
      this._spawnImpactParticles(pos);
      // Bullet hole on wall
      this._spawnBulletHole(pos);
    });

    this.socket.on('ammoUpdate', (data) => {
      this.ammo[this.primaryWeapon] = { ammo: data.ammo, maxAmmo: data.maxAmmo };
      this.ammo[this.secondaryWeapon] = { ammo: data.pistolAmmo, maxAmmo: data.pistolMaxAmmo };
      const a = this.ammo[this.weapon];
      if (a) this.ui.updateAmmo(a.ammo, a.maxAmmo);
    });

    this.socket.on('reloadStart', (data) => {
      this.reloading = true;
      this.audio.playReloadStart();
      this._reloadAnimStart();
      this.ui.showReloading(data.duration);
    });

    this.socket.on('reloadEnd', (data) => {
      if (this._reloadAnimInterval) { clearInterval(this._reloadAnimInterval); this._reloadAnimInterval = null; }
      const model = this.weaponModels[this.weapon];
      if (model) { const base = this.weaponBasePos[this.weapon] || { x: 0.2, y: -0.28, z: -0.38 }; model.rotation.x = 0; model.position.y = base.y; }
      this.reloading = false;
      this.audio.playReloadEnd();
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

  _reloadAnimStart() {
    const model = this.weaponModels[this.weapon];
    if (!model) return;
    if (this._reloadAnimInterval) clearInterval(this._reloadAnimInterval);
    const base = this.weaponBasePos[this.weapon] || { x: 0.2, y: -0.28, z: -0.38 };
    let phase = 0;
    let t = 0;
    this._reloadAnimInterval = setInterval(() => {
      t += 0.05;
      if (phase === 0) {
        model.rotation.x = t * 0.6;
        model.position.y = base.y - t * 0.12;
        if (t >= 1) { t = 0; phase = 1; }
      } else if (phase === 1) {
        model.rotation.x = 0.6;
        model.position.y = base.y - 0.12;
        if (t >= 10) { t = 0; phase = 2; }
      } else {
        model.rotation.x = 0.6 * (1 - t);
        model.position.y = base.y - 0.12 * (1 - t);
        if (t >= 1) {
          model.rotation.x = 0;
          model.position.y = base.y;
          clearInterval(this._reloadAnimInterval);
          this._reloadAnimInterval = null;
        }
      }
    }, 16);
  }

  _syncClientWalls(mapName) {
    const FACTORY_WALLS = [
      { x: -18, z: -18, w: 10, d: 6 }, { x: 18, z: -18, w: 10, d: 6 },
      { x: -18, z: 18, w: 10, d: 6 }, { x: 18, z: 18, w: 10, d: 6 },
      { x: 0, z: 0, w: 5, d: 5 },
      { x: -10, z: 0, w: 1, d: 14 }, { x: 10, z: 0, w: 1, d: 14 },
      { x: -30, z: -8, w: 3, d: 3 }, { x: -30, z: 8, w: 3, d: 3 },
      { x: 30, z: -8, w: 3, d: 3 }, { x: 30, z: 8, w: 3, d: 3 },
    ];
    const BLOCKADE_WALLS = [
      { x: -20, z: 0, w: 1, d: 80 }, { x: 20, z: 0, w: 1, d: 80 },
      { x: -10, z: -28, w: 12, d: 0.8 }, { x: 10, z: -28, w: 12, d: 0.8 },
      { x: -10, z: 28, w: 12, d: 0.8 }, { x: 10, z: 28, w: 12, d: 0.8 },
      { x: -7, z: -12, w: 2.5, d: 5 }, { x: 7, z: 5, w: 2.5, d: 5 },
      { x: -5, z: 18, w: 2.5, d: 5 }, { x: 8, z: -20, w: 2.5, d: 5 },
      { x: 0, z: 0, w: 9, d: 0.5 },
    ];
    if (mapName === 'factory') this.CLIENT_WALLS = FACTORY_WALLS;
    else if (mapName === 'blockade') this.CLIENT_WALLS = BLOCKADE_WALLS;
  }

  // ---- Game Loop ----

  stop() {
    this._stopped = true;
    if (this.socket && this.socket.socket) this.socket.socket.disconnect();
    if (this.renderer) { this.renderer.dispose(); }
  }

  _animate() {
    if (this._stopped) return;
    requestAnimationFrame(() => this._animate());

    const now = Date.now();
    this._processInput(now);
    this._updateParticles();
    this._updateTracers();

    // Auto-fire for automatic weapons
    if (this.shootHeld && this.WEAPON_AUTO[this.weapon] && this.alive && this.pointerLocked) {
      this._shoot();
    }

    // Screen shake
    if (this.screenShakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.screenShakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.screenShakeAmt * 0.6;
      this.screenShakeAmt *= this.screenShakeDecay;
    } else {
      this.screenShakeAmt = 0;
    }

    this._updateWeaponSway();

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _updateWeaponSway() {
    const model = this.weaponModels[this.weapon];
    if (!model) return;
    const base = this.weaponBasePos[this.weapon] || { x: 0.2, y: -0.28, z: -0.38 };
    const t = Date.now() * 0.001;

    // Moving = keys held and on ground
    const moving = this.alive && this.clientOnGround && (
      this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']
    );

    if (moving) this.walkCycle += 0.11;

    // Walk bob
    const bobX = moving ? Math.sin(this.walkCycle) * 0.013 : 0;
    const bobY = moving ? Math.abs(Math.sin(this.walkCycle * 2)) * -0.009 : 0;

    // Idle sway (gentle breathing)
    const idleX = Math.sin(t * 0.7) * 0.0018;
    const idleY = Math.sin(t * 1.1) * 0.0012;

    // Mouse look sway (lags behind camera rotation)
    const mouseSwayX = -this.mouse.dx * 0.00025;
    const mouseSwayY = -this.mouse.dy * 0.00025;

    const targetX = base.x + idleX + bobX + mouseSwayX;
    const targetY = base.y + idleY + bobY + mouseSwayY;

    // Smooth lerp
    this.swayX += (targetX - this.swayX) * 0.12;
    this.swayY += (targetY - this.swayY) * 0.12;

    model.position.x = this.swayX;
    model.position.y = this.swayY;
  }

  _processInput(now) {
    if (!this.localId || !this.pointerLocked) return;

    // Mouse look
    this.yaw -= this.mouse.dx * this.sensitivity;
    this.pitch -= this.mouse.dy * this.sensitivity;
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

      // Client-side vertical prediction — per-frame scaled to match 20 TPS trajectory
      const GRAVITY_C   = -0.015;  // server gravity per tick
      const JUMP_FORCE_C = 0.35;   // server jump force
      const EYE_H = 1.5;
      const SCALE = 16 / 50; // ~3 client frames per server tick

      if (this.keys['Space'] && this.clientOnGround) {
        this.clientVY = JUMP_FORCE_C;
        this.clientOnGround = false;
        this.audio.playJump();
      }

      this.clientVY += GRAVITY_C * SCALE;
      const newY = this.camera.position.y + this.clientVY * SCALE;
      if (newY <= EYE_H) {
        this.camera.position.y = EYE_H;
        this.clientVY = 0;
        this.clientOnGround = true;
      } else {
        this.camera.position.y = newY;
        this.clientOnGround = false;
      }

      // Walk bob (only on ground while moving)
      if (len > 0 && this.clientOnGround) {
        const bob = Math.sin(now * 0.008) * 0.025;
        this.camera.position.y += bob;

        // Footstep dust every ~0.55s
        this.footstepTimer += 16;
        if (this.footstepTimer > 550) {
          this.footstepTimer = 0;
          this._spawnFootstepDust();
          this.audio.playFootstep();
        }
      } else {
        this.footstepTimer = 0;
      }
    }
  }

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= 0.016;

      if (p.isCasing) {
        // Brass casing: gravity + bounce off floor
        p.vel.y -= 0.018;
        p.mesh.position.add(p.vel);
        if (p.mesh.position.y < 0.03) {
          p.mesh.position.y = 0.03;
          p.vel.y *= -0.35;  // bounce
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        }
        if (p.spin) {
          p.mesh.rotation.x += p.spin.x;
          p.mesh.rotation.y += p.spin.y;
          p.mesh.rotation.z += p.spin.z;
          p.spin.multiplyScalar(0.97); // slow spin
        }
        // Fade out in last 0.4s
        const fadeStart = 0.4;
        if (p.life < fadeStart) {
          p.mesh.material.transparent = true;
          p.mesh.material.opacity = p.life / fadeStart;
        }
      } else {
        p.vel.y -= 0.01;
        p.mesh.position.add(p.vel);
        p.mesh.material.opacity = p.life / p.maxLife;
        p.mesh.material.transparent = true;
      }

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
