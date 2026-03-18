// Socket.io client wrapper
// When hosted on Railway, set SOCKET_URL to your Railway URL
// For local dev, falls back to current origin

class GameSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.handlers = {};
  }

  connect(serverUrl) {
    const url = serverUrl || window.location.origin;
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Socket] Connected:', this.socket.id);
      this._emit('connect');
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.log('[Socket] Disconnected:', reason);
      this._emit('disconnect', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      this._emit('connect_error', err);
    });

    // Forward all game events
    const events = [
      'joined', 'playerJoined', 'playerLeft', 'gameState',
      'playerKilled', 'hitConfirm', 'bulletImpact', 'damaged',
      'respawn', 'ammoUpdate', 'reloadStart', 'reloadEnd',
      'scoreUpdate', 'weaponSwitched'
    ];

    for (const event of events) {
      this.socket.on(event, (data) => this._emit(event, data));
    }
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  _emit(event, data) {
    if (this.handlers[event]) {
      for (const h of this.handlers[event]) h(data);
    }
  }

  join(name) {
    this.socket.emit('join', { name });
  }

  sendInput(input) {
    this.socket.emit('input', input);
  }

  sendShoot(data) {
    this.socket.emit('shoot', data);
  }

  sendReload() {
    this.socket.emit('reload');
  }

  switchWeapon(weapon) {
    this.socket.emit('switchWeapon', { weapon });
  }
}

window.GameSocket = GameSocket;
