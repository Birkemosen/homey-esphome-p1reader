import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';

interface SensorConfig {
  name: string;
  key: number;
  deviceClass?: string;
  unitOfMeasurement?: string;
  accuracyDecimals?: number;
  forceUpdate?: boolean;
  disabledByDefault?: boolean;
  icon?: string;
  entityCategory?: number;
  stateClass?: string;
}

interface SensorState {
  key: number;
  state?: number;
  missingState?: boolean;
}

export class Sensor extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: SensorConfig; 
    state?: SensorState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'SensorStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesSensorResponse';
  }

  override handleState(state: SensorState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: SensorState): void {
    this.handleState(state);
  }
} 