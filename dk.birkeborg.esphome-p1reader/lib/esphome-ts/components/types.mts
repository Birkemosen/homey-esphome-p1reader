import { MessageTypes } from '../api/messages.mts';

export enum BinarySensorTypes {
  NONE = 'None',
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

export interface CommandInterface {
  sendEspMessage(type: MessageTypes, data: Uint8Array): void;
}

export interface StateEvent {
  key: number;
}

export interface SensorStateEvent extends StateEvent {
  state?: number;
}

export interface BinarySensorStateEvent extends StateEvent {
  state?: boolean;
}

export type SwitchStateEvent = BinarySensorStateEvent;

export interface LightStateEvent extends StateEvent {
  state?: boolean;
  brightness?: number;
  red?: number;
  green?: number;
  blue?: number;
  effect?: string;
}

export interface ListEntity {
  key: number;
  name: string;
  uniqueId: string;
  objectId: string;
}

export interface SensorEntity extends ListEntity {
  accuracyDecimals: number;
  deviceClass?: 'temperature' | 'humidity' | string;
  icon: string;
  unitOfMeasurement: string;
}

export interface BinarySensorEntity extends ListEntity {
  deviceClass: string;
}

export interface LightEntity extends ListEntity {
  effects: string[];
  supportsBrightness: boolean;
  supportsRgb: boolean;
}

export type ComponentType = 'light' | 'binarySensor' | 'sensor' | 'switch';

export default ComponentType;