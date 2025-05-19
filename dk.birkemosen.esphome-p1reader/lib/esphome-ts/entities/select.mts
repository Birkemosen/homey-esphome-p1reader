import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { SelectCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface SelectConfig {
  name: string;
  key: number;
  icon?: string;
  options?: string[];
  disabledByDefault?: boolean;
  entityCategory?: number;
}

interface SelectState {
  key: number;
  state: string;
}

interface SelectCommandData {
  key: number;
  state?: string;
}

export class Select extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: SelectConfig; 
    state?: SelectState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'SelectStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesSelectResponse';
  }

  static commandService(connection: Connection, data: SelectCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(SelectCommandRequestSchema, {
      key: data.key,
      state: data.state
    });

    connection.sendMessage(SelectCommandRequestSchema, message);
  }

  command(data: Partial<SelectCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Select.commandService(this.connection, { ...data, key: this.config.key });
  }

  setState(state: string): void {
    if (this.config['options'] && !this.config['options'].includes(state)) {
      throw new Error(`state(${state}) is not supported`);
    }
    this.command({ state });
  }

  override handleState(state: SelectState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: SelectState): void {
    this.handleState(state);
  }
} 