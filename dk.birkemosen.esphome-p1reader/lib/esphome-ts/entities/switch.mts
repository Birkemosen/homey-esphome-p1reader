import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { SwitchCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface SwitchConfig {
  name: string;
  key: number;
  icon?: string;
  assumedState?: boolean;
  disabledByDefault?: boolean;
  entityCategory?: number;
  deviceClass?: string;
}

interface SwitchState {
  key: number;
  state: boolean;
}

interface SwitchCommandData {
  key: number;
  state?: boolean;
}

export class Switch extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: SwitchConfig; 
    state?: SwitchState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'SwitchStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesSwitchResponse';
  }

  static commandService(connection: Connection, data: SwitchCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(SwitchCommandRequestSchema, {
      key: data.key,
      state: data.state
    });

    connection.sendMessage(SwitchCommandRequestSchema, message);
  }

  command(data: Partial<SwitchCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Switch.commandService(this.connection, { ...data, key: this.config.key });
  }

  setState(state: boolean): void {
    this.command({ state });
  }

  override handleState(state: SwitchState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: SwitchState): void {
    this.handleState(state);
  }
} 