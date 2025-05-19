import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { ButtonCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface ButtonConfig {
  name: string;
  key: number;
  deviceClass?: string;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
}

interface ButtonState {
  key: number;
}

interface ButtonCommandData {
  key: number;
}

export class Button extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: ButtonConfig; 
    state?: ButtonState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'ButtonStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesButtonResponse';
  }

  static commandService(connection: Connection, { key }: ButtonCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    const message = create(ButtonCommandRequestSchema, { key });
    connection.sendMessage(ButtonCommandRequestSchema, message);
  }

  command(data: Partial<ButtonCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Button.commandService(this.connection, { ...data, key: this.config.key });
  }

  push(): void {
    this.command();
  }
} 