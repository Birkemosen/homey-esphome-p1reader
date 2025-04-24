import { EventEmitter } from 'events';

export interface SocketConfiguration {
  reconnectOnTimeout?: boolean;
  timeout?: number;
  disconnectOnTimeout?: boolean;
}

const defaultConfig: SocketConfiguration = {
  reconnectOnTimeout: false,
  disconnectOnTimeout: true,
};

export class NativeSocket extends EventEmitter {
  private socket?: WebSocket;
  private readonly config: SocketConfiguration;
  private isConnected: boolean = false;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(private readonly host: string, private readonly port: number, config?: SocketConfiguration) {
    super();
    this.config = { ...defaultConfig, ...config };
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public open(): void {
    if (this.socket) {
      this.socket.close();
    }

    this.socket = new WebSocket(`ws://${this.host}:${this.port}`);
    this.setupSocketEvents();
  }

  public close(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    this.socket?.close();
    this.socket = undefined;
    this.isConnected = false;
  }

  public send(data: string | Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.socket) {
        resolve();
        return;
      }

      try {
        this.socket.send(data);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private setupSocketEvents(): void {
    if (!this.socket) return;

    this.socket.onerror = (err) => {
      this.emit('error', err);
    };

    this.socket.onmessage = (event) => {
      this.emit('data', event.data);
    };

    this.socket.onopen = () => {
      this.isConnected = true;
      this.emit('connected');
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      this.emit('disconnected');
    };
  }

  private reconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.open();
    }, 5000);
  }
}

export default NativeSocket;
