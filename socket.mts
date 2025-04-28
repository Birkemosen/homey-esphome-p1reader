import { EventEmitter } from 'events';
import net from 'net';

// Enhanced debug function
const debug = (...args: any[]) => {
  console.log('[esphome-p1reader:socket]', ...args);
};

export class NativeSocket extends EventEmitter {
  private isConnected = false;

  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  private socket?: net.Socket;

  constructor(private readonly host: string, private readonly port: string) {
    super();
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public close(): void {
    debug('Closing socket');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    this.socket?.destroy();
    this.socket = undefined;
    this.isConnected = false;
  }

  public open(): void {
    debug('Opening socket connection to', { host: this.host, port: this.port });
    if (this.socket) {
      this.socket.destroy();
    }

    this.socket = new net.Socket();
    this.setupSocketEvents();
    this.socket.connect(Number(this.port), this.host);
  }

  public async send(data: string | Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.socket) {
        debug('Cannot send data - socket not connected');
        resolve();
        return;
      }

      try {
        debug('Sending data:', { length: data.length, type: typeof data });
        this.socket.write(data);
        resolve();
      } catch (err) {
        debug('Error sending data:', err);
        reject(err);
      }
    });
  }

  public reconnect(): void {
    debug('Reconnecting...');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.open();
    }, 5000);
  }

  private setupSocketEvents(): void {
    if (!this.socket) {return;}

    this.socket.on('error', (err) => {
      debug('Socket error:', err);
      this.emit('error', err);
    });

    this.socket.on('data', (data) => {
      debug('Received data:', { length: data.length });
      this.emit('data', data);
    });

    this.socket.on('connect', () => {
      debug('Socket connected');
      this.isConnected = true;
      this.emit('connected');
    });

    this.socket.on('close', (hadError) => {
      debug('Socket closed', { hadError });
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.socket.on('end', () => {
      debug('Socket ended');
      this.isConnected = false;
    });
  }
}

export default NativeSocket;
