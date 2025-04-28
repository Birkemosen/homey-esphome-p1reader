import type { MessageTypes } from '../api/core/protocol.mts';

export enum BinarySensorTypes {
  BATTERY = 'battery',
  COLD = 'cold',
  CONNECTIVITY = 'connectivity',
  DOOR = 'door',
  GARAGE_DOOR = 'garage_door',
  GAS = 'gas',
  HEAT = 'heat',
  LIGHT = 'light',
  LOCK = 'lock',
  MOISTURE = 'moisture',
  MOTION = 'motion',
  MOVING = 'moving',
  NONE = 'None',
  OCCUPANCY = 'occupancy',
  OPENING = 'opening',
  PLUG = 'plug',
  POWER = 'power',
  PRESENCE = 'presence',
  PROBLEM = 'problem',
  SAFETY = 'safety',
  SMOKE = 'smoke',
  SOUND = 'sound',
  VIBRATION = 'vibration',
  WINDOW = 'window',
}

export interface BinarySensorEntity extends ListEntity {
  deviceClass: string;
}

export interface BinarySensorStateEvent extends StateEvent {
  state?: boolean;
}

export interface CommandInterface {
  sendEspMessage: (type: MessageTypes, data: Uint8Array) => void;
}

export interface LightEntity extends ListEntity {
  effects: string[];
  supportsBrightness: boolean;
  supportsRgb: boolean;
}

export interface LightStateEvent extends StateEvent {
  blue?: number;
  brightness?: number;
  effect?: string;
  green?: number;
  red?: number;
  state?: boolean;
}

export interface ListEntity {
  key: number;
  name: string;
  objectId: string;
  uniqueId: string;
}

export interface SensorEntity extends ListEntity {
  accuracyDecimals: number;
  icon: string;
  unitOfMeasurement: string;
  deviceClass?: string | 'humidity' | 'temperature';
}

export interface SensorStateEvent extends StateEvent {
  state?: number;
}

export interface StateEvent {
  key: number;
}

export type ComponentType = 'binarySensor' | 'light' | 'sensor' | 'switch';

export type SwitchStateEvent = BinarySensorStateEvent;