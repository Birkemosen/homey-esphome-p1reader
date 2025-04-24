import { ReadData } from './espSocket.mts';
import {
  BinarySensorStateResponse,
  BinarySensorStateResponseSchema,
  CoverStateResponse,
  CoverStateResponseSchema,
  LightStateResponse,
  LightStateResponseSchema,
  ListEntitiesBinarySensorResponse,
  ListEntitiesBinarySensorResponseSchema,
  ListEntitiesLightResponse,
  ListEntitiesLightResponseSchema,
  ListEntitiesSensorResponse,
  ListEntitiesSensorResponseSchema,
  ListEntitiesSwitchResponse,
  ListEntitiesSwitchResponseSchema,
  SensorStateResponse,
  SensorStateResponseSchema,
  SwitchStateResponse,
  SwitchStateResponseSchema,
} from './protobuf/api_pb.ts';
import { MessageTypes } from './messages.mts';
import { decode } from './client.mts';
import { ListEntityResponses, StateResponses } from './interfaces.mts';
import { CommandInterface } from '../components/index.mts';
import { fromBinary } from '@bufbuild/protobuf';
import { BaseComponent, BinarySensorComponent, LightComponent, SensorComponent, SwitchComponent } from '../components/index.mts';
import { EventEmitter } from 'events';

export const stateParser = (data: ReadData): StateResponses | undefined => {
  switch (data.type) {
    case MessageTypes.BinarySensorStateResponse: {
      return fromBinary(BinarySensorStateResponseSchema, data.payload);
    }
    case MessageTypes.LightStateResponse: {
      return fromBinary(LightStateResponseSchema, data.payload);
    }
    case MessageTypes.SensorStateResponse: {
      return fromBinary(SensorStateResponseSchema, data.payload);
    }
    case MessageTypes.SwitchStateResponse: {
      return fromBinary(SwitchStateResponseSchema, data.payload);
    }
    case MessageTypes.CoverStateResponse: {
      return fromBinary(CoverStateResponseSchema, data.payload);
    }
  }
  return undefined;
};

export const createComponents = (
  data: ReadData,
  commandInterface: CommandInterface,
  knownComponents: Set<string>,
  eventEmitter: EventEmitter
): { id: string; component?: BaseComponent } => {
  switch (data.type) {
    case MessageTypes.ListEntitiesBinarySensorResponse: {
      const response: ListEntitiesBinarySensorResponse = fromBinary(ListEntitiesBinarySensorResponseSchema, data.payload);
      return knownComponents.has(response.objectId)
        ? { id: response.objectId }
        : {
          id: response.objectId,
          component: new BinarySensorComponent(response, eventEmitter, commandInterface),
        };
    }
    case MessageTypes.ListEntitiesSwitchResponse: {
      const response: ListEntitiesSwitchResponse = fromBinary(ListEntitiesSwitchResponseSchema, data.payload);
      return knownComponents.has(response.objectId)
        ? { id: response.objectId }
        : {
          id: response.objectId,
          component: new SwitchComponent(response, eventEmitter, commandInterface),
        };
    }
    case MessageTypes.ListEntitiesLightResponse: {
      const response: ListEntitiesLightResponse = fromBinary(ListEntitiesLightResponseSchema, data.payload);
      const lightEntity = {
        ...response,
        supportsBrightness: response.legacySupportsBrightness ?? false,
        supportsRgb: response.legacySupportsRgb ?? false,
        supportsColorTemperature: response.legacySupportsColorTemperature ?? false,
        supportsWhiteValue: response.legacySupportsWhiteValue ?? false,
      };
      return knownComponents.has(response.objectId)
        ? { id: response.objectId }
        : {
          id: response.objectId,
          component: new LightComponent(lightEntity, eventEmitter, commandInterface),
        };
    }
    case MessageTypes.ListEntitiesSensorResponse: {
      const response: ListEntitiesSensorResponse = fromBinary(ListEntitiesSensorResponseSchema, data.payload);
      return knownComponents.has(response.objectId)
        ? { id: response.objectId }
        : {
          id: response.objectId,
          component: new SensorComponent(response, eventEmitter, commandInterface),
        };
    }
  }
  return { id: '' };
};

export const emptyCommandInterface: CommandInterface = {
  sendEspMessage: () => undefined,
};

export const isTrue = (val: unknown): val is true => val === true;
export const isTruthy = (val: unknown): boolean => !!val;

export const isFalse = (val: unknown): val is false => val === false;
export const isFalsy = (val: unknown): boolean => !val;

export default {
  isTrue,
  isTruthy,
  isFalse,
  isFalsy,
};