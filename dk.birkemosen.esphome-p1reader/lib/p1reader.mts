import { EventEmitter } from 'events';
import { Connection } from './esphome-ts/connection.mts';

// Simple debug function that only logs in development
const debug = (...args: any[]) => {
    console.log('[esphome-p1reader:esphome]', ...args);
};

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

class P1Reader extends EventEmitter {
  private connection: Connection;
  private entities: Map<number, Entity> = new Map();
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private isEncryptionError: boolean = false;
  private readonly POOL_SIZE = 20;
  private measurementPool: Array<{ type: string, value: number }>;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private reconnectAttempts: number = 0;
  private readonly DEFAULT_MAX_LISTENERS = 50;
  private readonly phaseMap: Map<string, string> = new Map([
    ['1', 'l1'],
    ['2', 'l2'],
    ['3', 'l3'],
    ['phase_1', 'l1'],
    ['phase_2', 'l2'],
    ['phase_3', 'l3']
  ]);
  private readonly measurementTypes = {
    CONSUMED: 'measure_power.consumed',
    PRODUCED: 'measure_power.produced',
    VOLTAGE: 'measure_voltage',
    CURRENT: 'measure_current',
    METER_CONSUMED: 'meter_power.consumed',
    METER_PRODUCED: 'meter_power.produced'
  } as const;

  constructor(hostSettings: any) {
    super();
    // Set default max listeners
    this.setMaxListeners(this.DEFAULT_MAX_LISTENERS);
    
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
      encryptionKey: hostSettings.encryptionKey,
      password: !hostSettings.encryptionKey ? hostSettings.password : undefined,
      maxListeners: hostSettings.maxListeners || this.DEFAULT_MAX_LISTENERS
    };
    console.log('P1Reader constructor', options);

    debug('Connecting with settings:', {
      host: hostSettings.host,
      port: hostSettings.port,
      hasEncryptionKey: !!hostSettings.encryptionKey
    });

    this.connection = new Connection(options);
    
    // Listen for encryption required event
    this.connection.on('encryption_required', () => {
      debug('Encryption required but no key provided');
      this.isEncryptionError = true;
      this.emit('error', new Error('Encryption required but no key provided'));
    });

    // Add periodic listener count logging
    setInterval(() => {
      debug('Current listener counts:', {
        measurement: this.listenerCount('measurement'),
        error: this.listenerCount('error'),
        disconnected: this.listenerCount('disconnected'),
        total: this.listenerCount('*')
      });
    }, 60000); // Log every minute
  }

  /**
   * Sets the maximum number of listeners for this instance and its connection
   * @param count The maximum number of listeners to allow
   */
  override setMaxListeners(count: number): this {
    super.setMaxListeners(count);
    if (this.connection) {
      this.connection.setMaxListeners(count);
    }
    return this;
  }

  protected onEntityState(entityState: EntityState) {
    if (!this.isValidEntityState(entityState)) {
      debug('Got invalid entity state');
      return;
    }

    const entity = this.entities.get(entityState.key);
    if (!entity) {
      debug('Got entity state for unknown entity', {
        key: entityState.key,
        state: entityState.state,
        totalEntities: this.entities.size,
        entityKeys: Array.from(this.entities.keys())
      });
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

  private handlePhaseMeasurement(objectId: string, state: number, baseType: string, multiplier: number = 1): void {
    const phasePart = objectId.split('_').pop();
    debug('Phase mapping', { objectId, phasePart, phaseMap: this.phaseMap });
    const phase = this.phaseMap.get(phasePart || '') || 'l1';
    const measurement = `${baseType}.${phase}`;
    debug('Processing phase measurement', { objectId, phase, measurement, value: state * multiplier });
    const measurementObj = this.getMeasurementObject(measurement, state * multiplier);
    this.emit('measurement', measurementObj);
  }

  protected handleNumericEntityState(entity: Entity, state: number) {
    const objectId = entity.entity.objectId;
    let measurement = this.getMeasurementObject('', 0);

    try {
      // Check if there are any listeners for measurements before processing
      if (this.listenerCount('measurement') === 0) {
        return;
      }

      debug('Processing entity', {
        objectId,
        state,
        name: entity.entity.name,
        key: entity.entity.key,
        component: entity.component
      });

      switch (objectId) {
        // Cumulative measurements (kWh)
        case 'cumulative_active_import':
          measurement = this.getMeasurementObject(this.measurementTypes.METER_CONSUMED, state);
          this.emit('measurement', measurement);
          break;
        case 'cumulative_active_export':
          measurement = this.getMeasurementObject(this.measurementTypes.METER_PRODUCED, state);
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

        // Phase measurements
        case 'momentary_active_import_phase_1':
        case 'momentary_active_import_phase_2':
        case 'momentary_active_import_phase_3':
          this.handlePhaseMeasurement(objectId, state, this.measurementTypes.CONSUMED, 1000);
          break;
        case 'momentary_active_export_phase_1':
        case 'momentary_active_export_phase_2':
        case 'momentary_active_export_phase_3':
          this.handlePhaseMeasurement(objectId, state, this.measurementTypes.PRODUCED, 1000);
          break;
        case 'voltage_phase_1':
        case 'voltage_phase_2':
        case 'voltage_phase_3':
          this.handlePhaseMeasurement(objectId, state, this.measurementTypes.VOLTAGE);
          break;
        case 'current_phase_1':
        case 'current_phase_2':
        case 'current_phase_3':
          this.handlePhaseMeasurement(objectId, state, this.measurementTypes.CURRENT);
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
      console.log('[esphome-p1reader:esphome] Skipping connect request - already connecting or encryption error');
      return;
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[esphome-p1reader:esphome] Max reconnection attempts reached, stopping reconnection');
      return;
    }

    this.isConnecting = true;

    try {
      // Clean up any existing listeners and timers
      this.cleanup();

      // Setup event listeners
      this.connection.on('error', this.errorHandler);
      this.connection.on('disconnected', this.disconnectedHandler);
      this.connection.on('authorized', this.authorizedHandler);
      this.connection.on('message.SensorStateResponse', this.sensorStateHandler);
      this.connection.on('message.ListEntitiesSensorResponse', this.entityHandler);

      // Connect
      await this.connection.connect();
      console.log('[esphome-p1reader:esphome] Connected');
    } catch (error) {
      console.error('[esphome-p1reader:esphome] Failed to connect:', error);
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

  private cleanup(): void {
    // Remove all listeners from connection
    this.connection.removeAllListeners('error');
    this.connection.removeAllListeners('disconnected');
    this.connection.removeAllListeners('authorized');
    this.connection.removeAllListeners('message.SensorStateResponse');
    this.connection.removeAllListeners('message.ListEntitiesSensorResponse');
  }

  async disconnect(): Promise<void> {
    this.isConnecting = false;
    this.isConnected = false;
    this.isEncryptionError = false;
    this.reconnectAttempts = 0; // Reset reconnect attempts on disconnect

    // Clean up event listeners
    this.cleanup();
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
      await this.connection.subscribeStatesService();
    } catch (error) {
      console.error('Failed to subscribe to states', error);
      throw error;
    }
  }

  isDeviceConnected(): boolean {
    return this.isConnected;
  }

  isDeviceConnecting(): boolean {
    return this.isConnecting;
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

  private errorHandler = (error: Error) => {
    // Use console.error directly instead of debug to avoid recursion
    console.error('[esphome-p1reader:esphome] Error:', error);
    this.isConnected = false;
    this.isConnecting = false;
    
    // Increment reconnect attempts
    this.reconnectAttempts++;
    
    // Only emit error if we're not already in an error state
    if (!this.isEncryptionError) {
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        console.error('[esphome-p1reader:esphome] Max reconnection attempts reached, stopping reconnection');
        this.emit('error', new Error('Max reconnection attempts reached'));
        return;
      }
      this.emit('error', error);
    }
  };

  private disconnectedHandler = () => {
    // Use console.log directly instead of debug to avoid recursion
    console.log('[esphome-p1reader:esphome] Disconnected');
    this.isConnecting = false;
    this.isConnected = false;
    
    // Only emit disconnected if we're not already disconnected
    if (this.isConnected) {
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        console.error('[esphome-p1reader:esphome] Max reconnection attempts reached, stopping reconnection');
        this.emit('error', new Error('Max reconnection attempts reached'));
        return;
      }
      this.emit('disconnected');
    }
  };

  private authorizedHandler = async () => {
    debug('Authorized');
    this.isConnected = true;
    try {
      debug('Requesting entity list...');
      await this.connection.listEntitiesService();
      
      // Wait a short time to ensure entities are processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      debug('Current entities:', {
        count: this.entities.size,
        keys: Array.from(this.entities.keys())
      });
      
      debug('Subscribing to states...');
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

  private entityHandler = (entity: any) => {
    console.log('entityHandler', entity);
    debug('Processing entity:', {
      key: entity.key,
      name: entity.name,
      objectId: entity.objectId,
      totalEntities: this.entities.size + 1 // +1 because we're about to add this one
    });
    this.entities.set(entity.key, {
      component: entity.type?.slice(12, -8) || 'Sensor', // Extract component type from message type
      entity: entity
    });
  }
}

export default P1Reader;