import { EventEmitter } from 'events';
import net from 'net';
import { create, toBinary } from '@bufbuild/protobuf';
import { 
  APIConnectionError,  
  HandshakeAPIError, 
} from '../core/errors.mts';
import { MessageTypes } from '../core/protocol.mts';
import {
  ConnectRequestSchema,
  HelloRequestSchema
} from '../../protobuf/api_pb.mts';
import { NoiseFrameHelper } from './frame/noise.mts';
import { PlaintextFrameHelper } from './frame/plaintext.mts';
import type { FrameHelper } from './frame/types.mts';
import { frameDebug } from './frame/debug.mts';
import { MessageHandler } from './message.mts';
import { KeepAliveHandler } from './keepalive.mts';
import { ReconnectHandler } from './reconnect.mts';
import { HANDSHAKE_TIMEOUT, TCP_CONNECT_TIMEOUT } from './constants.mts';
import type { Logger } from '../core/logger.mts';

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

export interface ConnectionOptions {
  params: ConnectionParams;
  logger: Logger;
  logName?: string;
} 

export enum ConnectionState {
  INITIALIZED = 'initialized',
  SOCKET_OPENED = 'socket_opened',
  HANDSHAKE_COMPLETE = 'handshake_complete',
  CONNECTED = 'connected',
  CLOSED = 'closed',
  ERROR = 'error',
}

export class Connection extends EventEmitter {
  private socket: net.Socket | null = null;
  private frameHelper: FrameHelper | null = null;
  private isConnected: boolean = false;
  private handshakeComplete: boolean = false;
  private debugEnabled: boolean = false;
  private logName: string;
  private messageHandler: MessageHandler;
  private keepAliveHandler: KeepAliveHandler;
  private reconnectHandler: ReconnectHandler;
  private fatalException: Error | null = null;
  private expectedDisconnect: boolean = false;
  private connectionState: ConnectionState = ConnectionState.INITIALIZED;
  private logger: Logger;

  private debug(...args: any[]) {
    if (this.debugEnabled) {
      this.logger.debug(...args);
    }
  }

  constructor(
    public readonly params: ConnectionParams,
    logger: Logger,
    logName?: string
  ) {
    super();
    this.logger = logger;
    this.logName = logName || params.addresses[0] || 'unknown';
    
    // Initialize frame debug with logger
    frameDebug.setLogger(this.logger);
    
    this.messageHandler = new MessageHandler(this.logName, null, this.debugEnabled, this.logger);
    this.keepAliveHandler = new KeepAliveHandler(this.messageHandler, this.logName, params.keepalive, this.debugEnabled, this.logger);
    this.reconnectHandler = new ReconnectHandler(this.logName, this.debugEnabled);
  }

  public getAddress(): string {
    return this.params.addresses[0] || 'unknown';
  }

  public setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.messageHandler.setDebug(enabled);
    this.keepAliveHandler = new KeepAliveHandler(this.messageHandler, this.logName, this.params.keepalive, enabled, this.logger);
    this.reconnectHandler = new ReconnectHandler(this.logName, enabled);
    
    if (enabled) {
      frameDebug.enable();
    } else {
      frameDebug.disable();
    }
  }

  public setMessageDebug(enabled: boolean): void {
    this.messageHandler.setDebug(enabled);
  }

  public setFrameDebug(enabled: boolean): void {
    if (enabled) {
      frameDebug.enable();
    } else {
      frameDebug.disable();
    }
  }

  public setKeepAliveDebug(enabled: boolean): void {
    this.keepAliveHandler = new KeepAliveHandler(this.messageHandler, this.logName, this.params.keepalive, enabled, this.logger);
  }

  public setReconnectDebug(enabled: boolean): void {
    this.reconnectHandler = new ReconnectHandler(this.logName, enabled);
  }

  public setLogName(name: string): void {
    this.logName = name;
    if (this.frameHelper) {
      // TODO: Implement log name setting in frame helper
    }
  }

  private setConnectionState(state: ConnectionState): void {
    const previousState = this.connectionState;
    this.connectionState = state;
    this.isConnected = state === ConnectionState.CONNECTED;
    this.handshakeComplete = state === ConnectionState.HANDSHAKE_COMPLETE || state === ConnectionState.CONNECTED;
    
    this.debug(`${this.logName}: Connection state changed from ${previousState} to ${state}, isConnected: ${this.isConnected}, handshakeComplete: ${this.handshakeComplete}`);

    // Handle state-specific actions
    switch (state) {
      case ConnectionState.CONNECTED:
        // Update message handler with frame helper before starting keepalive
        this.messageHandler.setFrameHelper(this.frameHelper);
        this.keepAliveHandler = new KeepAliveHandler(this.messageHandler, this.logName, this.params.keepalive, this.debugEnabled, this.logger);
        this.keepAliveHandler.start();
        // Emit connect event when fully connected
        this.emit('connect');
        break;
      case ConnectionState.CLOSED:
      case ConnectionState.ERROR:
        this.keepAliveHandler.stop();
        this.cleanup();
        break;
    }
  }

  private cleanup(): void {
    if (this.connectionState !== ConnectionState.CLOSED) {
      this.setConnectionState(ConnectionState.CLOSED);

      this.debug(`${this.logName}: Cleaning up connection`);

      this.reconnectHandler.cleanup();
      this.cleanupFrameHelper();

      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }

      if (this.connectionState === ConnectionState.CONNECTED && this.expectedDisconnect) {
        this.emit('disconnect');
      }
    }
  }

  private cleanupFrameHelper(): void {
    if (this.frameHelper) {
      this.frameHelper.removeAllListeners();
      this.frameHelper.handleError(new Error('Connection closed'));
      this.frameHelper = null;
    }
  }

  public async startConnection(): Promise<void> {
    if (this.connectionState !== ConnectionState.INITIALIZED) {
      throw new Error('Connection can only be used once, connection is not in init state');
    }

    try {
      await this.connectSocket();
      this.setConnectionState(ConnectionState.SOCKET_OPENED);
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private async connectSocket(): Promise<void> {
    if (this.debugEnabled) {
      this.debug(`${this.logName}: Connecting to ${this.params.addresses[0]}:${this.params.port}`);
    }

    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let connectTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        socket.removeAllListeners();
      };

      socket.on('connect', () => {
        if (this.debugEnabled) {
          this.debug(`${this.logName}: Socket connected`);
        }
        this.socket = socket;
        cleanup();
        resolve();
      });

      socket.on('error', (error) => {
        cleanup();
        reject(error);
      });

      connectTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, TCP_CONNECT_TIMEOUT * 1000);

      socket.connect(Number(this.params.port), this.params.addresses[0] || '');
    });
  }

  public async finishConnection(): Promise<void> {
    if (this.connectionState !== ConnectionState.SOCKET_OPENED) {
      this.debug(`${this.logName}: Cannot finish connection, current state: ${this.connectionState}`);
      throw new Error('Connection must be in SOCKET_OPENED state to finish connection');
    }

    try {
      // Step 1: Initialize frame helper and wait for handshake
      this.debug(`${this.logName}: Step 1 - Initializing frame helper...`);
      await this.initFrameHelper();
      this.setConnectionState(ConnectionState.HANDSHAKE_COMPLETE);
      this.debug(`${this.logName}: Handshake completed, state: ${this.connectionState}`);

      // Register internal message handlers after handshake
      this.registerInternalMessageHandlers();

      // Step 2: Send HelloRequest and wait for HelloResponse
      this.debug(`${this.logName}: Step 2 - Sending HelloRequest...`);
      const helloRequest = create(HelloRequestSchema, {
        clientInfo: this.params.clientInfo
      });
      const helloData = toBinary(HelloRequestSchema, helloRequest);
      this.debug(`${this.logName}: HelloRequest entering sendMessageAwaitResponse:`, helloRequest);
      await this.messageHandler.sendMessageAwaitResponse(
        MessageTypes.HelloRequest,
        helloData,
        MessageTypes.HelloResponse
      );
      this.debug(`${this.logName}: HelloResponse received`);

      // Step 3 & 4: Always send ConnectRequest, with or without password
      this.debug(`${this.logName}: Step 3 - Sending ConnectRequest...`);
      const connectRequest = this.params.password 
        ? create(ConnectRequestSchema, { password: this.params.password })
        : create(ConnectRequestSchema, {});
      const connectData = toBinary(ConnectRequestSchema, connectRequest);
      await this.messageHandler.sendMessageAwaitResponse(
        MessageTypes.ConnectRequest,
        connectData,
        MessageTypes.ConnectResponse
      );
      this.debug(`${this.logName}: ConnectResponse received`);

      // Step 5: Connection established, start keepalive
      this.debug(`${this.logName}: Step 5 - Starting keepalive...`);
      this.keepAliveHandler.start();
      this.setConnectionState(ConnectionState.CONNECTED);
      this.debug(`${this.logName}: Connection fully established, state: ${this.connectionState}`);
    } catch (error) {
      this.debug(`${this.logName}: Connection failed at state ${this.connectionState}:`, error);
      this.reportFatalError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async initFrameHelper(): Promise<void> {
    if (!this.socket) {
      throw new APIConnectionError('Socket not initialized');
    }

    if (this.frameHelper) {
      throw new APIConnectionError('Frame helper already initialized');
    }

    try {
      // Enable frame debug before initializing the frame helper
      frameDebug.enable();

      this.frameHelper = this.params.noisePsk
        ? new NoiseFrameHelper(this.socket, this.params.noisePsk)
        : new PlaintextFrameHelper(this.socket);

      this.frameHelper.on('error', this.handleFrameError.bind(this));
      this.frameHelper.on('connect', this.handleFrameConnect.bind(this));
      this.frameHelper.on('message', (data: any) => {
        this.debug(`${this.logName}: Frame helper emitted message:`, data);
        this.messageHandler.handleMessage(data);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new HandshakeAPIError(`Handshake timed out after ${HANDSHAKE_TIMEOUT}s`));
        }, HANDSHAKE_TIMEOUT * 1000);

        this.frameHelper?.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.frameHelper?.once('error', (error: unknown) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });

      // Update message handler with frame helper
      this.messageHandler.setFrameHelper(this.frameHelper);
    } catch (error) {
      this.frameHelper = null;
      throw error;
    }
  }

  private handleFrameError(error: Error): void {
    if (this.debugEnabled) {
      this.debug(`${this.logName}: Frame helper error:`, error);
    }

    this.frameHelper = null;
    this.emit('error', error);

    // Attempt to recover if possible
    if (this.connectionState === ConnectionState.CONNECTED) {
      this.reconnectHandler.attemptReconnect(async () => {
        await this.startConnection();
        await this.finishConnection();
      }).catch(err => {
        this.logger.error(`${this.logName}: Failed to recover from frame helper error:`, err);
      });
    }
  }

  private handleFrameConnect(): void {
    if (this.debugEnabled) {
      this.debug(`${this.logName}: Frame helper connected`);
    }
    this.emit('connect');
  }

  private registerInternalMessageHandlers(): void {
    // Register internal message handlers for core protocol messages
    this.messageHandler.addMessageHandler(MessageTypes.DisconnectRequest, this.handleDisconnectRequestInternal.bind(this));
    this.messageHandler.addMessageHandler(MessageTypes.PingRequest, this.handlePingRequestInternal.bind(this));
    this.messageHandler.addMessageHandler(MessageTypes.GetTimeRequest, this.handleGetTimeRequestInternal.bind(this));
  }

  private handleDisconnectRequestInternal(): void {
    this.debug(`${this.logName}: Received disconnect request`);
    this.expectedDisconnect = true;
    this.messageHandler.sendMessageAwaitResponse(
      MessageTypes.DisconnectResponse,
      new Uint8Array(),
      MessageTypes.DisconnectResponse
    ).catch((error: Error) => {
      this.debug(`${this.logName}: Failed to send disconnect response:`, error);
    });
    this.cleanup();
  }

  private handlePingRequestInternal(): void {
    this.debug(`${this.logName}: Received ping request`);
    this.messageHandler.sendMessageAwaitResponse(
      MessageTypes.PingResponse,
      new Uint8Array(),
      MessageTypes.PingResponse
    ).catch((error: Error) => {
      this.debug(`${this.logName}: Failed to send ping response:`, error);
    });
  }

  private handleGetTimeRequestInternal(): void {
    this.debug(`${this.logName}: Received get time request`);
    const epochSeconds = Math.floor(Date.now() / 1000);
    const response = new Uint8Array(4);
    response[0] = (epochSeconds >> 24) & 0xFF;
    response[1] = (epochSeconds >> 16) & 0xFF;
    response[2] = (epochSeconds >> 8) & 0xFF;
    response[3] = epochSeconds & 0xFF;
    
    this.messageHandler.sendMessageAwaitResponse(
      MessageTypes.GetTimeResponse,
      response,
      MessageTypes.GetTimeResponse
    ).catch((error: Error) => {
      this.debug(`${this.logName}: Failed to send get time response:`, error);
    });
  }

  private reportFatalError(error: Error): void {
    if (!this.fatalException) {
      if (!this.expectedDisconnect) {
        this.debug(`${this.logName}: Fatal error occurred:`, error);
      }
      this.fatalException = error;
      this.cleanup();
      this.emit('error', error);
    }
  }

  public async disconnect(force: boolean = false): Promise<void> {
    if (force) {
      try {
        await this.messageHandler.sendMessageAwaitResponse(
          MessageTypes.DisconnectRequest,
          new Uint8Array(),
          MessageTypes.DisconnectResponse
        );
      } catch (err: unknown) {
        this.logger.error(`${this.logName}: Failed to send (forced) disconnect request:`, err);
      }
    }
  }

  public forceDisconnect(): void {
    this.expectedDisconnect = true;
    
    if (this.connectionState === ConnectionState.CONNECTED) {
      try {
        this.messageHandler.sendMessageAwaitResponse(
          MessageTypes.DisconnectRequest,
          new Uint8Array(),
          MessageTypes.DisconnectResponse
        );
      } catch (err: unknown) {
        this.logger.error(`${this.logName}: Failed to send (forced) disconnect request:`, err);
      }
    }

    this.cleanup();
  }

  public async sendMessageAwaitResponse<T>(
    type: number,
    data: Uint8Array,
    responseType: number
  ): Promise<T> {
    return this.messageHandler.sendMessageAwaitResponse(type, data, responseType);
  }

  public async sendMessage(message: { type: number; payload: Uint8Array }): Promise<void> {
    return this.messageHandler.sendMessageAwaitResponse(
      message.type,
      message.payload,
      MessageTypes.DisconnectResponse
    );
  }

  public async sendMessageNoResponse(message: { type: number; payload: Uint8Array }): Promise<void> {
    if (!this.frameHelper) {
      throw new Error('Frame helper not initialized');
    }
    await this.frameHelper.sendMessage(message);
  }

  public addMessageHandler(type: number, handler: (data: any) => void): void {
    this.messageHandler.addMessageHandler(type, handler);
  }

  public removeMessageHandler(type: number, handler: (data: any) => void): void {
    this.messageHandler.removeMessageHandler(type, handler);
  }
}