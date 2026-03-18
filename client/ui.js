// UI Manager - handles all HUD elements

class UIManager {
  constructor() {
    this.elements = {};
    this.killFeed = [];
    this.scoreboardVisible = false;
    this.scoreboardData = { players: [], scores: { ct: 0, terrorist: 0 } };
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.localPlayerId = null;
    this.localTeam = null;
    this.reloadTimer = null;
  }

  init() {
    this._buildHUD();
    this._buildScoreboard();
    this._buildMinimap();
    this._buildKillFeed();
    this._buildDeathScreen();
    this._buildCrosshair();
  }

  _buildHUD() {
    // Health bar
    const healthBar = document.getElementById('healthBar');
    const ammoDisplay = document.getElementById('ammoDisplay');
    const weaponDisplay = document.getElementById('weaponDisplay');
    const teamDisplay = document.getElementById('teamDisplay');
    const reloadIndicator = document.getElementById('reloadIndicator');

    this.elements = {
      healthBar,
      healthFill: document.getElementById('healthFill'),
      healthText: document.getElementById('healthText'),
      ammoDisplay,
      ammoCount: document.getElementById('ammoCount'),
      ammoReserve: document.getElementById('ammoReserve'),
      weaponDisplay,
      weaponName: document.getElementById('weaponName'),
      teamDisplay,
      teamName: document.getElementById('teamName'),
      reloadIndicator,
      killScore: document.getElementById('killScore'),
    };
  }

  _buildScoreboard() {
    this.elements.scoreboard = document.getElementById('scoreboard');
    this.elements.scoreboardBody = document.getElementById('scoreboardBody');
    this.elements.ctScore = document.getElementById('ctScore');
    this.elements.tScore = document.getElementById('tScore');
  }

  _buildMinimap() {
    this.minimapCanvas = document.getElementById('minimapCanvas');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
  }

  _buildKillFeed() {
    this.elements.killFeed = document.getElementById('killFeed');
  }

  _buildDeathScreen() {
    this.elements.deathScreen = document.getElementById('deathScreen');
    this.elements.respawnTimer = document.getElementById('respawnTimer');
  }

  _buildCrosshair() {
    this.elements.crosshair = document.getElementById('crosshair');
  }

  // ---- Update methods ----

  updateHealth(health) {
    const h = Math.max(0, Math.min(100, Math.round(health)));
    if (this.elements.healthFill) {
      this.elements.healthFill.style.width = h + '%';
      this.elements.healthFill.style.backgroundColor =
        h > 60 ? '#2ecc71' : h > 30 ? '#f39c12' : '#e74c3c';
    }
    if (this.elements.healthText) this.elements.healthText.textContent = h;
  }

  updateAmmo(ammo, maxAmmo) {
    if (this.elements.ammoCount) this.elements.ammoCount.textContent = ammo;
    if (this.elements.ammoReserve) this.elements.ammoReserve.textContent = maxAmmo;
  }

  updateWeapon(weapon) {
    if (this.elements.weaponName) {
      this.elements.weaponName.textContent = weapon === 'rifle' ? 'AK-47' : 'PISTOL';
    }
  }

  updateTeam(team) {
    this.localTeam = team;
    if (this.elements.teamName) {
      this.elements.teamName.textContent = team === 'ct' ? 'CT' : 'T';
      this.elements.teamName.style.color = team === 'ct' ? '#4fc3f7' : '#ff8a65';
    }
  }

  updateKillScore(kills) {
    if (this.elements.killScore) this.elements.killScore.textContent = `Kills: ${kills}`;
  }

  showReloading(duration) {
    if (this.elements.reloadIndicator) {
      this.elements.reloadIndicator.style.display = 'block';
      this.elements.reloadIndicator.textContent = 'RELOADING...';
    }
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      if (this.elements.reloadIndicator) this.elements.reloadIndicator.style.display = 'none';
    }, duration);
  }

  hideReloading() {
    if (this.elements.reloadIndicator) this.elements.reloadIndicator.style.display = 'none';
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  addKillFeedEntry(killerName, killerTeam, victimName, victimTeam, weapon) {
    const entry = {
      killerName,
      killerTeam,
      victimName,
      victimTeam,
      weapon,
      time: Date.now()
    };
    this.killFeed.unshift(entry);
    if (this.killFeed.length > 5) this.killFeed.pop();
    this._renderKillFeed();
  }

  _renderKillFeed() {
    if (!this.elements.killFeed) return;
    this.elements.killFeed.innerHTML = '';
    for (const entry of this.killFeed) {
      const div = document.createElement('div');
      div.className = 'kill-entry';
      const killerColor = entry.killerTeam === 'ct' ? '#4fc3f7' : '#ff8a65';
      const victimColor = entry.victimTeam === 'ct' ? '#4fc3f7' : '#ff8a65';
      const weaponIcon = entry.weapon === 'rifle' ? '🔫' : '🔫';
      div.innerHTML = `<span style="color:${killerColor}">${entry.killerName}</span> <span style="color:#aaa">killed</span> <span style="color:${victimColor}">${entry.victimName}</span>`;
      this.elements.killFeed.appendChild(div);
    }
  }

  showDeathScreen(respawnMs) {
    if (this.elements.deathScreen) {
      this.elements.deathScreen.style.display = 'flex';
      let remaining = Math.ceil(respawnMs / 1000);
      if (this.elements.respawnTimer) this.elements.respawnTimer.textContent = remaining;

      const countdown = setInterval(() => {
        remaining--;
        if (this.elements.respawnTimer) this.elements.respawnTimer.textContent = Math.max(0, remaining);
        if (remaining <= 0) clearInterval(countdown);
      }, 1000);
    }
  }

  hideDeathScreen() {
    if (this.elements.deathScreen) {
      this.elements.deathScreen.style.display = 'none';
    }
  }

  showHitMarker() {
    if (!this.elements.crosshair) return;
    this.elements.crosshair.classList.add('hit');
    setTimeout(() => this.elements.crosshair.classList.remove('hit'), 150);
  }

  updateScoreboard(players, scores) {
    this.scoreboardData = { players, scores };
    if (this.scoreboardVisible) this._renderScoreboard();
    if (this.elements.ctScore) this.elements.ctScore.textContent = scores.ct || 0;
    if (this.elements.tScore) this.elements.tScore.textContent = scores.terrorist || 0;
  }

  toggleScoreboard(show) {
    this.scoreboardVisible = show;
    if (this.elements.scoreboard) {
      this.elements.scoreboard.style.display = show ? 'flex' : 'none';
    }
    if (show) this._renderScoreboard();
  }

  _renderScoreboard() {
    if (!this.elements.scoreboardBody) return;
    const { players } = this.scoreboardData;
    const sorted = [...players].sort((a, b) => b.score - a.score);

    this.elements.scoreboardBody.innerHTML = '';
    for (const p of sorted) {
      const row = document.createElement('tr');
      const teamColor = p.team === 'ct' ? '#4fc3f7' : '#ff8a65';
      const isLocal = p.id === this.localPlayerId;
      row.style.backgroundColor = isLocal ? 'rgba(255,255,255,0.1)' : '';
      row.innerHTML = `
        <td style="color:${teamColor}">${p.team === 'ct' ? 'CT' : 'T'}</td>
        <td>${isLocal ? '▶ ' : ''}${escapeHtml(p.name)}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
        <td>${p.score}</td>
        <td style="color:${p.alive ? '#2ecc71' : '#e74c3c'}">${p.alive ? '●' : '○'}</td>
      `;
      this.elements.scoreboardBody.appendChild(row);
    }
  }

  updateMinimap(players, localId, mapSize) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const scale = W / (mapSize * 2);

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= W; i += W / 10) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    // Players
    for (const p of players) {
      const mx = (p.x + mapSize) * scale;
      const mz = (p.z + mapSize) * scale;
      const isLocal = p.id === localId;
      const color = p.team === 'ct' ? '#4fc3f7' : '#ff8a65';

      ctx.beginPath();
      ctx.arc(mx, mz, isLocal ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = p.alive ? color : 'rgba(100,100,100,0.5)';
      ctx.fill();

      if (isLocal) {
        // Direction indicator
        ctx.beginPath();
        ctx.moveTo(mx, mz);
        ctx.lineTo(mx + Math.sin(p.yaw) * 8, mz + Math.cos(p.yaw) * 8);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.UIManager = UIManager;
