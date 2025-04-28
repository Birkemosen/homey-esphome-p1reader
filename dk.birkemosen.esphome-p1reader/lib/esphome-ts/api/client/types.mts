import Homey from 'homey';
import type { void$ } from '../../protobuf/api_options_pb.mts';
import type {
  ConnectRequest,
  ConnectResponse,
  DeviceInfoResponse,
  HelloRequest,
  HelloResponse,
  PingResponse,
} from '../../protobuf/api_pb.mts';

export interface IClient {
  terminate(): void;
  hello(request: HelloRequest): Promise<HelloResponse>;
  connect(request: ConnectRequest): Promise<ConnectResponse>;
  ping(): Promise<PingResponse>;
  deviceInfo(): Promise<DeviceInfoResponse>;
  subscribeStateChange(): Promise<void$>;
  listEntities(): Promise<void$>;
  setDebug(enabled: boolean): void;
  getApiVersion(): string | null;
  getAddress(): string;
  getExpectedName(): string | null;
  setExpectedName(value: string | null): void;
}

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

export interface CommandParams {
  key: number;
  [key: string]: any;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ClientOptions extends ConnectionParams {
  logger: typeof Homey;
} 