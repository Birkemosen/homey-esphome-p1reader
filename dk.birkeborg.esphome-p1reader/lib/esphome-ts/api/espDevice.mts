import { EventEmitter } from 'events';
import { ReadData } from './espSocket.mts';
import { Client } from './client.mts';
import {
  createComponents,
  decode,
  isFalse,
  isTrue,
  listResponses,
  MessageTypes,
  stateParser,
  stateResponses,
  StateResponses,
} from './index.mts';
import { BaseComponent } from '../components/base.mts';
import { EspSocket } from './espSocket.mts';
import { DeviceInfoResponse, DeviceInfoResponseSchema } from './protobuf/api_pb.ts';
import { fromBinary } from '@bufbuild/protobuf';

const PING_TIMEOUT = 90 * 1000;

// Enhanced debug function that logs in both development and production
const debug = (...args: any[]) => {
  console.log('[esphome-p1reader:espdevice]', ...args);
};

export class EspDevice extends EventEmitter {
  private readonly socket: EspSocket;
  private readonly client: Client;
  public deviceInfo?: DeviceInfoResponse;
  public readonly components: { [key: string]: BaseComponent } = {};
  private isDiscovered: boolean = false;

  constructor(
    private readonly host: string,
    private readonly password: string = '',
    private readonly port: number = 6053,
  ) {
    super();
    debug('Initializing EspDevice', { host, port, hasPassword: !!password });

    this.socket = new EspSocket(host, port, {
      timeout: PING_TIMEOUT,
    });

    this.client = new Client(this.socket);

    this.socket.on('espData', (data: ReadData) => {
      debug('Received ESP data:', { type: data.type, payloadLength: data.payload.length });

      if (stateResponses.has(data.type)) {
        const parsedState = stateParser(data);
        if (parsedState) {
          debug('Emitting state event:', parsedState);
          this.emit('stateEvent', parsedState);
        } else {
          debug('Failed to parse state from data');
        }
      } else if (listResponses.has(data.type)) {
        debug('Processing list response');
        this.parseListResponse(data);
      } else if (data.type === MessageTypes.DeviceInfoResponse) {
        debug('Processing device info response');
        this.deviceInfo = fromBinary(DeviceInfoResponseSchema, data.payload);
        debug('Device info:', this.deviceInfo);
      } else {
        debug('Unknown message type:', data.type);
      }
    });

    this.socket.on('connected', () => {
      debug('Socket connected, setting up connection');
      this.setupConnection();
    });

    this.socket.on('error', (error: Error) => {
      debug('Socket error:', error);
      this.emit('error', error);
    });

    this.socket.on('close', () => {
      debug('Socket closed');
      this.emit('disconnected');
    });
  }

  private async setupConnection(): Promise<void> {
    try {
      debug('Setting up connection...');
      await this.client.hello({ clientInfo: 'esphome-ts', apiVersionMajor: 1, apiVersionMinor: 0, $typeName: 'HelloRequest' });
      debug('Hello sent');

      await this.client.connect({ password: this.password, $typeName: 'ConnectRequest' });
      debug('Connect sent');

      await this.client.deviceInfo();
      debug('Device info requested');

      await this.client.listEntities();
      debug('List entities requested');

      await this.client.subscribeStateChange();
      debug('State change subscription requested');

      debug('Connection setup completed');
    } catch (error) {
      debug('Error during connection setup:', error);
      this.emit('error', error);
    }
  }

  public terminate(): void {
    debug('Terminating EspDevice');
    Object.values(this.components).forEach((component: BaseComponent) => {
      component.terminate();
    });
    this.client.terminate();
    this.socket.close();
    this.removeAllListeners();
  }

  private parseListResponse(data: ReadData) {
    if (data.type === MessageTypes.ListEntitiesDoneResponse) {
      debug('List entities done received');
      this.isDiscovered = true;
      this.emit('discovered', true);
    } else {
      debug('Processing list entity response');
      const knownComponents = new Set<string>(Object.keys(this.components));
      const { id, component } = createComponents(data, this.socket, knownComponents, this);
      if (component && id) {
        debug('Created component:', { id, type: component.type });
        this.components[id] = component;
      }
    }
  }
}

export default EspDevice;