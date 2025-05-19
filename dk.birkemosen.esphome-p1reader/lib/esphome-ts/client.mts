import { EventEmitter } from 'events';
import { Connection } from './connection.mts';
import { create as createEntity, Entities } from './entities/index.mts';
import type { DeviceInfoResponse, ListEntitiesResponse, SubscribeLogsResponse, BluetoothLEAdvertisementResponse } from './types.mts';

interface ClientConfig {
  host: string;
  port?: number;
  password?: string;
  clientInfo?: string;
  encryptionKey?: string;
  expectedServerName?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  pingInterval?: number;
  pingAttempts?: number;
  clearSession?: boolean;
  initializeDeviceInfo?: boolean;
  initializeListEntities?: boolean;
  initializeSubscribeStates?: boolean;
  initializeSubscribeLogs?: boolean | { level?: number; dumpConfig?: boolean };
  initializeSubscribeBLEAdvertisements?: boolean;
}

export class Client extends EventEmitter {
  private connection: Connection;
  private deviceInfo: DeviceInfoResponse | null = null;
  private entities: { [key: string | number]: any } = {};
  private initialized: boolean = false;
  private _connected: boolean = false;
  private _subscribeBLEAdvertisements: boolean = false;
  private propagateError = (e: Error): void => {
    this.emit('error', e);
  };

  constructor(config: ClientConfig) {
    super();
    this.connection = new Connection({
      host: config.host,
      port: config.port,
      password: config.password,
      clientInfo: config.clientInfo,
      encryptionKey: config.encryptionKey,
      expectedServerName: config.expectedServerName,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval,
      pingInterval: config.pingInterval,
      pingAttempts: config.pingAttempts
    });

    this.connection.on('authorized', async () => {
      this.connected = true;
      try {
        this.initialized = false;
        if (config.clearSession) {
          for (const id of Object.keys(this.entities)) this.removeEntity(id);
        }
        if (config.initializeDeviceInfo) await this.connection.deviceInfoService();
        if (config.initializeListEntities) await this.connection.listEntitiesService();
        if (config.initializeSubscribeStates) await this.connection.subscribeStatesService();
        if (config.initializeSubscribeLogs) {
          const logOptions = typeof config.initializeSubscribeLogs === 'boolean' ? {} : config.initializeSubscribeLogs;
          await this.connection.subscribeLogsService(logOptions.level, logOptions.dumpConfig);
        }
        if (config.initializeSubscribeBLEAdvertisements) await this.connection.subscribeBluetoothAdvertisementService();
        this.initialized = true;
        this.emit('initialized');
      } catch (error) {
        this.emit('error', error);
      }
    });

    this.connection.on('close', () => {
      this.connected = false;
      this.initialized = false;
    });

    this.connection.on('message.DeviceInfoResponse', async (deviceInfo: DeviceInfoResponse) => {
      this.deviceInfo = deviceInfo;
      this.emit('deviceInfo', deviceInfo);
    });

    for (const EntityClass of Object.values(Entities)) {
      this.connection.on(`message.${EntityClass.getListEntitiesResponseName()}`, async (config: ListEntitiesResponse) => {
        if (!this.entities[config.key]) this.addEntity(EntityClass.name, config);
      });
    }

    this.connection.on('message.SubscribeLogsResponse', async (data: SubscribeLogsResponse) => {
      this.emit('logs', data);
    });

    this.connection.on('message.BluetoothLEAdvertisementResponse', async (data: BluetoothLEAdvertisementResponse) => {
      this.emit('ble', data);
    });

    this.connection.on('error', async (e: Error) => {
      this.emit('error', e);
    });

    this.deviceInfo = null;
    this.entities = {};
    this.initialized = false;
    this._connected = false;
    this._subscribeBLEAdvertisements = config.initializeSubscribeBLEAdvertisements === true;
  }

  set connected(value: boolean) {
    if (this._connected === value) return;
    this._connected = value;
    this.emit(this._connected ? 'connected' : 'disconnected');
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.connection.connect();
  }

  disconnect(): void {
    if (this.connection.connected && this._subscribeBLEAdvertisements) {
      this.connection.unsubscribeBluetoothAdvertisementService();
    }
    this.connection.disconnect();
  }

  addEntity(entityClassName: string, config: ListEntitiesResponse): void {
    const key = config.key.toString();
    if (this.entities[key]) {
      throw new Error(`Entity with id(i.e key) ${key} is already added`);
    }
    this.entities[key] = createEntity(entityClassName, { connection: this.connection, config });
    this.entities[key].on('error', this.propagateError);
    this.emit('newEntity', this.entities[key]);
  }

  removeEntity(id: string | number): void {
    const key = id.toString();
    if (!this.entities[key]) {
      throw new Error(`Cannot find entity with id(i.e. key) ${key}`);
    }
    this.entities[key].destroy();
    this.entities[key].off('error', this.propagateError);
    delete this.entities[key];
  }

  get getDeviceInfo(): DeviceInfoResponse | null {
    return this.deviceInfo;
  }

  get getEntities(): { [key: string | number]: any } {
    return this.entities;
  }

  get getInitialized(): boolean {
    return this.initialized;
  }

  get getSubscribeBLEAdvertisements(): boolean {
    return this._subscribeBLEAdvertisements;
  }
}