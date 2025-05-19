import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { ClimateCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

export interface ClimateConfig {
  name: string;
  key: number;
  supportsCurrentTemperature?: boolean;
  supportsTwoPointTargetTemperature?: boolean;
  supportedModes?: number[];
  visualMinTemperature?: number;
  visualMaxTemperature?: number;
  visualTargetTemperatureStep?: number;
  legacySupportsAway?: boolean;
  supportsAction?: boolean;
  supportedFanModes?: number[];
  supportedSwingModes?: number[];
  supportedCustomFanModes?: string[];
  supportedPresets?: number[];
  supportedCustomPresets?: string[];
  disabledByDefault?: boolean;
  icon?: string;
  entityCategory?: number;
  visualCurrentTemperatureStep?: number;
}

interface ClimateState {
  key: number;
  hasMode?: boolean;
  mode?: number;
  hasTargetTemperature?: boolean;
  targetTemperature?: number;
  hasTargetTemperatureLow?: boolean;
  targetTemperatureLow?: number;
  hasTargetTemperatureHigh?: boolean;
  targetTemperatureHigh?: number;
  hasLegacyAway?: boolean;
  legacyAway?: boolean;
  hasFanMode?: boolean;
  fanMode?: number;
  hasSwingMode?: boolean;
  swingMode?: number;
  hasCustomFanMode?: boolean;
  customFanMode?: string;
  hasPreset?: boolean;
  preset?: number;
  hasCustomPreset?: boolean;
  customPreset?: string;
}

interface ClimateCommandData {
  key: number;
  mode?: number;
  targetTemperature?: number;
  targetTemperatureLow?: number;
  targetTemperatureHigh?: number;
  legacyAway?: boolean;
  fanMode?: number;
  swingMode?: number;
  customFanMode?: string;
  preset?: number;
  customPreset?: string;
}

export class Climate extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: ClimateConfig; 
    state?: ClimateState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'ClimateStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesClimateResponse';
  }

  static commandService(connection: Connection, data: ClimateCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(ClimateCommandRequestSchema, {
      key: data.key,
      mode: data.mode,
      targetTemperature: data.targetTemperature,
      targetTemperatureLow: data.targetTemperatureLow,
      targetTemperatureHigh: data.targetTemperatureHigh,
      fanMode: data.fanMode,
      swingMode: data.swingMode,
      customFanMode: data.customFanMode,
      preset: data.preset,
      customPreset: data.customPreset
    });

    connection.sendMessage(ClimateCommandRequestSchema, message);
  }

  command(data: Partial<ClimateCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Climate.commandService(this.connection, { ...data, key: this.config.key });
  }

  setMode(mode: number): void {
    if (!this.config['supportedModes']) {
      throw new Error('modes are not supported');
    }
    if (!this.config['supportedModes'].includes(mode)) {
      throw new Error(`mode(${mode}) is not supported`);
    }
    this.command({ mode });
  }

  setTargetTemperature(targetTemperature: number): void {
    this.command({ targetTemperature });
  }

  setTargetTemperatureLow(targetTemperatureLow: number): void {
    if (!this.config['supportsTwoPointTargetTemperature']) {
      throw new Error('two_point_target_temperature are not supported');
    }
    this.command({ targetTemperatureLow });
  }

  setTargetTemperatureHigh(targetTemperatureHigh: number): void {
    if (!this.config['supportsTwoPointTargetTemperature']) {
      throw new Error('two_point_target_temperature are not supported');
    }
    this.command({ targetTemperatureHigh });
  }

  setLegacyAway(legacyAway: boolean): void {
    if (!this.config['legacySupportsAway']) {
      throw new Error('legacy away is not supported');
    }
    this.command({ legacyAway });
  }

  setFanMode(fanMode: number): void {
    if (!this.config['supportedFanModes']) {
      throw new Error('fan modes are not supported');
    }
    if (!this.config['supportedFanModes'].includes(fanMode)) {
      throw new Error(`fan mode(${fanMode}) is not supported`);
    }
    this.command({ fanMode });
  }

  setSwingMode(swingMode: number): void {
    if (!this.config['supportedSwingModes']) {
      throw new Error('swing modes are not supported');
    }
    if (!this.config['supportedSwingModes'].includes(swingMode)) {
      throw new Error(`swing mode(${swingMode}) is not supported`);
    }
    this.command({ swingMode });
  }

  setCustomFanMode(customFanMode: string): void {
    if (!this.config['supportedCustomFanModes']) {
      throw new Error('custom fan modes are not supported');
    }
    if (!this.config['supportedCustomFanModes'].includes(customFanMode)) {
      throw new Error(`custom fan mode(${customFanMode}) is not supported`);
    }
    this.command({ customFanMode });
  }

  setPreset(preset: number): void {
    if (!this.config['supportedPresets']) {
      throw new Error('presets are not supported');
    }
    if (!this.config['supportedPresets'].includes(preset)) {
      throw new Error(`preset(${preset}) is not supported`);
    }
    this.command({ preset });
  }

  setCustomPreset(customPreset: string): void {
    if (!this.config['supportedCustomPresets']) {
      throw new Error('custom presets are not supported');
    }
    if (!this.config['supportedCustomPresets'].includes(customPreset)) {
      throw new Error(`custom preset(${customPreset}) is not supported`);
    }
    this.command({ customPreset });
  }

  override handleState(state: ClimateState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: ClimateState): void {
    this.handleState(state);
  }
} 