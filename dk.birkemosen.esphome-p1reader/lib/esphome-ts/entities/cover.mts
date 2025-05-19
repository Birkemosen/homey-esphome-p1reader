import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { CoverCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface CoverConfig {
  name: string;
  key: number;
  assumedState?: boolean;
  supportsPosition?: boolean;
  supportsTilt?: boolean;
  deviceClass?: string;
  disabledByDefault?: boolean;
  icon?: string;
  entityCategory?: number;
  supportsStop?: boolean;
}

interface CoverState {
  key: number;
  hasLegacyCommand?: boolean;
  legacyCommand?: number;
  hasPosition?: boolean;
  position?: number;
  hasTilt?: boolean;
  tilt?: number;
  stop?: boolean;
}

interface CoverCommandData {
  key: number;
  legacyCommand?: number;
  position?: number;
  tilt?: number;
  stop?: boolean;
}

export class Cover extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: CoverConfig; 
    state?: CoverState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'CoverStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesCoverResponse';
  }

  static commandService(connection: Connection, data: CoverCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(CoverCommandRequestSchema, {
      key: data.key,
      hasLegacyCommand: data.legacyCommand !== undefined,
      legacyCommand: data.legacyCommand,
      hasPosition: data.position !== undefined,
      position: data.position,
      hasTilt: data.tilt !== undefined,
      tilt: data.tilt,
      stop: data.stop
    });

    connection.sendMessage(CoverCommandRequestSchema, message);
  }

  command(data: Partial<CoverCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Cover.commandService(this.connection, { ...data, key: this.config.key });
  }

  setLegacyCommand(legacyCommand: number): void {
    this.command({ legacyCommand });
  }

  setPosition(position: number): void {
    if (!this.config['supportsPosition']) {
      throw new Error('position is not supported');
    }
    this.command({ position });
  }

  setTilt(tilt: number): void {
    if (!this.config['supportsTilt']) {
      throw new Error('tilt is not supported');
    }
    this.command({ tilt });
  }

  setStop(stop: boolean): void {
    this.command({ stop });
  }

  override handleState(state: CoverState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: CoverState): void {
    this.handleState(state);
  }
} 