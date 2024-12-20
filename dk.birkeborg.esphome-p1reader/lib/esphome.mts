import { EventEmitter } from 'events';
import { Connection } from '@2colors/esphome-native-api';
import Debug from 'debug';

const DEBUG_ENABLED = process.env.NODE_ENV === 'development';
const debug = DEBUG_ENABLED ? Debug('esphome-p1reader:esphome') : () => { };

export interface EntityState {
  key: number;
  state: number | boolean;
  missingState: boolean;
}

export interface Entity {
  component: string;
  entity: {
    objectId: string;
    key: number;
    name: string;
    uniqueId: string;
    icon?: string;
    unitOfMeasurement?: string;
    accuracyDecimals?: number;
    forceUpdate?: boolean;
    deviceClass?: string;
    stateClass?: number;
    lastResetType?: number;
    disabledByDefault: boolean;
  };
}

class ESPHomeClient extends EventEmitter {
  private connection: Connection;
  private entities: Map<number, Entity> = new Map();
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private isEncryptionError: boolean = false;
  private readonly POOL_SIZE = 20;
  private measurementPool: Array<{ type: string, value: number }>;
  private readonly phaseMap: Record<string, string> = {
    'phase_1': 'l1',
    'phase_2': 'l2',
    'phase_3': 'l3'
  };
  private readonly measurementTypes = {
    CONSUMED: 'measure_power.consumed',
    PRODUCED: 'measure_power.produced',
    VOLTAGE: 'measure_voltage',
    CURRENT: 'measure_current'
  } as const;

  constructor(hostSettings: any) {
    super();
    // Pre-allocate pool objects
    this.measurementPool = Array.from({ length: this.POOL_SIZE }, () => ({ type: '', value: 0 }));
    const options = {
      host: hostSettings.host,
      port: hostSettings.port,
      clientInfo: 'Homey - ESPHome P1 Reader',
      clearSession: false,
      initializeDeviceInfo: true,
      initializeListEntities: true,
      initializeSubscribeStates: true,
      initializeSubscribeLogs: false,
      initializeSubscribeBLEAdvertisements: false,
      reconnect: true,
      reconnectInterval: 15000,
      pingInterval: 15000,
      pingAttempts: 3,
      encryptionKey: hostSettings.encryption_key,
      password: !hostSettings.encryption_key ? hostSettings.password : undefined
    };

    debug('Connecting with settings:', {
      host: hostSettings.host,
      port: hostSettings.port,
      hasEncryptionKey: !!hostSettings.encryption_key
    });

    this.connection = new Connection(options);
  }

  protected onEntityState(entityState: EntityState) {
    if (!this.isValidEntityState(entityState)) {
      debug('Got invalid entity state');
      return;
    }

    const entity = this.entities.get(entityState.key);
    if (!entity) {
      debug('Got entity state for unknown entity, key:', entityState.key);
      return;
    }

    if (typeof entityState.state === 'number') {
      this.handleNumericEntityState(entity, entityState.state);
    }
  }

  private isValidEntityState(state: any): state is EntityState {
    return (
      typeof state === 'object' &&
      state !== null &&
      typeof state.key === 'number' &&
      (typeof state.state === 'number' || typeof state.state === 'boolean') &&
      typeof state.missingState === 'boolean'
    );
  }

  protected handleNumericEntityState(entity: Entity, state: number) {
    const objectId = entity.entity.objectId;
    let measurement = this.getMeasurementObject('', 0);

    try {
      debug('Processing entity', { objectId, state });
      switch (objectId) {
        // Cumulative measurements (kWh)
        case 'cumulative_active_import':
          measurement = this.getMeasurementObject(this.measurementTypes.CONSUMED, state);
          this.emit('measurement', measurement);
          break;
        case 'cumulative_active_export':
          measurement = this.getMeasurementObject(this.measurementTypes.PRODUCED, state);
          this.emit('measurement', measurement);
          break;

        // Momentary measurements (convert kW to W)
        case 'momentary_active_import':
          measurement = this.getMeasurementObject(this.measurementTypes.CONSUMED, state * 1000);
          this.emit('measurement', measurement);
          break;
        case 'momentary_active_export':
          measurement = this.getMeasurementObject(this.measurementTypes.PRODUCED, state * 1000);
          this.emit('measurement', measurement);
          break;
        case 'momentary_active_import_phase_1':
        case 'momentary_active_import_phase_2':
        case 'momentary_active_import_phase_3':
          const importPhase = this.phaseMap[objectId.split('_').pop()!];
          measurement = this.getMeasurementObject(`${this.measurementTypes.CONSUMED}.${importPhase}`, state * 1000);
          this.emit('measurement', measurement);
          break;
        case 'momentary_active_export_phase_1':
        case 'momentary_active_export_phase_2':
        case 'momentary_active_export_phase_3':
          const exportPhase = this.phaseMap[objectId.split('_').pop()!];
          measurement = this.getMeasurementObject(`${this.measurementTypes.PRODUCED}.${exportPhase}`, state * 1000);
          this.emit('measurement', measurement);
          break;
        case 'voltage_phase_1':
        case 'voltage_phase_2':
        case 'voltage_phase_3':
          const voltagePhase = this.phaseMap[objectId.split('_').pop()!];
          measurement = this.getMeasurementObject(`${this.measurementTypes.VOLTAGE}.${voltagePhase}`, state);
          this.emit('measurement', measurement);
          break;
        case 'current_phase_1':
        case 'current_phase_2':
        case 'current_phase_3':
          const currentPhase = this.phaseMap[objectId.split('_').pop()!];
          measurement = this.getMeasurementObject(`${this.measurementTypes.CURRENT}.${currentPhase}`, state);
          this.emit('measurement', measurement);
          break;
      }
    } catch (error) {
      debug('Error handling numeric entity state:', {
        error,
        objectId,
        state,
        entityName: entity.entity.name,
        entityKey: entity.entity.key
      });
      this.emit('error', error);
    } finally {
      // Always return measurement to pool, even if unused
      this.measurementPool.push(measurement);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.isEncryptionError) {
      debug('Skipping connect request - already connecting or encryption error');
      return;
    }

    this.isConnecting = true;

    try {
      // Remove existing listeners before adding new ones
      this.connection.off('error', this.errorHandler);
      this.connection.off('disconnected', this.disconnectedHandler);
      this.connection.off('authorized', this.authorizedHandler);
      this.connection.off('message.SensorStateResponse', this.sensorStateHandler);

      // Setup event listeners
      this.connection.on('error', this.errorHandler);
      this.connection.on('disconnected', this.disconnectedHandler);
      this.connection.on('authorized', this.authorizedHandler);
      this.connection.on('message.SensorStateResponse', this.sensorStateHandler);

      // Connect
      await this.connection.connect();
      debug('Connected');
    } catch (error) {
      debug('Failed to connect:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Bad format: Encryption expected')) {
        this.isEncryptionError = true;
      }

      this.isConnected = false;
      this.emit('error', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnecting = false;
    this.isConnected = false;
    this.isEncryptionError = false;

    // Clean up event listeners
    this.removeAllListeners();

    // Clear data structures
    this.entities.clear();
    this.measurementPool = Array.from({ length: this.POOL_SIZE }, () => ({ type: '', value: 0 }));

    await this.connection.disconnect();
  }

  async getEntities(): Promise<Entity[]> {
    return Array.from(this.entities.values());
  }

  private async subscribeToStates(): Promise<void> {
    console.log('Subscribing to states');
    try {
      // @ts-expect-error SubscribeStatesService exists but is not typed
      await this.connection.subscribeStatesService();
    } catch (error) {
      console.error('Failed to subscribe to states', error);
      throw error;
    }
  }

  isDeviceConnected(): boolean {
    return this.isConnected;
  }

  hasEncryptionError(): boolean {
    return this.isEncryptionError;
  }

  private getMeasurementObject(type: string, value: number) {
    const obj = this.measurementPool.length > 0 ?
      this.measurementPool.pop()! :
      { type: '', value: 0 };
    obj.type = type;
    obj.value = value;
    return obj;
  }

  private errorHandler(error: unknown) {
    debug('Connection error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Bad format: Encryption expected')) {
      this.isEncryptionError = true;
    }
    this.isConnected = false;
    this.emit('error', error);
  }

  private disconnectedHandler() {
    debug('Disconnected');
    this.isConnecting = false;
    this.isConnected = false;
    this.emit('disconnected');
  }

  private authorizedHandler = async () => {
    debug('Authorized');
    this.isConnected = true;
    try {
      const entities = await this.connection.listEntitiesService();
      for (const entity of entities) {
        debug('Got entity', entity);
        this.entities.set(entity.entity.key, entity);
      }
      await this.subscribeToStates();
    } catch (error) {
      debug('Error during authorization:', error);
      this.emit('error', error);
    }
  }

  private sensorStateHandler = (state: any) => {
    try {
      this.onEntityState(state);
    } catch (error) {
      debug('Error handling entity state:', error);
      this.emit('error', error);
    }
  }
}

export default ESPHomeClient;