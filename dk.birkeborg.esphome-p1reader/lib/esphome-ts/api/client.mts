import { EventEmitter } from 'events';
import {
  ConnectRequest,
  ConnectRequestSchema,
  ConnectResponse,
  ConnectResponseSchema,
  DeviceInfoRequest,
  DeviceInfoRequestSchema,
  DeviceInfoResponse,
  DeviceInfoResponseSchema,
  HelloRequest,
  HelloRequestSchema,
  HelloResponse,
  HelloResponseSchema,
  ListEntitiesRequest,
  ListEntitiesRequestSchema,
  PingRequest,
  PingRequestSchema,
  PingResponse,
  PingResponseSchema,
  SubscribeStatesRequest,
  SubscribeStatesRequestSchema,
} from './protobuf/api_pb.ts';
import { ReadData } from './espSocket.mts';
import { MessageTypes } from './messages.mts';
import { toBinary, fromBinary, create } from '@bufbuild/protobuf';
import { EspSocket } from './espSocket.mts';
import { void$, voidSchema } from './protobuf/api_options_pb.ts';

export interface Decoder<T> {
  decode: (bytes: Uint8Array) => T;
}

export const decode = <T extends unknown>(decoder: Decoder<T>, data: ReadData): T => {
  return decoder.decode(data.payload);
};

export class Client extends EventEmitter {
  constructor(private readonly socket: EspSocket) {
    super();
    this.socket.on('espData', (data: ReadData) => {
      if (data.type === MessageTypes.PingRequest) {
        this.socket.sendEspMessage(MessageTypes.PingResponse, toBinary(PingResponseSchema, create(PingResponseSchema, {})));
      }
    });
  }

  public terminate(): void {
    this.socket.removeAllListeners('espData');
  }

  public async hello(request: HelloRequest): Promise<HelloResponse> {
    const data = toBinary(HelloRequestSchema, create(HelloRequestSchema, request));
    this.socket.sendEspMessage(MessageTypes.HelloRequest, data);
    return new Promise((resolve) => {
      const handler = (data: ReadData) => {
        if (data.type === MessageTypes.HelloResponse) {
          this.socket.removeListener('espData', handler);
          resolve(fromBinary(HelloResponseSchema, data.payload));
        }
      };
      this.socket.on('espData', handler);
    });
  }

  public async connect(request: ConnectRequest): Promise<ConnectResponse> {
    const data = toBinary(ConnectRequestSchema, create(ConnectRequestSchema, request));
    this.socket.sendEspMessage(MessageTypes.ConnectRequest, data);
    return new Promise((resolve) => {
      const handler = (data: ReadData) => {
        if (data.type === MessageTypes.ConnectResponse) {
          this.socket.removeListener('espData', handler);
          resolve(fromBinary(ConnectResponseSchema, data.payload));
        }
      };
      this.socket.on('espData', handler);
    });
  }

  public async ping(): Promise<PingResponse> {
    const data = toBinary(PingRequestSchema, create(PingRequestSchema, {}));
    this.socket.sendEspMessage(MessageTypes.ConnectRequest, data);
    return new Promise((resolve) => {
      const handler = (data: ReadData) => {
        if (data.type === MessageTypes.PingResponse) {
          this.socket.removeListener('espData', handler);
          resolve(fromBinary(PingResponseSchema, data.payload));
        }
      };
      this.socket.on('espData', handler);
    });
  }

  public async deviceInfo(): Promise<DeviceInfoResponse> {
    const data = toBinary(DeviceInfoRequestSchema, create(DeviceInfoRequestSchema, {}));
    this.socket.sendEspMessage(MessageTypes.DeviceInfoRequest, data);
    return new Promise((resolve) => {
      const handler = (data: ReadData) => {
        if (data.type === MessageTypes.DeviceInfoResponse) {
          this.socket.removeListener('espData', handler);
          resolve(fromBinary(DeviceInfoResponseSchema, data.payload));
        }
      };
      this.socket.on('espData', handler);
    });
  }

  public async listEntities(): Promise<void$> {
    const data = toBinary(ListEntitiesRequestSchema, create(ListEntitiesRequestSchema, {}));
    this.socket.sendEspMessage(MessageTypes.ListEntitiesRequest, data);
    return fromBinary(voidSchema, new Uint8Array());
  }

  public async subscribeStateChange(): Promise<void$> {
    const data = toBinary(SubscribeStatesRequestSchema, create(SubscribeStatesRequestSchema, {}));
    this.socket.sendEspMessage(MessageTypes.SubscribeStatesRequest, data);
    return fromBinary(voidSchema, new Uint8Array());
  }
}

export default Client;
