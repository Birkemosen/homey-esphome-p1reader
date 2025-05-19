import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';

interface BinarySensorConfig {
  name: string;
  key: number;
  deviceClass?: string;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
}

interface BinarySensorState {
  key: number;
  state: boolean;
  missingState: boolean;
}

export class BinarySensor extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: BinarySensorConfig; 
    state?: BinarySensorState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'BinarySensorStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesBinarySensorResponse';
  }
} 