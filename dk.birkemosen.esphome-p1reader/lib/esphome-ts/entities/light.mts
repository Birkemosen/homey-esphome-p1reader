import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { LightCommandRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface LightConfig {
  name: string;
  key: number;
  supportedColorModes?: number[];
  legacySupportsBrightness?: boolean;
  legacySupportsRgb?: boolean;
  legacySupportsWhiteValue?: boolean;
  legacySupportsColorTemperature?: boolean;
  minMireds?: number;
  maxMireds?: number;
  effects?: string[];
  disabledByDefault?: boolean;
  icon?: string;
  entityCategory?: number;
}

interface LightState {
  key: number;
  hasState?: boolean;
  state?: boolean;
  hasBrightness?: boolean;
  brightness?: number;
  hasColorMode?: boolean;
  colorMode?: number;
  hasColorBrightness?: boolean;
  colorBrightness?: number;
  hasRgb?: boolean;
  red?: number;
  green?: number;
  blue?: number;
  hasWhite?: boolean;
  white?: number;
  hasColorTemperature?: boolean;
  colorTemperature?: number;
  hasColdWhite?: boolean;
  coldWhite?: number;
  hasWarmWhite?: boolean;
  warmWhite?: number;
  hasTransitionLength?: boolean;
  transitionLength?: number;
  hasFlashLength?: boolean;
  flashLength?: number;
  hasEffect?: boolean;
  effect?: string;
}

interface LightCommandData {
  key: number;
  state?: boolean;
  brightness?: number;
  colorMode?: number;
  colorBrightness?: number;
  red?: number;
  green?: number;
  blue?: number;
  white?: number;
  colorTemperature?: number;
  coldWhite?: number;
  warmWhite?: number;
  transitionLength?: number;
  flashLength?: number;
  effect?: string;
}

export class Light extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: LightConfig; 
    state?: LightState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'LightStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesLightResponse';
  }

  static commandService(connection: Connection, data: LightCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(LightCommandRequestSchema, {
      key: data.key,
      hasState: data.state !== undefined,
      state: data.state,
      hasBrightness: data.brightness !== undefined,
      brightness: data.brightness,
      hasColorMode: data.colorMode !== undefined,
      colorMode: data.colorMode,
      hasColorBrightness: data.colorBrightness !== undefined,
      colorBrightness: data.colorBrightness,
      hasRgb: data.red !== undefined && data.green !== undefined && data.blue !== undefined,
      red: data.red,
      green: data.green,
      blue: data.blue,
      hasWhite: data.white !== undefined,
      white: data.white,
      hasColorTemperature: data.colorTemperature !== undefined,
      colorTemperature: data.colorTemperature,
      hasColdWhite: data.coldWhite !== undefined,
      coldWhite: data.coldWhite,
      hasWarmWhite: data.warmWhite !== undefined,
      warmWhite: data.warmWhite,
      hasTransitionLength: data.transitionLength !== undefined,
      transitionLength: data.transitionLength,
      hasFlashLength: data.flashLength !== undefined,
      flashLength: data.flashLength,
      hasEffect: data.effect !== undefined,
      effect: data.effect
    });

    connection.sendMessage(LightCommandRequestSchema, message);
  }

  command(data: Partial<LightCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    Light.commandService(this.connection, { ...data, key: this.config.key });
  }

  setState(state: boolean): void {
    this.command({ state });
  }

  setBrightness(brightness: number): void {
    if (!this.config['legacySupportsBrightness']) {
      throw new Error('brightness is not supported');
    }
    this.command({ brightness });
  }

  setRgb(red: number, green: number, blue: number): void {
    if (!this.config['legacySupportsRgb']) {
      throw new Error('rgb is not supported');
    }
    this.command({ red, green, blue });
  }

  setColorMode(colorMode: number): void {
    if (!this.config['supportedColorModes']) {
      throw new Error('color modes are not supported');
    }
    if (!this.config['supportedColorModes'].includes(colorMode)) {
      throw new Error(`color mode(${colorMode}) is not supported`);
    }
    this.command({ colorMode });
  }

  setColorBrightness(colorBrightness: number): void {
    this.command({ colorBrightness });
  }

  setWhite(white: number): void {
    if (!this.config['legacySupportsWhiteValue']) {
      throw new Error('white_value is not supported');
    }
    this.command({ white });
  }

  setColorTemperature(colorTemperature: number): void {
    if (!this.config['legacySupportsColorTemperature']) {
      throw new Error('color_temperature is not supported');
    }
    this.command({ colorTemperature });
  }

  setColdWhite(coldWhite: number): void {
    this.command({ coldWhite });
  }

  setWarmWhite(warmWhite: number): void {
    this.command({ warmWhite });
  }

  setTransitionLength(transitionLength: number): void {
    this.command({ transitionLength });
  }

  setFlashLength(flashLength: number): void {
    this.command({ flashLength });
  }

  setEffect(effect: string): void {
    if (!this.config['effects']) {
      throw new Error('effects are not supported');
    }
    if (!this.config['effects'].includes(effect)) {
      throw new Error(`effect(${effect}) is not supported`);
    }
    this.command({ effect });
  }

  override handleState(state: LightState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: LightState): void {
    this.handleState(state);
  }
} 