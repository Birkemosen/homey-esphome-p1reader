import { EventEmitter } from 'events';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { MessageTypes } from '../core/protocol.mts';
import { SUBSCRIBE_STATES_RESPONSE_TYPES } from '../core/protocol.mts';
import type { void$ } from '../../protobuf/api_options_pb.mts';
import type {
  ConnectRequest,
  ConnectResponse,
  DeviceInfoResponse,
  HelloRequest,
  HelloResponse,
  PingResponse
} from '../../protobuf/api_pb.mts';
import { voidSchema } from '../../protobuf/api_options_pb.mts';
import {
  ConnectRequestSchema,
  DeviceInfoRequestSchema,
  HelloRequestSchema,
  ListEntitiesRequestSchema,
  PingRequestSchema,
} from '../../protobuf/api_pb.mts';
import { Connection } from '../connection/index.mts';
import type { ConnectionParams } from '../connection/index.mts';
import type { IClient } from './types.mts';
import type { Message } from '../connection/message.mts';
import type { Logger } from '../core/logger.mts';
import { ConsoleLogger } from '../core/logger.mts';

export abstract class BaseClient extends EventEmitter implements IClient {
  protected connection: Connection | null = null;
  protected cachedName: string | null = null;
  protected logName: string = '';
  protected logger: Logger;
  protected backgroundTasks: Set<Promise<any>> = new Set();

  constructor(
    protected readonly params: ConnectionParams,
    logger: Logger
  ) {
    super();
    this.logger = logger;
    this.setLogName();
    this.debug('BaseClient initialized with params:', {
      addresses: this.params.addresses,
      port: this.params.port,
      clientInfo: this.params.clientInfo,
      keepalive: this.params.keepalive,
      noisePsk: this.params.noisePsk ? '***' : null,
      expectedName: this.params.expectedName,
      expectedMac: this.params.expectedMac
    });
  }

  protected debug(...args: any[]) {
    this.logger.debug(...args);
  }

  public setDebug(enabled: boolean): void {
    if (this.logger instanceof ConsoleLogger) {
      this.logger.setEnabled(enabled);
    }
  }

  public getApiVersion(): string | null {
    if (!this.connection) {
      this.debug('getApiVersion: Not connected');
      return null;
    }
    // TODO: Implement API version tracking
    return null;
  }

  public getAddress(): string {
    return this.params.addresses[0] || '';
  }

  public getExpectedName(): string | null {
    return this.params.expectedName;
  }

  public setExpectedName(value: string | null): void {
    this.debug('Setting expected name:', value);
    this.params.expectedName = value;
  }

  protected setLogName(): void {
    this.logName = this.params.addresses[0] || 'unknown';
  }

  protected setNameFromDevice(name: string): void {
    this.debug('Setting name from device:', name);
    this.cachedName = name;
    this.setLogName();
  }

  protected setCachedNameIfUnset(name: string): void {
    if (!this.cachedName) {
      this.debug('Setting cached name:', name);
      this.setNameFromDevice(name);
    }
  }

  protected createBackgroundTask<T>(promise: Promise<T>): void {
    this.debug('Creating background task');
    this.backgroundTasks.add(promise);
    promise.finally(() => {
      this.debug('Background task completed');
      this.backgroundTasks.delete(promise);
    });
  }

  public terminate(): void {
    this.debug('Terminating client');
    if (this.connection) {
      this.connection.forceDisconnect();
      this.connection = null;
    }
    this.backgroundTasks.forEach(_ => {
      // Cancel or cleanup background tasks
    });
    this.backgroundTasks.clear();
  }

  public async hello(request: HelloRequest): Promise<HelloResponse> {
    this.debug('Sending hello request');
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const data = toBinary(HelloRequestSchema, create(HelloRequestSchema, request));
    const response = await this.connection.sendMessageAwaitResponse<HelloResponse>(
      MessageTypes.HelloRequest,
      data,
      MessageTypes.HelloResponse
    );
    this.debug('Received hello response');
    return response;
  }

  public async connect(request: ConnectRequest): Promise<ConnectResponse> {
    this.debug('Sending connect request');
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const data = toBinary(ConnectRequestSchema, create(ConnectRequestSchema, request));
    const response = await this.connection.sendMessageAwaitResponse<ConnectResponse>(
      MessageTypes.ConnectRequest,
      data,
      MessageTypes.ConnectResponse
    );
    this.debug('Received connect response');
    return response;
  }

  public async deviceInfo(): Promise<DeviceInfoResponse> {
    this.debug('Requesting device info');
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const data = toBinary(DeviceInfoRequestSchema, create(DeviceInfoRequestSchema, {}));
    const response = await this.connection.sendMessageAwaitResponse<DeviceInfoResponse>(
      MessageTypes.DeviceInfoRequest,
      data,
      MessageTypes.DeviceInfoResponse
    );
    this.debug('Received device info response');
    return response;
  }

  public async listEntities(): Promise<void$> {
    this.debug('Requesting entity list');
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const data = toBinary(ListEntitiesRequestSchema, create(ListEntitiesRequestSchema, {}));
    
    // Create a promise that resolves when we receive all entities
    return new Promise((resolve) => {
      // Add a handler for ListEntitiesSensorResponse messages
      const handler = (message: any) => {
        if (message.type === MessageTypes.ListEntitiesSensorResponse) {
          this.debug('Received entity:', message.payload);
          // Emit the message so the P1Reader can handle it
          this.emit('message', message);
        } else if (message.type === MessageTypes.ListEntitiesDoneResponse) {
          // When we receive the done response, remove the handler and resolve
          if (this.connection) {
            this.connection.removeMessageHandler(MessageTypes.ListEntitiesSensorResponse, handler);
            this.connection.removeMessageHandler(MessageTypes.ListEntitiesDoneResponse, doneHandler);
          }
          resolve(fromBinary(voidSchema, new Uint8Array()));
        }
      };

      // Add a handler for the done response
      const doneHandler = (message: any) => {
        if (message.type === MessageTypes.ListEntitiesDoneResponse) {
          if (this.connection) {
            this.connection.removeMessageHandler(MessageTypes.ListEntitiesSensorResponse, handler);
            this.connection.removeMessageHandler(MessageTypes.ListEntitiesDoneResponse, doneHandler);
          }
          resolve(fromBinary(voidSchema, new Uint8Array()));
        }
      };

      // Add the handlers
      if (this.connection) {
        this.connection.addMessageHandler(MessageTypes.ListEntitiesSensorResponse, handler);
        this.connection.addMessageHandler(MessageTypes.ListEntitiesDoneResponse, doneHandler);

        // Send the request
        this.connection.sendMessageNoResponse({
          type: MessageTypes.ListEntitiesRequest,
          payload: data
        });
      } else {
        resolve(fromBinary(voidSchema, new Uint8Array()));
      }
    });
  }

  public async subscribeStateChange(): Promise<void$> {
    this.debug('Subscribing to state changes');
    
    // Send subscription request without expecting a response
    await this.sendMessageNoResponse({
      type: MessageTypes.SubscribeStatesRequest,
      payload: new Uint8Array()
    });

    // Add message handlers for all state response types
    for (const type of SUBSCRIBE_STATES_RESPONSE_TYPES) {
      this.addMessageHandler(type, (message) => {
        this.debug('Received state update:', type, message);
        this.emit('state', { type, message });
      });
    }

    // Return void as required by the interface
    return {} as void$;
  }

  public async ping(): Promise<PingResponse> {
    this.debug('Sending ping');
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const data = toBinary(PingRequestSchema, create(PingRequestSchema, {}));
    const response = await this.connection.sendMessageAwaitResponse<PingResponse>(
      MessageTypes.PingRequest,
      data,
      MessageTypes.PingResponse
    );
    this.debug('Received pong');
    return response;
  }

  protected async sendMessageNoResponse(message: Message): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.connection.sendMessageNoResponse(message);
  }

  protected addMessageHandler(type: number, handler: (message: Message) => void): void {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    this.connection.addMessageHandler(type, handler);
  }

  public removeMessageHandler(type: number, handler: (data: any) => void): void {
    this.debug('Removing message handler for type:', type);
    if (this.connection) {
      this.connection.removeMessageHandler(type, handler);
    }
  }
} 