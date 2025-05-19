import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { NumberCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface NumberConfig {
  name: string;
  key: number;
  icon?: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  disabledByDefault?: boolean;
  entityCategory?: number;
  unitOfMeasurement?: string;
  mode?: number;
  deviceClass?: string;
}

interface NumberState {
  key: number;
  state: number;
}

interface NumberCommandData {
  key: number;
  state?: number;
}

export class Number extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: NumberConfig; 
    state?: NumberState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'NumberStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesNumberResponse';
  }

  static commandService(connection: Connection, data: NumberCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(NumberCommandRequestSchema, {
      key: data.key,
      state: data.state
    });

    connection.sendMessage(NumberCommandRequestSchema, message);
  }

  command(data: Partial<NumberCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Number.commandService(this.connection, { ...data, key: this.config.key });
  }

  setState(state: number): void {
    if (state < this.config['minValue']) {
      throw new Error(`state(${state}) is less than the minimum(${this.config['minValue']})`);
    }
    if (state > this.config['maxValue']) {
      throw new Error(`state(${state}) is greater than the maximum(${this.config['maxValue']})`);
    }
    this.command({ state });
  }

  override handleState(state: NumberState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: NumberState): void {
    this.handleState(state);
  }
} 