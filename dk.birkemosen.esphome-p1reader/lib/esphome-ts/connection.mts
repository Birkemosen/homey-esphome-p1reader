import { EventEmitter } from 'events';
import { create } from '@bufbuild/protobuf';
import { 
  HelloRequestSchema,
  ConnectRequestSchema,
  DisconnectRequestSchema,
  DisconnectResponseSchema,
  PingRequestSchema,
  PingResponseSchema,
  GetTimeRequestSchema,
  GetTimeResponseSchema,
  DeviceInfoRequestSchema,
  ListEntitiesRequestSchema,
  SubscribeStatesRequestSchema,
  SubscribeLogsRequestSchema,
  CameraImageRequestSchema,
  SubscribeBluetoothLEAdvertisementsRequestSchema,
  UnsubscribeBluetoothLEAdvertisementsRequestSchema,
  BluetoothDeviceRequestSchema,
  BluetoothDeviceConnectionResponseSchema,
  BluetoothDevicePairingResponseSchema,
  BluetoothDeviceUnpairingResponseSchema,
  BluetoothGATTGetServicesRequestSchema,
  BluetoothGATTGetServicesDoneResponseSchema,
  BluetoothGATTReadRequestSchema,
  BluetoothGATTReadResponseSchema,
  BluetoothGATTWriteRequestSchema,
  BluetoothGATTWriteResponseSchema,
  BluetoothGATTNotifyRequestSchema,
  BluetoothGATTNotifyResponseSchema,
  BluetoothGATTReadDescriptorRequestSchema,
  BluetoothGATTWriteDescriptorRequestSchema,
  HelloResponseSchema,
  ConnectResponseSchema,
  DeviceInfoResponseSchema,
  ListEntitiesDoneResponseSchema
} from './protobuf/api_pb.mts';
import { NoiseFrameHelper } from './utils/noiseFrameHelper.mts';
import { PlaintextFrameHelper } from './utils/plaintextFrameHelper.mts';
import type { FrameHelper } from './utils/frameHelper.mts';
import { MESSAGE_TYPE_TO_PROTO, MessageTypes } from './utils/messages.mts';
import { Entities } from './entities/index.mts';
import { Button } from './entities/button.mts';
import { Climate } from './entities/climate.mts';
import { Cover } from './entities/cover.mts';
import { Fan } from './entities/fan.mts';
import { Light } from './entities/light.mts';
import { Lock } from './entities/lock.mts';
import { Number } from './entities/number.mts';
import { Select } from './entities/select.mts';
import { Switch } from './entities/switch.mts';
import { MediaPlayer } from './entities/mediaPlayer.mts';
import { Text } from './entities/text.mts';
import { mapMessageByType, isBase64 } from './utils/mapMessageByType.mts';

export interface ConnectionOptions {
  port?: number;
  host: string;
  clientInfo?: string;
  password?: string;
  encryptionKey?: string;
  expectedServerName?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  pingInterval?: number;
  pingAttempts?: number;
  maxListeners?: number;
}

interface ExtendedFrameHelper extends FrameHelper {
  connect(): void;
  end(): void;
  destroy(): void;
  sendMessage(message: any, schema: any): void;
}

export class Connection extends EventEmitter {
  private static readonly DEFAULT_MAX_LISTENERS = 50;
  private frameHelper: ExtendedFrameHelper | null = null;
  private _connected: boolean = false;
  private _authorized: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingCount: number = 0;
  private supportsRawBLEAdvertisements: boolean = false;
  private readonly MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB limit
  private readonly port: number;
  private readonly host: string;
  private readonly password: string;
  private readonly encryptionKey: string;
  private readonly reconnect: boolean;
  private readonly reconnectInterval: number;
  private readonly pingInterval: number;
  private readonly pingAttempts: number;

  constructor({
    port = 6053,
    host,
    password = '',
    encryptionKey = '',
    expectedServerName = '',
    reconnect = true,
    reconnectInterval = 30 * 1000,
    pingInterval = 15 * 1000,
    pingAttempts = 3,
    maxListeners = Connection.DEFAULT_MAX_LISTENERS
  }: ConnectionOptions) {
    super();
    this.setMaxListeners(maxListeners);
    if (!host) throw new Error('Host is required');

    // Only validate encryption key if it's provided
    if (encryptionKey) {
      if (!isBase64(encryptionKey) || Buffer.from(encryptionKey, 'base64').length !== 32) {
        throw new Error('Encryption key must be base64 and 32 bytes long');
      }
      this.frameHelper = new NoiseFrameHelper(host, port, encryptionKey, expectedServerName);
    } else {
      // Try plaintext first, will switch to noise if required
      this.frameHelper = new PlaintextFrameHelper(host, port);
    }

    this.port = port;
    this.host = host;
    this.password = password;
    this.encryptionKey = encryptionKey;
    this.reconnect = reconnect;
    this.reconnectInterval = reconnectInterval;
    this.pingInterval = pingInterval;
    this.pingAttempts = pingAttempts;
    this.pingCount = 0;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.frameHelper) return;

    // Message handling
    this.frameHelper.on('message', (message: any) => {
      try {
        // Check message size
        const messageSize = Buffer.byteLength(JSON.stringify(message));
        if (messageSize > this.MAX_MESSAGE_SIZE) {
          throw new Error('Message size exceeds maximum limit');
        }

        const type = message.constructor.type;
        const mapped = mapMessageByType(type, message.toObject());
        this.emit(`message.${type}`, mapped);
        this.emit('message', type, mapped);
      } catch (error) {
        this.handleError('Error processing message', error);
      }
    });

    // Connection state handling
    this.frameHelper.on('close', this.handleClose.bind(this));
    this.frameHelper.on('connect', this.handleConnect.bind(this));
    this.frameHelper.on('error', (error: Error) => this.handleError('Frame helper error', error));
    this.frameHelper.on('data', (data: any) => this.emit('data', data));

    // Message response handlers
    this.setupMessageResponseHandlers();
  }

  private handleClose(): void {
    this.connected = false;
    this.authorized = false;
    this.clearPingTimer();

    if (this.reconnect) {
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectInterval);
      this.emit('reconnect');
    }
  }

  private async handleConnect(): Promise<void> {
    this.clearReconnectTimer();
    this.connected = true;

    try {
      const { invalidPassword } = await this.connectService(this.password);
      if (invalidPassword) {
        throw new Error('Invalid password');
      }
      this.authorized = true;
      this.setupPingTimer();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Bad format: Encryption expected') && !this.encryptionKey) {
        this.emit('encryption_required');
        return;
      }
      this.handleError('Connection error', error);
      this.frameHelper?.end();
    }
  }

  private setupMessageResponseHandlers(): void {
    // Disconnect handlers
    this.on('message.DisconnectRequest', () => this.handleDisconnectRequest());
    this.on('message.DisconnectResponse', () => this.frameHelper?.destroy());

    // Ping handler
    this.on('message.PingRequest', () => this.handlePingRequest());

    // Time handler
    this.on('message.GetTimeRequest', () => this.handleGetTimeRequest());

    // Bluetooth advertisement handler
    this.on('message.BluetoothLERawAdvertisementsResponse', (msg: any) => {
      for (const advertisement of msg.advertisementsList) {
        this.emit('message.BluetoothLEAdvertisementResponse', advertisement);
      }
    });
  }

  private handleDisconnectRequest(): void {
    try {
      this.sendMessage(create(DisconnectResponseSchema, {}), DisconnectResponseSchema);
      this.frameHelper?.destroy();
    } catch (error) {
      this.handleError('Failed to respond to DisconnectRequest', error);
    }
  }

  private handlePingRequest(): void {
    try {
      this.sendMessage(create(PingResponseSchema, {}), PingResponseSchema);
    } catch (error) {
      this.handleError('Failed to respond to PingRequest', error);
    }
  }

  private handleGetTimeRequest(): void {
    try {
      const message = create(GetTimeResponseSchema, {
        epochSeconds: Math.floor(Date.now() / 1000)
      });
      this.sendMessage(message, GetTimeResponseSchema);
    } catch (error) {
      this.handleError('Failed to respond to GetTimeRequest', error);
    }
  }

  private handleError(context: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.emit('error', new Error(`${context}: ${errorMessage}`));
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.pingCount = 0;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setupPingTimer(): void {
    this.pingTimer = setInterval(async () => {
      try {
        await this.pingService();
        this.pingCount = 0;
      } catch (error) {
        if (++this.pingCount >= this.pingAttempts) {
          this.frameHelper?.end();
        }
      }
    }, this.pingInterval);
  }

  set connected(value: boolean) {
    if (this._connected === value) return;
    this._connected = value;
    this.emit(this._connected ? 'connected' : 'disconnected');
  }

  get connected(): boolean {
    return this._connected;
  }

  set authorized(value: boolean) {
    if (this._authorized === value) return;
    this._authorized = value;
    this.emit(this._authorized ? 'authorized' : 'unauthorized');
  }

  get authorized(): boolean {
    return this._authorized;
  }

  public connect(): void {
    if (this.connected) {
      console.log('[esphome-p1reader:connection] Already connected, skipping connect request');
      return;
    }
    this.frameHelper?.connect();
  }

  public disconnect(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connected) {
      try {
        this.sendMessage(create(DisconnectRequestSchema, {}), DisconnectRequestSchema);
      } catch (error) {
        // Ignore error
      }
    }
    this.authorized = false;
    this.connected = false;
    this.frameHelper?.removeAllListeners();
    this.removeAllListeners();
    this.frameHelper?.destroy();
  }

  public sendMessage(message: any, schema: any): void {
    if (!this.connected) {
      throw new Error('Socket is not connected');
    }
    this.frameHelper?.sendMessage(message, schema);
  }

  public sendCommandMessage(message: any, schema: any): void {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    this.sendMessage(message, schema);
  }

  public async sendMessageAwaitResponse(
    message: any,
    requestSchema: any,
    responseSchema: any,
    timeoutSeconds: number = 5
  ): Promise<any> {
    
    return new Promise((resolve, reject) => {
      const responseType = Object.entries(MESSAGE_TYPE_TO_PROTO).find(([_, schema]) => schema === responseSchema)?.[0];
      console.log('responseType', responseType);
      if (!responseType) {
        reject(new Error(`Unknown response schema: ${responseSchema}`));
        return;
      }
      
      const messageType = MessageTypes[parseInt(responseType)];
      console.log('messageType', messageType);
      
      // Initialize timeout variable early
      let timeout: NodeJS.Timeout | null = null;
      
      const clear = () => {
        this.off(`message.${messageType}`, handler);
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      };

      const handler = (message: any) => {
        clear();
        console.log('Received response message:', message);
        resolve(message);
      };

      try {
        console.log('Sending message...');
        this.sendMessage(message, requestSchema);
        console.log('Message sent successfully');
      } catch (error) {
        console.error('Error sending message:', error);
        clear();
        reject(error);
        return;
      }
      
      console.log('Listening for message event:', `message.${messageType}`);
      this.once(`message.${messageType}`, handler);

      timeout = setTimeout(() => {
        clear();
        reject(new Error(`sendMessage timeout waiting for ${messageType}`));
      }, timeoutSeconds * 1000);
    });
  }

  public async helloService(clientInfo?: string): Promise<any> {
    const message = create(HelloRequestSchema, {
      clientInfo
    });
    return await this.sendMessageAwaitResponse(message, HelloRequestSchema, HelloResponseSchema);
  }

  public async connectService(password?: string): Promise<any> {
    console.log('connectService - Starting with password:', password ? '[PASSWORD HIDDEN]' : 'undefined');
    
    // Make sure we're creating a valid message with the password
    const message = create(ConnectRequestSchema, {
      password: password || ''
    });
    
    return await this.sendMessageAwaitResponse(message, ConnectRequestSchema, ConnectResponseSchema);
  }

  public async disconnectService(): Promise<any> {
    const message = create(DisconnectRequestSchema, {});
    return await this.sendMessageAwaitResponse(message, DisconnectRequestSchema, DisconnectResponseSchema);
  }

  public async pingService(): Promise<any> {
    const message = create(PingRequestSchema, {});
    return await this.sendMessageAwaitResponse(message, PingRequestSchema, PingResponseSchema);
  }

  public async deviceInfoService(): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    const message = create(DeviceInfoRequestSchema, {});
    return await this.sendMessageAwaitResponse(message, DeviceInfoRequestSchema, DeviceInfoResponseSchema);
  }

  public async getTimeService(): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    const message = create(GetTimeRequestSchema, {});
    return await this.sendMessageAwaitResponse(message, GetTimeRequestSchema, GetTimeResponseSchema);
  }

  public async listEntitiesService(): Promise<any> {
    console.log('listEntitiesService');
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }

    const message = create(ListEntitiesRequestSchema, {});
    const allowedEvents = [
      'ListEntitiesBinarySensorResponse',
      'ListEntitiesCoverResponse',
      'ListEntitiesFanResponse',
      'ListEntitiesLightResponse',
      'ListEntitiesSensorResponse',
      'ListEntitiesSwitchResponse',
      'ListEntitiesTextSensorResponse',
      'ListEntitiesCameraResponse',
      'ListEntitiesClimateResponse',
      'ListEntitiesNumberResponse',
      'ListEntitiesSelectResponse',
      'ListEntitiesSirenResponse',
      'ListEntitiesLockResponse',
      'ListEntitiesButtonResponse',
      'ListEntitiesMediaPlayerResponse',
      'ListEntitiesTextResponse'
    ];

    const entitiesList: any[] = [];
    const onMessage = (type: string, message: any) => {
      if (!allowedEvents.includes(type)) return;
      
      // Ensure message has the required structure
      if (!message || typeof message !== 'object') {
        console.error('Invalid message received:', message);
        return;
      }

      // For sensor responses, ensure we have the required fields
      if (type === 'ListEntitiesSensorResponse') {
        if (!message.key || !message.objectId || !message.name) {
          console.error('Invalid sensor entity received:', message);
          return;
        }
      }

      // Create the entity using the appropriate entity class
      const entityType = type.slice(12, -8); // Remove 'ListEntities' prefix and 'Response' suffix
      const entityClass = Entities[entityType];
      
      if (!entityClass) {
        console.error(`No entity class found for type: ${entityType}`);
        return;
      }

      // Create entity instance with the message data
      entitiesList.push({
        component: entityType,
        entity: message
      });
    };

    this.on('message', onMessage);
    try {
      await this.sendMessageAwaitResponse(message, ListEntitiesRequestSchema, ListEntitiesDoneResponseSchema);
      console.log('List entities complete, found entities:', entitiesList.length);
      return entitiesList;
    } finally {
      this.off('message', onMessage);
    }
  }

  public subscribeStatesService(): void {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    this.sendMessage(create(SubscribeStatesRequestSchema, {}), SubscribeStatesRequestSchema);
  }

  public subscribeLogsService(level: number = 0, dumpConfig: boolean = false): void {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(SubscribeLogsRequestSchema, {
      level,
      dumpConfig
    });
    this.sendMessage(message, SubscribeLogsRequestSchema);
  }

  public cameraImageService(single: boolean = true, stream: boolean = false): void {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(CameraImageRequestSchema, {
      single,
      stream
    });
    this.sendMessage(message, CameraImageRequestSchema);
  }

  public subscribeBluetoothAdvertisementService(): void {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    this.sendMessage(create(SubscribeBluetoothLEAdvertisementsRequestSchema, {
      flags: this.supportsRawBLEAdvertisements ? 1 : 0
    }), SubscribeBluetoothLEAdvertisementsRequestSchema);
  }

  public unsubscribeBluetoothAdvertisementService(): void {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    this.sendMessage(create(UnsubscribeBluetoothLEAdvertisementsRequestSchema, {}), UnsubscribeBluetoothLEAdvertisementsRequestSchema);
  }

  public async connectBluetoothDeviceService(address: string, addressType?: number): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothDeviceRequestSchema, {
      address: BigInt(address),
      addressType
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothDeviceRequestSchema,
      BluetoothDeviceConnectionResponseSchema,
      10
    );
  }

  public async disconnectBluetoothDeviceService(address: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothDeviceRequestSchema, {
      address: BigInt(address),
      requestType: 1 // BLUETOOTH_DEVICE_REQUEST_TYPE_DISCONNECT
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothDeviceRequestSchema,
      BluetoothDeviceConnectionResponseSchema
    );
  }

  public async pairBluetoothDeviceService(address: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothDeviceRequestSchema, {
      address: BigInt(address),
      requestType: 2 // BLUETOOTH_DEVICE_REQUEST_TYPE_PAIR
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothDeviceRequestSchema,
      BluetoothDevicePairingResponseSchema,
      10
    );
  }

  public async unpairBluetoothDeviceService(address: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothDeviceRequestSchema, {
      address: BigInt(address),
      requestType: 3 // BLUETOOTH_DEVICE_REQUEST_TYPE_UNPAIR
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothDeviceRequestSchema,
      BluetoothDeviceUnpairingResponseSchema,
      10
    );
  }

  public async listBluetoothGATTServicesService(address: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }

    const message = create(BluetoothGATTGetServicesRequestSchema, {
      address: BigInt(address)
    });

    const servicesList: any[] = [];
    const onMessage = (message: any) => {
      if (message.address === BigInt(address)) {
        servicesList.push(...message.servicesList);
      }
    };

    this.on('message.BluetoothGATTGetServicesResponse', onMessage);
    try {
      await this.sendMessageAwaitResponse(
        message,
        BluetoothGATTGetServicesRequestSchema,
        BluetoothGATTGetServicesDoneResponseSchema
      );
      return { address, servicesList };
    } finally {
      this.off('message.BluetoothGATTGetServicesResponse', onMessage);
    }
  }

  public async readBluetoothGATTCharacteristicService(address: string, handle: number): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothGATTReadRequestSchema, {
      address: BigInt(address),
      handle
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothGATTReadRequestSchema,
      BluetoothGATTReadResponseSchema
    );
  }

  public async writeBluetoothGATTCharacteristicService(
    address: string,
    handle: number,
    value: Uint8Array,
    response: boolean = false
  ): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothGATTWriteRequestSchema, {
      address: BigInt(address),
      handle,
      response,
      data: value
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothGATTWriteRequestSchema,
      BluetoothGATTWriteResponseSchema
    );
  }

  public async notifyBluetoothGATTCharacteristicService(address: string, handle: number): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothGATTNotifyRequestSchema, {
      address: BigInt(address),
      handle,
      enable: true
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothGATTNotifyRequestSchema,
      BluetoothGATTNotifyResponseSchema
    );
  }

  public async readBluetoothGATTDescriptorService(address: string, handle: number): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothGATTReadDescriptorRequestSchema, {
      address: BigInt(address),
      handle
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothGATTReadDescriptorRequestSchema,
      BluetoothGATTReadResponseSchema
    );
  }

  public async writeBluetoothGATTDescriptorService(
    address: string,
    handle: number,
    value: Uint8Array
  ): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.authorized) {
      throw new Error('Not authorized');
    }
    const message = create(BluetoothGATTWriteDescriptorRequestSchema, {
      address: BigInt(address),
      handle,
      data: value
    });
    return await this.sendMessageAwaitResponse(
      message,
      BluetoothGATTWriteDescriptorRequestSchema,
      BluetoothGATTWriteResponseSchema
    );
  }

  public buttonCommandService(data: any): void {
    (Entities['Button'] as typeof Button)?.commandService(this, data);
  }

  public climateCommandService(data: any): void {
    (Entities['Climate'] as typeof Climate)?.commandService(this, data);
  }

  public coverCommandService(data: any): void {
    (Entities['Cover'] as typeof Cover)?.commandService(this, data);
  }

  public fanCommandService(data: any): void {
    (Entities['Fan'] as typeof Fan)?.commandService(this, data);
  }

  public lightCommandService(data: any): void {
    (Entities['Light'] as typeof Light)?.commandService(this, data);
  }

  public lockCommandService(data: any): void {
    (Entities['Lock'] as typeof Lock)?.commandService(this, data);
  }

  public numberCommandService(data: any): void {
    (Entities['Number'] as typeof Number)?.commandService(this, data);
  }

  public selectCommandService(data: any): void {
    (Entities['Select'] as typeof Select)?.commandService(this, data);
  }

  public switchCommandService(data: any): void {
    (Entities['Switch'] as typeof Switch)?.commandService(this, data);
  }

  public mediaPlayerCommandService(data: any): void {
    (Entities['MediaPlayer'] as typeof MediaPlayer)?.commandService(this, data);
  }

  public textCommandService(data: any): void {
    (Entities['Text'] as typeof Text)?.commandService(this, data);
  }

  public getPort(): number {
    return this.port;
  }

  public getHost(): string {
    return this.host;
  }

  public getEncryptionKey(): string {
    return this.encryptionKey;
  }

  // Add cleanup method
  cleanup(): void {
    this.removeAllListeners();
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.frameHelper) {
      this.frameHelper.destroy();
      this.frameHelper = null;
    }
    this._connected = false;
    this._authorized = false;
    this.pingCount = 0;
  }
}