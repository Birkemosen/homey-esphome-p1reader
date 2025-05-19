import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { LockCommandRequestSchema, LockCommand } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface LockConfig {
  name: string;
  key: number;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
  assumedState?: boolean;
  supportsOpen?: boolean;
  requiresCode?: boolean;
  codeFormat?: string;
}

interface LockState {
  key: number;
  command?: number;
  hasCode?: boolean;
  code?: string;
}

interface LockCommandData {
  key: number;
  command?: number;
  code?: string;
}

export class Lock extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: LockConfig; 
    state?: LockState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'LockStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesLockResponse';
  }

  static commandService(connection: Connection, data: LockCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(LockCommandRequestSchema, {
      key: data.key,
      command: data.command,
      hasCode: data.code !== undefined,
      code: data.code
    });

    connection.sendMessage(LockCommandRequestSchema, message);
  }

  command(data: Partial<LockCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Lock.commandService(this.connection, { ...data, key: this.config.key });
  }

  setCommand(command: number): void {
    if (command === LockCommand.LOCK_OPEN && !this.config['supportsOpen']) {
      throw new Error('lock open is not supported');
    }
    this.command({ command });
  }

  setCode(code: string): void {
    if (!this.config['requiresCode']) {
      throw new Error('code is not required');
    }
    this.command({ code });
  }

  override handleState(state: LockState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: LockState): void {
    this.handleState(state);
  }
} 