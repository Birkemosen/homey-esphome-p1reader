import type { Socket } from 'net';
import type { EventEmitter } from 'events';

export interface FrameHelper extends EventEmitter {
  handleData(data: Uint8Array): void;
  handleError(error: Error): void;
  sendMessage(message: any): void;
}

export interface FrameHelperConstructor {
  new (socket: Socket, ...args: any[]): FrameHelper;
} 

export enum FrameHelperState {
  INITIALIZED = 'initialized',
  CONNECTING = 'connecting',
  READY = 'ready',
  ERROR = 'error',
  CLOSED = 'closed',
}