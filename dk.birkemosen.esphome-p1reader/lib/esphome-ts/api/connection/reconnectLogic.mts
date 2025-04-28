import { EventEmitter } from 'events';
import type { Connection } from './connection.mts';
import { 
  APIConnectionError, 
  InvalidAuthAPIError, 
  InvalidEncryptionKeyAPIError, 
  RequiresEncryptionAPIError, 
  UnhandledAPIConnectionError 
} from '../core/errors.mts';


// Constants
const EXPECTED_DISCONNECT_COOLDOWN = 5.0;
const MAXIMUM_BACKOFF_TRIES = 100;

export enum ReconnectLogicState {
  CONNECTING = 'connecting',
  HANDSHAKING = 'handshaking',
  READY = 'ready',
  DISCONNECTED = 'disconnected'
}

const NOT_YET_CONNECTED_STATES = new Set([
  ReconnectLogicState.DISCONNECTED,
  ReconnectLogicState.CONNECTING
]);

const AUTH_EXCEPTIONS = [
  RequiresEncryptionAPIError,
  InvalidEncryptionKeyAPIError,
  InvalidAuthAPIError
];

export interface ReconnectLogicOptions {
  client: Connection;
  onConnect: () => Promise<void>;
  onDisconnect: (expected: boolean) => Promise<void>;
  name?: string;
  onConnectError?: (error: Error) => Promise<void>;
}

export class ReconnectLogic extends EventEmitter {
  private client: Connection;
  private onConnect: () => Promise<void>;
  private onDisconnect: (expected: boolean) => Promise<void>;
  private onConnectError?: (error: Error) => Promise<void>;
  private connectionState: ReconnectLogicState = ReconnectLogicState.DISCONNECTED;
  private isStopped: boolean = true;
  private tries: number = 0;
  private connectTask: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;

  constructor(options: ReconnectLogicOptions) {
    super();
    this.client = options.client;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.onConnectError = options.onConnectError;

    this.client.on('disconnect', (expected: boolean) => this.onDisconnectHandler(expected));
  }

  private async onDisconnectHandler(expectedDisconnect: boolean): Promise<void> {
    const disconnectType = expectedDisconnect ? 'expected' : 'unexpected';
    const wait = expectedDisconnect ? EXPECTED_DISCONNECT_COOLDOWN : 0;

    console.log(`Processing ${disconnectType} disconnect from ESPHome API for ${this.client.getAddress()}`);

    this.setConnectionState(ReconnectLogicState.DISCONNECTED);
    await this.onDisconnect(expectedDisconnect);

    if (!this.isStopped) {
      this.scheduleConnect(wait);
    }
  }

  private setConnectionState(state: ReconnectLogicState): void {
    this.connectionState = state;
  }

  private logConnectionError(error: Error): void {
    const isHandledException = !(error instanceof UnhandledAPIConnectionError) && 
                             error instanceof APIConnectionError;
    
    const level = !isHandledException ? 'error' : 
                 this.tries === 0 ? 'warn' : 'debug';

    console[level](`Can't connect to ESPHome API for ${this.client.getAddress()}: ${error.message} (${error.constructor.name})`);
  }

  private async tryConnect(): Promise<boolean> {
    this.setConnectionState(ReconnectLogicState.CONNECTING);
    const startConnectTime = Date.now();

    try {
      await this.client.startConnection();
      await this.client.finishConnection();
    } catch (error) {
      await this.handleConnectionFailure(error as Error);
      return false;
    }

    const connectTime = (Date.now() - startConnectTime) / 1000;
    console.log(`Successfully connected to ${this.client.getAddress()} in ${connectTime.toFixed(3)}s`);

    this.tries = 0;
    this.setConnectionState(ReconnectLogicState.READY);
    await this.onConnect();
    return true;
  }

  private async handleConnectionFailure(error: Error): Promise<void> {
    this.setConnectionState(ReconnectLogicState.DISCONNECTED);

    if (this.onConnectError) {
      await this.onConnectError(error);
    }

    this.logConnectionError(error);

    if (AUTH_EXCEPTIONS.some(exception => error instanceof exception)) {
      this.tries = MAXIMUM_BACKOFF_TRIES;
    } else {
      this.tries++;
    }
  }

  private scheduleConnect(delay: number): void {
    if (!delay) {
      this.callConnectOnce();
      return;
    }

    console.debug(`Scheduling new connect attempt in ${delay.toFixed(2)} seconds`);
    this.cancelConnectTimer();
    this.connectTimer = setTimeout(() => this.callConnectOnce(), delay * 1000);
  }

  private callConnectOnce(): void {
    if (this.connectTask && this.connectionState !== ReconnectLogicState.CONNECTING) {
      console.debug(`${this.client.getAddress()}: Not cancelling existing connect task as it's already ${this.connectionState}!`);
      return;
    }

    if (this.connectTask) {
      console.debug(`${this.client.getAddress()}: Cancelling existing connect task with state ${this.connectionState}, to try again now!`);
      this.cancelConnect('Scheduling new connect attempt');
      this.setConnectionState(ReconnectLogicState.DISCONNECTED);
    }

    this.connectTask = setTimeout(async () => {
      await this.connectOnceOrReschedule();
    }, 0);
  }

  private cancelConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private cancelConnectTask(msg: string): void {
    if (this.connectTask) {
      console.debug(`${this.client.getAddress()}: ${msg}`);
      clearTimeout(this.connectTask);
      this.connectTask = null;
    }
  }

  private cancelConnect(msg: string): void {
    console.debug(`${this.client.getAddress()}: ${msg}`);
    this.cancelConnectTimer();
    this.cancelConnectTask(msg);
  }

  private async connectOnceOrReschedule(): Promise<void> {
    console.debug(`Trying to connect to ${this.client.getAddress()}`);

    if (this.connectionState !== ReconnectLogicState.DISCONNECTED || this.isStopped) {
      return;
    }

    if (await this.tryConnect()) {
      return;
    }

    const tries = Math.min(this.tries, 10); // prevent overflow
    const waitTime = Math.min(Math.pow(1.8, tries), 60.0);

    if (tries === 1) {
      console.log(`Trying to connect to ${this.client.getAddress()} in the background`);
    }

    console.debug(`Retrying ${this.client.getAddress()} in ${waitTime.toFixed(2)} seconds`);
    this.scheduleConnect(waitTime);
  }

  public async start(): Promise<void> {
    this.isStopped = false;
    if (this.connectionState !== ReconnectLogicState.DISCONNECTED) {
      return;
    }
    this.tries = 0;
    this.scheduleConnect(0);
  }

  public async stop(): Promise<void> {
    if (NOT_YET_CONNECTED_STATES.has(this.connectionState)) {
      this.cancelConnect('Stopping');
    }

    this.isStopped = true;
    this.cancelConnect('Stopping');
    this.setConnectionState(ReconnectLogicState.DISCONNECTED);
  }
} 