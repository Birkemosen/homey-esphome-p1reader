import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { FanCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface FanConfig {
  name: string;
  key: number;
  supportsOscillation?: boolean;
  supportsSpeed?: boolean;
  supportsDirection?: boolean;
  supportedSpeedLevels?: number;
  disabledByDefault?: boolean;
  icon?: string;
  entityCategory?: number;
}

interface FanState {
  key: number;
  hasState?: boolean;
  state?: boolean;
  hasSpeed?: boolean;
  speed?: number;
  hasOscillating?: boolean;
  oscillating?: boolean;
  hasDirection?: boolean;
  direction?: number;
  hasSpeedLevel?: boolean;
  speedLevel?: number;
}

interface FanCommandData {
  key: number;
  state?: boolean;
  speed?: number;
  oscillating?: boolean;
  direction?: number;
  speedLevel?: number;
}

export class Fan extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: FanConfig; 
    state?: FanState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'FanStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesFanResponse';
  }

  static commandService(connection: Connection, data: FanCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(FanCommandRequestSchema, {
      key: data.key,
      hasState: data.state !== undefined,
      state: data.state,
      hasSpeed: data.speed !== undefined,
      speed: data.speed,
      hasOscillating: data.oscillating !== undefined,
      oscillating: data.oscillating,
      hasDirection: data.direction !== undefined,
      direction: data.direction,
      hasSpeedLevel: data.speedLevel !== undefined,
      speedLevel: data.speedLevel
    });

    connection.sendMessage(FanCommandRequestSchema, message);
  }

  command(data: Partial<FanCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Fan.commandService(this.connection, { ...data, key: this.config.key });
  }

  setState(state: boolean): void {
    this.command({ state });
  }

  setOscillation(oscillating: boolean): void {
    if (!this.config['supportsOscillation']) {
      throw new Error('oscillation is not supported');
    }
    this.command({ oscillating });
  }

  setSpeed(speed: number): void {
    if (!this.config['supportsSpeed']) {
      throw new Error('speed is not supported');
    }
    this.command({ speed });
  }

  setDirection(direction: number): void {
    if (!this.config['supportsDirection']) {
      throw new Error('direction is not supported');
    }
    this.command({ direction });
  }

  setSpeedLevel(speedLevel: number): void {
    if (!this.config['supportedSpeedLevels'] || this.config['supportedSpeedLevels'] <= 0) {
      throw new Error('speed level is not supported');
    }
    this.command({ speedLevel });
  }

  override handleState(state: FanState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: FanState): void {
    this.handleState(state);
  }
} 