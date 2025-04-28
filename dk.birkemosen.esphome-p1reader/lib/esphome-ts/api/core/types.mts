export interface Message {
  type: number;
  payload: Uint8Array;
}

export interface PendingMessage extends Message {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  retries: number;
  timeout: NodeJS.Timeout;
  responseTypes: number[];
}

export interface FrameHelper {
  on(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
  removeAllListeners(): void;
  handleError(error: Error): void;
  sendMessage(message: Message): Promise<void>;
}

export interface ConnectionParams {
  addresses: string[];
  port: string;
  password: string | null;
  clientInfo: string;
  keepalive: number;
  noisePsk: string | null;
  expectedName: string | null;
  expectedMac: string | null;
}

export enum ConnectionState {
  INITIALIZED = 'initialized',
  SOCKET_OPENED = 'socket_opened',
  HANDSHAKE_COMPLETE = 'handshake_complete',
  CONNECTED = 'connected',
  CLOSED = 'closed',
  ERROR = 'error',
}

export enum FrameHelperState {
  INITIALIZED = 'initialized',
  CONNECTING = 'connecting',
  READY = 'ready',
  ERROR = 'error',
  CLOSED = 'closed',
}

export enum ReconnectLogicState {
  CONNECTING = 'connecting',
  HANDSHAKING = 'handshaking',
  READY = 'ready',
  DISCONNECTED = 'disconnected'
}

export interface ESPHomeDevice {
  status: 'ONLINE' | 'OFFLINE';
  name: string;
  address: string;
  mac: string;
  version: string;
  platform: string;
  board: string;
} 