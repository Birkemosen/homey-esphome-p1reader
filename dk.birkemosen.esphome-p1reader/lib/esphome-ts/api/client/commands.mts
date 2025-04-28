import { MessageTypes } from '../core/protocol.mts';
import { createCommandMessage } from './utils.mts';
import {
  SwitchCommandRequestSchema,
  LightCommandRequestSchema,
  ClimateCommandRequestSchema,
  FanCommandRequestSchema,
  CoverCommandRequestSchema,
  NumberCommandRequestSchema,
  SelectCommandRequestSchema,
  TextCommandRequestSchema,
  TimeCommandRequestSchema,
  DateCommandRequestSchema,
  DateTimeCommandRequestSchema,
  ButtonCommandRequestSchema,
  LockCommandRequestSchema,
  ValveCommandRequestSchema,
  MediaPlayerCommandRequestSchema,
  UpdateCommandRequestSchema,
  AlarmControlPanelCommandRequestSchema,
} from '../../protobuf/api_pb.mts';

export const createSwitchCommand = (key: number, state: boolean) => {
  return createCommandMessage(MessageTypes.SwitchCommandRequest, SwitchCommandRequestSchema, { key, state });
};

export const createLightCommand = (key: number, state: boolean, brightness?: number) => {
  return createCommandMessage(MessageTypes.LightCommandRequest, LightCommandRequestSchema, {
    key,
    state,
    hasBrightness: brightness !== undefined,
    brightness: brightness || 0
  });
};

export const createClimateCommand = (key: number, mode?: number, targetTemperature?: number) => {
  return createCommandMessage(MessageTypes.ClimateCommandRequest, ClimateCommandRequestSchema, {
    key,
    hasMode: mode !== undefined,
    mode: mode || 0,
    hasTargetTemperature: targetTemperature !== undefined,
    targetTemperature: targetTemperature || 0
  });
};

export const createFanCommand = (key: number, state?: boolean, speed?: number) => {
  return createCommandMessage(MessageTypes.FanCommandRequest, FanCommandRequestSchema, {
    key,
    hasState: state !== undefined,
    state: state || false,
    hasSpeed: speed !== undefined,
    speed: speed || 0
  });
};

export const createCoverCommand = (key: number, position?: number, stop?: boolean) => {
  return createCommandMessage(MessageTypes.CoverCommandRequest, CoverCommandRequestSchema, {
    key,
    hasPosition: position !== undefined,
    position: position || 0,
    stop: stop || false
  });
};

export const createNumberCommand = (key: number, state: number) => {
  return createCommandMessage(MessageTypes.NumberCommandRequest, NumberCommandRequestSchema, { key, state });
};

export const createSelectCommand = (key: number, state: string) => {
  return createCommandMessage(MessageTypes.SelectCommandRequest, SelectCommandRequestSchema, { key, state });
};

export const createTextCommand = (key: number, state: string) => {
  return createCommandMessage(MessageTypes.TextCommandRequest, TextCommandRequestSchema, { key, state });
};

export const createTimeCommand = (key: number, hour: number, minute: number, second: number) => {
  return createCommandMessage(MessageTypes.TimeCommandRequest, TimeCommandRequestSchema, { key, hour, minute, second });
};

export const createDateCommand = (key: number, year: number, month: number, day: number) => {
  return createCommandMessage(MessageTypes.DateCommandRequest, DateCommandRequestSchema, { key, year, month, day });
};

export const createDateTimeCommand = (key: number, epochSeconds: number) => {
  return createCommandMessage(MessageTypes.DateTimeCommandRequest, DateTimeCommandRequestSchema, { key, epochSeconds });
};

export const createButtonCommand = (key: number) => {
  return createCommandMessage(MessageTypes.ButtonCommandRequest, ButtonCommandRequestSchema, { key });
};

export const createLockCommand = (key: number, command: number, code?: string) => {
  return createCommandMessage(MessageTypes.LockCommandRequest, LockCommandRequestSchema, { key, command, code: code || '' });
};

export const createValveCommand = (key: number, position?: number, stop?: boolean) => {
  return createCommandMessage(MessageTypes.ValveCommandRequest, ValveCommandRequestSchema, {
    key,
    hasPosition: position !== undefined,
    position: position || 0,
    stop: stop || false
  });
};

export const createMediaPlayerCommand = (key: number, command?: number, volume?: number, mediaUrl?: string) => {
  return createCommandMessage(MessageTypes.MediaPlayerCommandRequest, MediaPlayerCommandRequestSchema, {
    key,
    hasCommand: command !== undefined,
    command: command || 0,
    hasVolume: volume !== undefined,
    volume: volume || 0,
    hasMediaUrl: mediaUrl !== undefined,
    mediaUrl: mediaUrl || ''
  });
};

export const createUpdateCommand = (key: number, command: number) => {
  return createCommandMessage(MessageTypes.UpdateCommandRequest, UpdateCommandRequestSchema, { key, command });
};

export const createAlarmControlPanelCommand = (key: number, command: number, code?: string) => {
  return createCommandMessage(MessageTypes.AlarmControlPanelCommandRequest, AlarmControlPanelCommandRequestSchema, { key, command, code: code || '' });
}; 