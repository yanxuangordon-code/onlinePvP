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
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.getElementById('gameCanvas').appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
      if (this.fxaaPass) {
        const pr = Math.min(window.devicePixelRatio, 2);
        this.fxaaPass.material.uniforms['resolution'].value.set(
          1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr)
        );
      }
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
    ak.position.set(0.2, -0.28, -0.38); this.camera.add(ak);
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
    m4.position.set(0.2, -0.28, -0.38); m4.visible = false; this.camera.add(m4);
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
    awp.position.set(0.22, -0.28, -0.55); awp.visible = false; this.camera.add(awp);
    this.weaponModels.awp = awp;

    // --- Shotgun ---
    const sg = new THREE.Group();
    addParts(sg, [
      [box(0.1, 0.09, 0.45, dark), 0, 0, 0],
      [box(0.06, 0.06, 0.22, metal), 0, 0.02, -0.3],
      [box(0.09, 0.12, 0.18, wood), 0, -0.025, 0.18],
      [box(0.045, 0.06, 0.04, blk), 0, -0.05, -0.02],
    ]);
    sg.position.set(0.2, -0.28, -0.35); sg.visible = false; this.camera.add(sg);
    this.weaponModels.shotgun = sg;

    // --- SMG (UMP-45) ---
    const smg = new THREE.Group();
    addParts(smg, [
      [box(0.07, 0.07, 0.36, metal2), 0, 0, 0],
      [box(0.025, 0.025, 0.18, dark), 0, 0.02, -0.25],
      [box(0.05, 0.09, 0.1, dark), 0, -0.018, 0.14],
      [box(0.035, 0.1, 0.05, dark), 0, -0.082, 0.03],
    ]);
    smg.position.set(0.18, -0.28, -0.3); smg.visible = false; this.camera.add(smg);
    this.weaponModels.smg = smg;

    // --- Pistol (Glock) ---
    const pistol = new THREE.Group();
    addParts(pistol, [
      [box(0.055, 0.12, 0.2, metal2), 0, 0, 0],
      [box(0.03, 0.03, 0.12, dark), 0, 0.04, -0.14],
      [box(0.05, 0.1, 0.07, wood), 0, -0.1, 0.04],
    ]);
    pistol.position.set(0.15, -0.28, -0.3); pistol.visible = false; this.camera.add(pistol);
    this.weaponModels.pistol = pistol;

    // --- Desert Eagle ---
    const deagle = new THREE.Group();
    addParts(deagle, [
      [box(0.065, 0.14, 0.25, dark), 0, 0, 0],
      [box(0.035, 0.035, 0.15, metal), 0, 0.05, -0.18],
      [box(0.055, 0.11, 0.09, dark), 0, -0.12, 0.06],
      [box(0.04, 0.06, 0.04, blk), 0, -0.045, 0.02],
    ]);
    deagle.position.set(0.15, -0.28, -0.3); deagle.visible = false; this.camera.add(deagle);
    this.weaponModels.deagle = deagle;

    // Aliases for backward compat
    this.rifleModel  = this.weaponModels.ak47;
    this.pistolModel = this.weaponModels.pistol;
  }

  // ---- Scene ----

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0d1a26, 0.007);

    // Gradient sky sphere
    const skyGeo = new THREE.SphereGeometry(490, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop:     { value: new THREE.Color(0x060d18) },
        uHorizon: { value: new THREE.Color(0x0d1e30) },
        uGlow:    { value: new THREE.Color(0x112233) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = mix(uGlow, uHorizon, smoothstep(-0.15, 0.05, h));
          col = mix(col, uTop, smoothstep(0.05, 0.6, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  _initLights() {
    // Indoor arena — no direct sun, lit by ceiling fixtures
    const ambient = new THREE.AmbientLight(0x303848, 0.9);
    this.scene.add(ambient);

    // Soft overhead fill (simulates ceiling bounce, no shadows)
    const overhead = new THREE.DirectionalLight(0xc8d8f0, 0.7);
    overhead.position.set(0, 10, 0);
    overhead.castShadow = true;
    overhead.shadow.mapSize.width = 2048;
    overhead.shadow.mapSize.height = 2048;
    overhead.shadow.camera.near = 1;
    overhead.shadow.camera.far = 100;
    overhead.shadow.camera.left = -60;
    overhead.shadow.camera.right = 60;
    overhead.shadow.camera.top = 60;
    overhead.shadow.camera.bottom = -60;
    overhead.shadow.bias = -0.0003;
    this.scene.add(overhead);

    // CT base — cool blue accent
    const ctLight = new THREE.PointLight(0x3366cc, 1.4, 30);
    ctLight.position.set(0, 5, -38);
    this.scene.add(ctLight);

    // T base — warm red accent
    const tLight = new THREE.PointLight(0xcc3311, 1.4, 30);
    tLight.position.set(0, 5, 38);
    this.scene.add(tLight);

    // Mid ceiling fill lights (match strip positions)
    const fills = [
      [0, 5.5, 0, 0xd0e0f0, 0.9, 22],
      [-20, 5.5, -15, 0xc8d4e8, 0.7, 18],
      [ 20, 5.5, -15, 0xc8d4e8, 0.7, 18],
      [-20, 5.5,  15, 0xd0c8e0, 0.7, 18],
      [ 20, 5.5,  15, 0xd0c8e0, 0.7, 18],
    ];
    for (const [x, y, z, col, intensity, dist] of fills) {
      const l = new THREE.PointLight(col, intensity, dist);
      l.position.set(x, y, z);
      this.scene.add(l);
    }
  }

  _initPostProcessing() {
    if (typeof THREE.EffectComposer === 'undefined') return; // CDN not loaded

    const composer = new THREE.EffectComposer(this.renderer);
    composer.addPass(new THREE.RenderPass(this.scene, this.camera));

    // Bloom — subtle glow on emissive strips and muzzle flash
    this.bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.28,  // strength (was 0.5 — much more subtle)
      0.45,  // radius
      0.88   // threshold (was 0.80 — only brightest emissives bloom)
    );
    composer.addPass(this.bloomPass);

    // Vignette + subtle color grade
    const vignetteShader = {
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          // Vignette
          vec2 uv = vUv - 0.5;
          float v = smoothstep(0.75, 0.25, length(uv) * 1.4);
          c.rgb *= mix(0.35, 1.0, v);
          // ACE-style lift + slight desaturate in shadows
          float luma = dot(c.rgb, vec3(0.299,0.587,0.114));
          c.rgb = mix(c.rgb, vec3(luma), 0.08 * (1.0 - luma));
          gl_FragColor = c;
        }
      `,
    };
    composer.addPass(new THREE.ShaderPass(vignetteShader));

    // FXAA — smooth edges (always last)
    const fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    const pr = Math.min(window.devicePixelRatio, 2);
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr)
    );
    this.fxaaPass = fxaaPass;
    composer.addPass(fxaaPass);

    this.composer = composer;
  }

  _buildMap() {
    const self = this;

    // ---- High-quality procedural textures ----
    function makeTex(size, drawFn) {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      drawFn(canvas.getContext('2d'), size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    // Concrete block wall (realistic mortar seams + noise)
    const wallTex = makeTex(512, (ctx, S) => {
      ctx.fillStyle = '#8c8880'; ctx.fillRect(0, 0, S, S);
      const bW = 128, bH = 56;
      for (let row = 0; row < Math.ceil(S / bH) + 1; row++) {
        const off = (row % 2) * (bW / 2);
        for (let col = -1; col < Math.ceil(S / bW) + 1; col++) {
          const bx = col * bW + off, by = row * bH;
          const vari = Math.random() * 18 - 9;
          const base = 140 + vari;
          ctx.fillStyle = `rgb(${base - 3|0},${base - 5|0},${base - 12|0})`;
          ctx.fillRect(bx + 3, by + 3, bW - 6, bH - 6);
          // micro noise
          for (let n = 0; n < 30; n++) {
            const nv = Math.random() * 14 - 7;
            ctx.fillStyle = `rgba(${nv>0?255:0},${nv>0?255:0},${nv>0?255:0},${Math.abs(nv)/90})`;
            ctx.fillRect(bx + 3 + Math.random()*(bW-8), by + 3 + Math.random()*(bH-8), 3, 3);
          }
        }
      }
      // Mortar seams
      ctx.strokeStyle = '#5a574e'; ctx.lineWidth = 6;
      for (let row = 0; row <= Math.ceil(S/bH)+1; row++) { ctx.beginPath(); ctx.moveTo(0,row*bH); ctx.lineTo(S,row*bH); ctx.stroke(); }
      for (let row = 0; row <= Math.ceil(S/bH)+1; row++) {
        const off = (row%2)*(bW/2);
        for (let col = 0; col <= Math.ceil(S/bW)+1; col++) { ctx.beginPath(); ctx.moveTo(col*bW+off,row*bH); ctx.lineTo(col*bW+off,(row+1)*bH); ctx.stroke(); }
      }
    });
    wallTex.repeat.set(4, 2);

    // Industrial concrete floor tiles
    const floorTex = makeTex(512, (ctx, S) => {
      ctx.fillStyle = '#686868'; ctx.fillRect(0, 0, S, S);
      // Noise
      for (let x = 0; x < S; x += 3) for (let y = 0; y < S; y += 3) {
        const v = Math.random()*18-9;
        ctx.fillStyle = `rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)/110})`;
        ctx.fillRect(x,y,3,3);
      }
      // Large tiles
      const tileS = 128;
      ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 5;
      for (let i=0;i<=S;i+=tileS){ ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,S);ctx.stroke(); ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(S,i);ctx.stroke(); }
      // Inner tile highlight
      ctx.strokeStyle = '#787878'; ctx.lineWidth = 1;
      for (let tx=0;tx<S/tileS;tx++) for (let ty=0;ty<S/tileS;ty++) {
        ctx.strokeRect(tx*tileS+5,ty*tileS+5,tileS-10,tileS-10);
      }
    });
    floorTex.repeat.set(20, 20);

    // Wood crate with planks + metal brackets
    const boxTex = makeTex(256, (ctx, S) => {
      for (let row = 0; row < 8; row++) {
        const y = row * 32, off = (row%2)*128;
        const wc = 90 + Math.floor(Math.random()*20);
        ctx.fillStyle = `rgb(${wc+20},${wc},${wc-25})`; ctx.fillRect(0,y,S,30);
        ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
        for (let g=0;g<5;g++){ ctx.beginPath();ctx.moveTo(0,y+g*6);ctx.lineTo(S,y+g*6+Math.random()*2);ctx.stroke(); }
        ctx.strokeStyle='#3a1a00'; ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(0,y+30);ctx.lineTo(S,y+30);ctx.stroke();
        ctx.beginPath();ctx.moveTo(off+128,y);ctx.lineTo(off+128,y+30);ctx.stroke();
      }
      // Metal corner brackets
      ctx.fillStyle='#555';
      [[0,0],[S,0],[0,S],[S,S],[S/2,0],[S/2,S],[0,S/2],[S,S/2]].forEach(([x,y])=>{
        ctx.fillRect(x-5,y-2,10,4); ctx.fillRect(x-2,y-5,4,10);
      });
    });
    boxTex.repeat.set(1, 1);

    // Dark metal ceiling with panel lines
    const ceilTex = makeTex(256, (ctx, S) => {
      ctx.fillStyle = '#2e3238'; ctx.fillRect(0, 0, S, S);
      for (let x=0;x<S;x+=4) for (let y=0;y<S;y+=4) {
        const v=Math.random()*6-3; ctx.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)/100})`; ctx.fillRect(x,y,4,4);
      }
      ctx.strokeStyle='#1a1e22'; ctx.lineWidth=4;
      for (let i=0;i<=S;i+=64){ ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,S);ctx.stroke(); ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(S,i);ctx.stroke(); }
      // Rivets
      ctx.fillStyle='#4a4e52';
      [[10,10],[54,10],[10,54],[54,54],[10,138],[54,138],[10,182],[54,182],[138,10],[182,10],[138,54],[182,54],[138,138],[182,138],[138,182],[182,182]].forEach(([x,y])=>{
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      });
    });
    ceilTex.repeat.set(8, 8);

    // CT spawn zone - tactical blue with directional arrows
    const ctTex = makeTex(256, (ctx, S) => {
      ctx.fillStyle='#091830'; ctx.fillRect(0,0,S,S);
      ctx.strokeStyle='rgba(30,80,200,0.25)'; ctx.lineWidth=1;
      for (let i=0;i<=S;i+=24){ ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,S);ctx.stroke(); ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(S,i);ctx.stroke(); }
      ctx.fillStyle='rgba(40,100,220,0.35)';
      [64,192].forEach(cy=>{
        ctx.beginPath(); ctx.moveTo(88,cy-22); ctx.lineTo(168,cy); ctx.lineTo(88,cy+22); ctx.lineTo(108,cy); ctx.closePath(); ctx.fill();
      });
      // CT text watermark
      ctx.fillStyle='rgba(60,130,255,0.12)'; ctx.font='bold 64px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('CT',S/2,S/2);
    });
    ctTex.repeat.set(2, 2);

    // T spawn zone - tactical red
    const tTex = makeTex(256, (ctx, S) => {
      ctx.fillStyle='#1e0808'; ctx.fillRect(0,0,S,S);
      ctx.strokeStyle='rgba(200,30,30,0.25)'; ctx.lineWidth=1;
      for (let i=0;i<=S;i+=24){ ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,S);ctx.stroke(); ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(S,i);ctx.stroke(); }
      ctx.fillStyle='rgba(220,40,40,0.35)';
      [64,192].forEach(cy=>{
        ctx.beginPath(); ctx.moveTo(168,cy-22); ctx.lineTo(88,cy); ctx.lineTo(168,cy+22); ctx.lineTo(148,cy); ctx.closePath(); ctx.fill();
      });
      ctx.fillStyle='rgba(255,60,60,0.12)'; ctx.font='bold 64px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('T',S/2,S/2);
    });
    tTex.repeat.set(2, 2);

    const std = (map, col, rough, metal) => new THREE.MeshStandardMaterial({ map, color: col||0xffffff, roughness: rough!==undefined?rough:0.85, metalness: metal||0 });

    const wallMat       = std(wallTex,  0xffffff, 0.9,  0.02);
    const floorMat      = std(floorTex, 0xffffff, 0.85, 0.05);
    const ceilMat       = std(ceilTex,  0xffffff, 0.6,  0.3);
    const boxMat        = std(boxTex,   0xffffff, 0.95, 0.0);
    const concreteMat   = new THREE.MeshStandardMaterial({ color: 0x7a7874, roughness: 0.9, metalness: 0.0 });
    const concreteMatDk = new THREE.MeshStandardMaterial({ color: 0x575450, roughness: 0.9, metalness: 0.0 });
    const metalMat      = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.4, metalness: 0.7 });
    const ctWallMat     = new THREE.MeshStandardMaterial({ color: 0x1a3a88, roughness: 0.7, metalness: 0.15, emissive: 0x0a1a44, emissiveIntensity: 0.3 });
    const tWallMat      = new THREE.MeshStandardMaterial({ color: 0x882222, roughness: 0.7, metalness: 0.15, emissive: 0x440a0a, emissiveIntensity: 0.3 });

    function addBox(x, y, z, w, h, d, mat) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || boxMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      self.scene.add(mesh);
      return mesh;
    }

    // ---- Floor ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    self.scene.add(floor);

    // ---- Ceiling ----
    const wallH = 6;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = wallH;
    ceil.receiveShadow = true;
    self.scene.add(ceil);

    // ---- Boundary walls ----
    for (const w of [
      { pos: [0, wallH/2, -50], size: [100, wallH, 0.5] },
      { pos: [0, wallH/2,  50], size: [100, wallH, 0.5] },
      { pos: [-50, wallH/2, 0], size: [0.5, wallH, 100] },
      { pos: [ 50, wallH/2, 0], size: [0.5, wallH, 100] },
    ]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
      mesh.position.set(...w.pos); mesh.castShadow = true; mesh.receiveShadow = true;
      self.scene.add(mesh);
    }

    // ---- Wall base trim (metal strip at floor level) ----
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.4, metalness: 0.8 });
    for (const w of [
      { pos: [0, 0.08, -49.8], size: [100, 0.16, 0.12] },
      { pos: [0, 0.08,  49.8], size: [100, 0.16, 0.12] },
      { pos: [-49.8, 0.08, 0], size: [0.12, 0.16, 100] },
      { pos: [ 49.8, 0.08, 0], size: [0.12, 0.16, 100] },
    ]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), trimMat);
      mesh.position.set(...w.pos); self.scene.add(mesh);
    }

    // ---- Ceiling light strips ----
    const lightStripMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: new THREE.Color(0xc8dcf0), emissiveIntensity: 1.8,
      roughness: 0.5, metalness: 0.3
    });
    const lightHousingMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.5, metalness: 0.6 });
    const stripPositions = [
      [0, 0], [-20, -15], [20, -15], [-20, 15], [20, 15],
      [0, -30], [0, 30], [-10, 0], [10, 0],
    ];
    for (const [sx, sz] of stripPositions) {
      // Housing box
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 2.5), lightHousingMat);
      housing.position.set(sx, wallH - 0.05, sz);
      self.scene.add(housing);
      // Emissive strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 2.2), lightStripMat);
      strip.position.set(sx, wallH - 0.07, sz);
      self.scene.add(strip);
    }

    // ---- CT spawn zone ----
    const ctSpawn = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), std(ctTex));
    ctSpawn.rotation.x = -Math.PI/2; ctSpawn.position.set(0, 0.01, -41);
    self.scene.add(ctSpawn);

    // ---- T spawn zone ----
    const tSpawn = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), std(tTex));
    tSpawn.rotation.x = -Math.PI/2; tSpawn.position.set(0, 0.01, 41);
    self.scene.add(tSpawn);

    // ---- Spawn back walls with emissive color ----
    addBox(0, 2.5, -45.5, 22, 5, 0.5, ctWallMat);
    addBox(0, 2.5,  45.5, 22, 5, 0.5, tWallMat);
    // Side spawn walls
    addBox(-11, 2.5, -42, 0.5, 5, 8, ctWallMat);
    addBox( 11, 2.5, -42, 0.5, 5, 8, ctWallMat);
    addBox(-11, 2.5,  42, 0.5, 5, 8, tWallMat);
    addBox( 11, 2.5,  42, 0.5, 5, 8, tWallMat);

    // ---- Central building ----
    addBox(0, 2, 0, 6, 4, 6, concreteMat);
    addBox(0, 4.1, 0, 6.5, 0.22, 6.5, concreteMatDk);
    // Metal corner trim on building
    for (const [cx,cz] of [[-3,-3],[-3,3],[3,-3],[3,3]]) {
      addBox(cx, 2, cz, 0.15, 4, 0.15, metalMat);
    }

    // ---- CT side cover walls ----
    addBox(-15, 1, -20, 8, 2, 0.4, concreteMat);
    addBox( 15, 1, -20, 8, 2, 0.4, concreteMat);
    // Pillars
    addBox(-8, 1.5, -30, 0.5, 3, 8, concreteMat);
    addBox( 8, 1.5, -30, 0.5, 3, 8, concreteMat);
    // Metal top cap on pillars
    addBox(-8, 3.1, -30, 0.7, 0.15, 8.2, metalMat);
    addBox( 8, 3.1, -30, 0.7, 0.15, 8.2, metalMat);

    // ---- T side cover walls ----
    addBox(-15, 1, 20, 8, 2, 0.4, concreteMat);
    addBox( 15, 1, 20, 8, 2, 0.4, concreteMat);
    addBox(-8, 1.5, 30, 0.5, 3, 8, concreteMat);
    addBox( 8, 1.5, 30, 0.5, 3, 8, concreteMat);
    addBox(-8, 3.1, 30, 0.7, 0.15, 8.2, metalMat);
    addBox( 8, 3.1, 30, 0.7, 0.15, 8.2, metalMat);

    // ---- Mid crates (stacked) ----
    addBox(-10, 0.75, 0, 3, 1.5, 3);
    addBox( 10, 0.75, 0, 3, 1.5, 3);
    addBox(  0, 0.75,-12, 3, 1.5, 3);
    addBox(  0, 0.75, 12, 3, 1.5, 3);
    // Stacked top crates (smaller, slightly offset)
    addBox(-10, 2.25, 0, 2, 1, 2);
    addBox( 10, 2.25, 0, 2, 1, 2);

    // ---- Side corridors ----
    addBox(-25, 2, 0, 0.4, 4, 20, concreteMat);
    addBox( 25, 2, 0, 0.4, 4, 20, concreteMat);
    // Metal catwalk platforms
    addBox(-22, 2.5, -8, 6, 0.25, 3, metalMat);
    addBox(-22, 2.5,  8, 6, 0.25, 3, metalMat);
    addBox( 22, 2.5, -8, 6, 0.25, 3, metalMat);
    addBox( 22, 2.5,  8, 6, 0.25, 3, metalMat);
    // Catwalk railings
    for (const [rx,rz,rw,rd] of [
      [-22,  -9.4, 6, 0.08], [-22,  -6.6, 6, 0.08],
      [-22,   6.6, 6, 0.08], [-22,   9.4, 6, 0.08],
      [ 22,  -9.4, 6, 0.08], [ 22,  -6.6, 6, 0.08],
      [ 22,   6.6, 6, 0.08], [ 22,   9.4, 6, 0.08],
    ]) { addBox(rx, 3.2, rz, rw, 0.8, rd, metalMat); }

    // ---- Center barriers ----
    addBox(-5, 0.5, -5, 0.3, 1, 4, concreteMat);
    addBox( 5, 0.5, -5, 0.3, 1, 4, concreteMat);
    addBox(-5, 0.5,  5, 0.3, 1, 4, concreteMat);
    addBox( 5, 0.5,  5, 0.3, 1, 4, concreteMat);

    // ---- Scattered crates ----
    addBox(-18, 0.6, -10, 1.5, 1.2, 1.5);
    addBox(-18, 0.6,  10, 1.5, 1.2, 1.5);
    addBox( 18, 0.6, -10, 1.5, 1.2, 1.5);
    addBox( 18, 0.6,  10, 1.5, 1.2, 1.5);
    addBox(-18, 1.8, -10, 1.2,  1.0, 1.2);
    addBox( 18, 1.8,  10, 1.2,  1.0, 1.2);

    // ---- Support pillars (structural, near walls) ----
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.5, metalness: 0.5 });
    for (const [px,pz] of [[-40,-40],[-40,40],[40,-40],[40,40],[-40,0],[40,0],[0,-40],[0,40]]) {
      addBox(px, wallH/2, pz, 0.6, wallH, 0.6, pillarMat);
      // Base plate
      addBox(px, 0.06, pz, 1.0, 0.12, 1.0, metalMat);
      // Cap plate
      addBox(px, wallH-0.06, pz, 0.9, 0.12, 0.9, metalMat);
    }

    // ---- Site markers (A/B) ----
    function makeSiteTex(letter) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(220,200,20,0.85)'; ctx.fillRect(0,0,256,256);
      // inner lighter area
      ctx.fillStyle = 'rgba(255,240,60,0.5)'; ctx.fillRect(12,12,232,232);
      ctx.fillStyle = '#1a1a00'; ctx.font = 'bold 140px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(letter, 128, 128);
      ctx.strokeStyle = '#888800'; ctx.lineWidth = 8; ctx.strokeRect(6,6,244,244);
      return new THREE.CanvasTexture(c);
    }
    for (const [x,letter] of [[-20,'A'],[20,'B']]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7),
        new THREE.MeshStandardMaterial({ map: makeSiteTex(letter), roughness: 0.8, emissive: 0x333300, emissiveIntensity: 0.4 }));
      m.rotation.x = -Math.PI/2; m.position.set(x, 0.02, 0);
      self.scene.add(m);
    }

    // ---- Barrel props (decorative) ----
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.6, metalness: 0.4 });
    const barrelGeo = new THREE.CylinderGeometry(0.3, 0.28, 0.9, 10);
    const barrelRingMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8 });
    const barrelRingGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 10);
    for (const [bx, bz] of [[-12,-18],[12,18],[-12,18],[12,-18],[0,-22],[0,22]]) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(bx, 0.45, bz); barrel.castShadow = true; barrel.receiveShadow = true;
      self.scene.add(barrel);
      const ring1 = new THREE.Mesh(barrelRingGeo, barrelRingMat);
      ring1.position.set(bx, 0.72, bz); self.scene.add(ring1);
      const ring2 = new THREE.Mesh(barrelRingGeo, barrelRingMat);
      ring2.position.set(bx, 0.18, bz); self.scene.add(ring2);
    }

    // ---- Fog (indoor — tight) ----
    this.scene.fog = new THREE.Fog(0x1a2030, 60, 140);
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
    const isCT = team === 'ct';
    const g = new THREE.Group();

    const bodyCol   = isCT ? 0x1e3d70 : 0x6b2010;
    const armorCol  = isCT ? 0x2a5298 : 0x8b2800;
    const helmetCol = isCT ? 0x1a3060 : 0x4a1500;
    const pantsCol  = isCT ? 0x0e1e40 : 0x220a00;
    const gloveCol  = 0x1a1a1a;
    const skinCol   = 0xc8a882;
    const gunMetalCol = 0x222428;
    const visorCol  = isCT ? 0x4488ff : 0xff6633;

    const mat = (col, rough, metal) => new THREE.MeshStandardMaterial({ color: col, roughness: rough||0.8, metalness: metal||0 });

    const mk = (w, h, d, col, rough, metal) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col, rough, metal));
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };

    // --- Torso ---
    add(mk(0.58, 0.95, 0.28, bodyCol, 0.9, 0.0), 0, 0.52, 0);
    // Chest armor plate
    add(mk(0.50, 0.55, 0.08, armorCol, 0.5, 0.2), 0, 0.62, -0.18);
    // Shoulder pads
    add(mk(0.16, 0.18, 0.22, armorCol, 0.5, 0.25), -0.37, 0.88, 0);
    add(mk(0.16, 0.18, 0.22, armorCol, 0.5, 0.25),  0.37, 0.88, 0);
    // Belt
    add(mk(0.60, 0.08, 0.30, 0x1a1a1a, 0.6, 0.3), 0, 0.07, 0);
    // Small pouch on belt
    add(mk(0.10, 0.12, 0.10, 0x333333, 0.8, 0.1), -0.22, 0.07, -0.15);

    // --- Head ---
    add(mk(0.38, 0.36, 0.36, skinCol, 0.9, 0.0), 0, 1.30, 0);
    // Helmet shell
    add(mk(0.44, 0.22, 0.44, helmetCol, 0.4, 0.3), 0, 1.52, 0);
    // Helmet brim
    add(mk(0.46, 0.05, 0.20, helmetCol, 0.4, 0.35), 0, 1.40, -0.22);
    // Visor / face guard
    const visorMesh = mk(0.38, 0.10, 0.06, visorCol, 0.1, 0.6);
    visorMesh.material.emissive = new THREE.Color(visorCol);
    visorMesh.material.emissiveIntensity = 0.2;
    add(visorMesh, 0, 1.26, -0.20);
    // Ear protection
    add(mk(0.06, 0.20, 0.24, helmetCol, 0.5, 0.2), -0.24, 1.40, 0);
    add(mk(0.06, 0.20, 0.24, helmetCol, 0.5, 0.2),  0.24, 1.40, 0);

    // --- Arms ---
    const upperArmCol = bodyCol;
    // Left upper arm
    add(mk(0.20, 0.38, 0.20, upperArmCol, 0.85, 0.0), -0.40, 0.70, 0);
    // Left forearm (gloved)
    add(mk(0.18, 0.32, 0.18, gloveCol, 0.7, 0.15), -0.40, 0.36, 0);
    // Left hand
    add(mk(0.16, 0.14, 0.10, gloveCol, 0.7, 0.15), -0.40, 0.17, -0.04);
    // Right upper arm
    add(mk(0.20, 0.38, 0.20, upperArmCol, 0.85, 0.0),  0.40, 0.70, 0);
    // Right forearm
    add(mk(0.18, 0.32, 0.18, gloveCol, 0.7, 0.15),  0.40, 0.36, 0);
    // Right hand (angled for weapon hold)
    add(mk(0.16, 0.14, 0.10, gloveCol, 0.7, 0.15),  0.40, 0.17, -0.04);

    // --- Weapon (carried at right side) ---
    // Receiver
    add(mk(0.07, 0.08, 0.40, gunMetalCol, 0.35, 0.85), 0.40, 0.80, -0.22);
    // Barrel
    add(mk(0.04, 0.04, 0.28, gunMetalCol, 0.3, 0.9),   0.40, 0.83, -0.48);
    // Magazine
    add(mk(0.05, 0.14, 0.06, 0x1a1a1a, 0.5, 0.5),     0.40, 0.70, -0.18);
    // Stock
    add(mk(0.06, 0.07, 0.14, 0x3a3a3a, 0.6, 0.4),     0.40, 0.79, -0.0);

    // --- Legs ---
    // Upper legs
    add(mk(0.24, 0.50, 0.24, pantsCol, 0.9, 0.0), -0.16, -0.24, 0);
    add(mk(0.24, 0.50, 0.24, pantsCol, 0.9, 0.0),  0.16, -0.24, 0);
    // Knee pads
    add(mk(0.22, 0.14, 0.14, armorCol, 0.5, 0.2), -0.16, -0.38, -0.10);
    add(mk(0.22, 0.14, 0.14, armorCol, 0.5, 0.2),  0.16, -0.38, -0.10);
    // Lower legs
    add(mk(0.20, 0.42, 0.20, pantsCol, 0.9, 0.0), -0.16, -0.70, 0);
    add(mk(0.20, 0.42, 0.20, pantsCol, 0.9, 0.0),  0.16, -0.70, 0);
    // Boots
    add(mk(0.22, 0.12, 0.26, 0x111111, 0.8, 0.1), -0.16, -0.94, -0.02);
    add(mk(0.22, 0.12, 0.26, 0x111111, 0.8, 0.1),  0.16, -0.94, -0.02);

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
        // Sync Y: only correct from server if significantly off (let client prediction run)
        const serverCamY = me.y + 0.6;
        const diff = serverCamY - this.camera.position.y;
        if (Math.abs(diff) > 0.3) {
          // Hard snap if very far off
          this.camera.position.y = serverCamY;
          this.clientVY = 0;
          this.clientOnGround = (me.y <= 0.91);
        } else if (Math.abs(diff) > 0.05) {
          // Gentle lerp to avoid jitter
          this.camera.position.y += diff * 0.15;
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

    // Screen shake
    if (this.screenShakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.screenShakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.screenShakeAmt * 0.6;
      this.screenShakeAmt *= this.screenShakeDecay;
    } else {
      this.screenShakeAmt = 0;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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

      // Client-side vertical prediction (jump + gravity)
      const GRAVITY_C = -0.015;
      const JUMP_FORCE_C = 0.25;
      const EYE_H = 1.5; // camera Y when on ground

      this.clientVY += GRAVITY_C;
      const newY = this.camera.position.y + this.clientVY;
      if (newY <= EYE_H) {
        this.camera.position.y = EYE_H;
        this.clientVY = 0;
        this.clientOnGround = true;
      } else {
        this.camera.position.y = newY;
        this.clientOnGround = false;
      }
      if (this.keys['Space'] && this.clientOnGround) {
        this.clientVY = JUMP_FORCE_C;
        this.clientOnGround = false;
      }

      // Walk bob (only on ground while moving)
      if (len > 0 && this.clientOnGround) {
        const bob = Math.sin(now * 0.008) * 0.025;
        this.camera.position.y += bob;
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
