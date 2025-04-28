import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import { MessageTypes } from '../core/protocol.mts';
import type { void$ } from '../../protobuf/api_options_pb.mts';
import { voidSchema } from '../../protobuf/api_options_pb.mts';
import type {
  ClimateCommandRequest,
  CoverCommandRequest,
  FanCommandRequest,
  LightCommandRequest,
  NumberCommandRequest,
  SelectCommandRequest,
  SwitchCommandRequest,
  TextCommandRequest,
  ConnectResponse,
} from '../../protobuf/api_pb.mts';
import {
  ClimateCommandRequestSchema,
  CoverCommandRequestSchema,
  FanCommandRequestSchema,
  LightCommandRequestSchema,
  NumberCommandRequestSchema,
  SelectCommandRequestSchema,
  SwitchCommandRequestSchema,
  TextCommandRequestSchema,
  ConnectResponseSchema,
} from '../../protobuf/api_pb.mts';
import { Connection } from '../connection/connection.mts';
import type { ConnectionParams } from '../connection/connection.mts';
import { BaseClient } from './base.mts';
import type { ConnectionState } from './types.mts';
import { ConsoleLogger } from '../core/logger.mts';
import type { Logger } from '../core/logger.mts';

export class Client extends BaseClient {
  private connectionState: ConnectionState = 'disconnected';
  private debugEnabled: boolean = false;

  protected override debug(...args: any[]) {
    if (this.debugEnabled) {
      console.log('[esphome-p1reader:client]', ...args);
    }
  }

  constructor(
    params: ConnectionParams,
    logger: Logger = new ConsoleLogger('esphome-p1reader:client')
  ) {
    super(params, logger);
    this.debugEnabled = process.env['NODE_ENV'] === 'development' || process.env['DEBUG'] === 'true';
    this.debug('Client initialized');
  }

  public enableLogging(
    module: 'client' | 'connection' | 'message' | 'frame' | 'keepalive' | 'reconnect' | 'all' = 'all'
  ): void {
    switch (module) {
      case 'client':
        this.debugEnabled = true;
        break;
      case 'connection':
        this.connection?.setDebug(true);
        break;
      case 'message':
        this.connection?.setMessageDebug(true);
        break;
      case 'frame':
        this.connection?.setFrameDebug(true);
        break;
      case 'keepalive':
        this.connection?.setKeepAliveDebug(true);
        break;
      case 'reconnect':
        this.connection?.setReconnectDebug(true);
        break;
      case 'all':
        this.debugEnabled = true;
        this.connection?.setDebug(true);
        this.connection?.setMessageDebug(true);
        this.connection?.setFrameDebug(true);
        this.connection?.setKeepAliveDebug(true);
        this.connection?.setReconnectDebug(true);
        break;
    }
  }

  public disableLogging(
    module: 'client' | 'connection' | 'message' | 'frame' | 'keepalive' | 'reconnect' | 'all' = 'all'
  ): void {
    switch (module) {
      case 'client':
        this.debugEnabled = false;
        break;
      case 'connection':
        this.connection?.setDebug(false);
        break;
      case 'message':
        this.connection?.setMessageDebug(false);
        break;
      case 'frame':
        this.connection?.setFrameDebug(false);
        break;
      case 'keepalive':
        this.connection?.setKeepAliveDebug(false);
        break;
      case 'reconnect':
        this.connection?.setReconnectDebug(false);
        break;
      case 'all':
        this.debugEnabled = false;
        this.connection?.setDebug(false);
        this.connection?.setMessageDebug(false);
        this.connection?.setFrameDebug(false);
        this.connection?.setKeepAliveDebug(false);
        this.connection?.setReconnectDebug(false);
        break;
    }
  }

  public override async connect(): Promise<ConnectResponse> {
    this.debug('Connecting...');
    if (this.connectionState === 'connected') {
      this.debug('Already connected');
      return fromBinary(ConnectResponseSchema, new Uint8Array());
    }
    if (this.connectionState === 'connecting') {
      this.debug('Already connecting');
      return fromBinary(ConnectResponseSchema, new Uint8Array());
    }

    this.connectionState = 'connecting';
    try {
      if (!this.connection) {
        this.debug('Creating new connection');
        this.connection = new Connection(this.params, this.logger);
        this.connection.setDebug(true); // Enable debug for connection
        
        // Forward connection events
        this.connection.on('connect', () => {
          this.debug('Connection established, forwarding connect event');
          this.emit('connect');
        });
        
        this.connection.on('error', (error) => {
          this.debug('Connection error, forwarding error event:', error);
          this.emit('error', error);
        });
      }

      await this.connection.startConnection();
      await this.connection.finishConnection();
      this.connectionState = 'connected';
      this.debug('Connected successfully');
      return fromBinary(ConnectResponseSchema, new Uint8Array());
    } catch (error) {
      this.connectionState = 'error';
      this.debug('Connection failed:', error);
      throw error;
    }
  }

  public async switchCommand(request: SwitchCommandRequest): Promise<void$> {
    this.debug('Sending switch command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(SwitchCommandRequestSchema, create(SwitchCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.SwitchCommandRequest,
      payload: data
    });
    this.debug('Switch command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async lightCommand(request: LightCommandRequest): Promise<void$> {
    this.debug('Sending light command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(LightCommandRequestSchema, create(LightCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.LightCommandRequest,
      payload: data
    });
    this.debug('Light command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async climateCommand(request: ClimateCommandRequest): Promise<void$> {
    this.debug('Sending climate command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(ClimateCommandRequestSchema, create(ClimateCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.ClimateCommandRequest,
      payload: data
    });
    this.debug('Climate command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async coverCommand(request: CoverCommandRequest): Promise<void$> {
    this.debug('Sending cover command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(CoverCommandRequestSchema, create(CoverCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.CoverCommandRequest,
      payload: data
    });
    this.debug('Cover command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async fanCommand(request: FanCommandRequest): Promise<void$> {
    this.debug('Sending fan command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(FanCommandRequestSchema, create(FanCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.FanCommandRequest,
      payload: data
    });
    this.debug('Fan command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async numberCommand(request: NumberCommandRequest): Promise<void$> {
    this.debug('Sending number command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(NumberCommandRequestSchema, create(NumberCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.NumberCommandRequest,
      payload: data
    });
    this.debug('Number command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async selectCommand(request: SelectCommandRequest): Promise<void$> {
    this.debug('Sending select command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(SelectCommandRequestSchema, create(SelectCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.SelectCommandRequest,
      payload: data
    });
    this.debug('Select command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async textCommand(request: TextCommandRequest): Promise<void$> {
    this.debug('Sending text command');
    if (this.connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    const data = toBinary(TextCommandRequestSchema, create(TextCommandRequestSchema, request));
    await this.connection!.sendMessage({
      type: MessageTypes.TextCommandRequest,
      payload: data
    });
    this.debug('Text command sent');
    return fromBinary(voidSchema, new Uint8Array());
  }

  public override terminate(): void {
    this.debug('Terminating client');
    super.terminate();
    this.connectionState = 'disconnected';
  }
} 