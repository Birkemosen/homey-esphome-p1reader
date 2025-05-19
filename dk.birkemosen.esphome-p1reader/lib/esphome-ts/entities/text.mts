import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { TextCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface TextConfig {
  name: string;
  key: number;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  mode?: number;
}

interface TextState {
  key: number;
  state: string;
}

interface TextCommandData {
  key: number;
  state?: string;
}

export class Text extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: TextConfig; 
    state?: TextState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'TextStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesTextResponse';
  }

  static commandService(connection: Connection, data: TextCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(TextCommandRequestSchema, {
      key: data.key,
      state: data.state
    });

    connection.sendMessage(TextCommandRequestSchema, message);
  }

  command(data: Partial<TextCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Text.commandService(this.connection, { ...data, key: this.config.key });
  }

  setState(state: string): void {
    if (this.config['minLength'] !== undefined && state.length < this.config['minLength']) {
      throw new Error(`state(${state}) is less than the minimum(${this.config['minLength']})`);
    }
    if (this.config['maxLength'] !== undefined && state.length > this.config['maxLength']) {
      throw new Error(`state(${state}) is greater than the maximum(${this.config['maxLength']})`);
    }
    this.command({ state });
  }

  override handleState(state: TextState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: TextState): void {
    this.handleState(state);
  }
} 