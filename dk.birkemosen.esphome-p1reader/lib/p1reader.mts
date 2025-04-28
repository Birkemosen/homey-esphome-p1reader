import { Client } from './esphome-ts/api/client/client.mts';
import { EventEmitter } from 'events';
import { MessageTypes } from './esphome-ts/api/core/protocol.mts';

// Simple debug function that only logs in development
const debug = (...args: any[]) => {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG']) {
    console.log('[esphome-p1reader:p1reader]', ...args);
  }
};

export type CapabilityType =
  | 'measure_power.consumed' | 'measure_power.produced'
  | 'meter_power.consumed' | 'meter_power.produced'
  | `measure_current.l${1 | 2 | 3}`
  | `measure_power.${'consumed' | 'produced'}.l${1 | 2 | 3}`
  | `measure_voltage.l${1 | 2 | 3}`;

export interface Measurement {
  type: CapabilityType;
  value: number;
}

export class P1Reader extends EventEmitter {
  private readonly measurementTypes = {
    CONSUMED: 'measure_power.consumed',
    CURRENT: 'measure_current',
    METER_CONSUMED: 'meter_power.consumed',
    METER_PRODUCED: 'meter_power.produced',
    PRODUCED: 'measure_power.produced',
    VOLTAGE: 'measure_voltage'
  } as const;

  private readonly phaseMap: Record<string, string> = {
    '1': 'l1',
    '2': 'l2',
    '3': 'l3',
    'phase_1': 'l1',
    'phase_2': 'l2',
    'phase_3': 'l3'
  };

  private readonly components: Record<number, {
    objectId: string;
    name: string;
    unitOfMeasurement: string;
    accuracyDecimals: number;
    deviceClass: string;
  }> = {};

  private entitiesReceived: boolean = false;
  private queuedStateUpdates: Array<{ key: number; state: number | boolean }> = [];

  constructor(
    private readonly client: Client,
  ) {
    super();
    debug('P1Reader initialized');
    this.setupClient();
  }

  private async setupClient() {
    debug('Setting up client');

    // Set up error handler first
    this.client.on('error', (error: Error) => {
      debug('Client error:', error);
      this.emit('error', error);
    });

    // Set up disconnect handler
    this.client.on('disconnected', () => {
      debug('Client disconnected');
    });

    // Set up discovery handler
    this.client.on('discovered', () => {
      debug('Device discovered');
    });

    // Set up message handler for entity discovery
    this.client.on('message', (message: any) => {
      try {
        debug('Received message:', {
          type: message.type,
          typeName: MessageTypes[message.type],
          payload: message.payload
        });
        
        if (message.type === MessageTypes.ListEntitiesSensorResponse) {
          const sensor = message.payload;
          debug('Discovered sensor:', {
            key: sensor.key,
            objectId: sensor.objectId,
            name: sensor.name,
            unitOfMeasurement: sensor.unitOfMeasurement,
            accuracyDecimals: sensor.accuracyDecimals,
            deviceClass: sensor.deviceClass
          });
          
          this.components[sensor.key] = {
            objectId: sensor.objectId,
            name: sensor.name,
            unitOfMeasurement: sensor.unitOfMeasurement,
            accuracyDecimals: sensor.accuracyDecimals,
            deviceClass: sensor.deviceClass
          };
        } else if (message.type === MessageTypes.ListEntitiesDoneResponse) {
          debug('All entities received');
          this.entitiesReceived = true;
          this.processQueuedStateUpdates();
        }
      } catch (error) {
        debug('Error handling discovery message:', error);
        this.emit('error', error);
      }
    });

    // Set up state event handler last, after we have entity information
    this.client.on('stateEvent', (state: any) => {
      debug('Received state event:', state);
      try {
        this.handleEntityState(state);
      } catch (error) {
        debug('Error handling entity state:', error);
        this.emit('error', error);
      }
    });
  }

  private processQueuedStateUpdates() {
    debug('Processing queued state updates:', this.queuedStateUpdates.length);
    while (this.queuedStateUpdates.length > 0) {
      const update = this.queuedStateUpdates.shift();
      if (update) {
        this.handleEntityState(update);
      }
    }
  }

  private handleEntityState(state: any) {
    debug('Handling entity state:', state);
    if (!this.isValidEntityState(state)) {
      debug('Invalid entity state');
      return;
    }

    // If we haven't received all entities yet, queue the state update
    if (!this.entitiesReceived) {
      debug('Queuing state update until entities are received');
      this.queuedStateUpdates.push({ key: state.key, state: state.state });
      return;
    }

    const entity = this.components[state.key];
    if (!entity) {
      debug('Entity not found for key:', state.key);
      return;
    }

    debug('Found entity:', entity);
    if (typeof state.state === 'number') {
      this.handleNumericEntityState(entity, state.state);
    }
  }

  private handleNumericEntityState(entity: {
    objectId: string;
    name: string;
    unitOfMeasurement: string;
    accuracyDecimals: number;
    deviceClass: string;
  }, state: number) {
    const { objectId, unitOfMeasurement, accuracyDecimals } = entity;
    debug('Handling numeric entity state:', { objectId, state, unitOfMeasurement });
    
    // Format state value based on accuracy
    const formattedState = Number(state.toFixed(accuracyDecimals));
    let measurement: Measurement | null = null;

    try {
      switch (objectId) {
        case 'cumulative_active_export':
          measurement = { type: this.measurementTypes.METER_PRODUCED, value: formattedState };
          break;
        case 'cumulative_active_import':
          measurement = { type: this.measurementTypes.METER_CONSUMED, value: formattedState };
          break;
        case 'current_phase_1':
        case 'current_phase_2':
        case 'current_phase_3':
          const currentPhase = this.phaseMap[objectId.split('_').pop() || ''] || 'l1';
          measurement = { 
            type: `${this.measurementTypes.CURRENT}.${currentPhase}` as CapabilityType, 
            value: formattedState 
          };
          break;
        case 'momentary_active_export':
          measurement = { type: this.measurementTypes.PRODUCED, value: formattedState * 1000 };
          break;
        case 'momentary_active_export_phase_1':
        case 'momentary_active_export_phase_2':
        case 'momentary_active_export_phase_3':
          const exportPhase = this.phaseMap[objectId.split('_').pop() || ''] || 'l1';
          measurement = { 
            type: `${this.measurementTypes.PRODUCED}.${exportPhase}` as CapabilityType, 
            value: formattedState * 1000 
          };
          break;
        case 'momentary_active_import':
          measurement = { type: this.measurementTypes.CONSUMED, value: formattedState * 1000 };
          break;
        case 'momentary_active_import_phase_1':
        case 'momentary_active_import_phase_2':
        case 'momentary_active_import_phase_3':
          const importPhase = this.phaseMap[objectId.split('_').pop() || ''] || 'l1';
          measurement = { 
            type: `${this.measurementTypes.CONSUMED}.${importPhase}` as CapabilityType, 
            value: formattedState * 1000 
          };
          break;
        case 'voltage_phase_1':
        case 'voltage_phase_2':
        case 'voltage_phase_3':
          const voltagePhase = this.phaseMap[objectId.split('_').pop() || ''] || 'l1';
          measurement = { 
            type: `${this.measurementTypes.VOLTAGE}.${voltagePhase}` as CapabilityType, 
            value: formattedState 
          };
          break;
      }

      if (measurement) {
        debug('Emitting measurement:', measurement);
        this.emit('measurement', measurement);
      } else {
        debug('No measurement generated for objectId:', objectId);
      }
    } catch (error) {
      debug('Error handling numeric entity state:', error);
      this.emit('error', error);
    }
  }

  private isValidEntityState(state: any): state is { key: number; state: number | boolean } {
    return (
      typeof state === 'object' &&
      state !== null &&
      typeof state.key === 'number' &&
      (typeof state.state === 'number' || typeof state.state === 'boolean')
    );
  }

  public async getEntitiesList(): Promise<void> {
    debug('Requesting list of entities');
    try {
      await this.client.listEntities();
      debug('List entities request sent');
    } catch (error) {
      debug('Error requesting entities:', error);
      this.emit('error', error);
      throw error;
    }
  }

  public async subscribeStateChange(): Promise<void> {
    debug('Subscribing to state changes');
    try {
      await this.client.subscribeStateChange();
      debug('State change subscription successful');
    } catch (error) {
      debug('Error subscribing to state changes:', error);
      this.emit('error', error);
      throw error;
    }
  }
} 