import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';

interface TextSensorConfig {
  name: string;
  key: number;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
  deviceClass?: string;
}

interface TextSensorState {
  key: number;
  state: string;
  missingState: boolean;
}

export class TextSensor extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: TextSensorConfig; 
    state?: TextSensorState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'TextSensorStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesTextSensorResponse';
  }

  override handleState(state: TextSensorState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: TextSensorState): void {
    this.handleState(state);
  }
} 