// Socket.io client wrapper

class GameSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.handlers = {};
  }

  useSocket(existingSocket) {
    this.socket = existingSocket;
    this.connected = existingSocket.connected;
    this._bindEvents();
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
      this._emit('connect');
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this._emit('disconnect', reason);
    });
    this.socket.on('connect_error', (err) => {
      this._emit('connect_error', err);
    });
    this._bindEvents();
  }

  _bindEvents() {
    const events = [
      'joined', 'playerJoined', 'playerLeft', 'gameState',
      'playerKilled', 'hitConfirm', 'bulletImpact', 'damaged',
      'respawn', 'ammoUpdate', 'reloadStart', 'reloadEnd',
      'scoreUpdate', 'weaponSwitched', 'roomsList', 'joinError'
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

  // Lobby events
  listRooms() {
    this.socket.emit('listRooms');
  }

  createRoom(data) {
    this.socket.emit('createRoom', data);
  }

  joinRoom(data) {
    this.socket.emit('joinRoom', data);
  }

  // Game events
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
