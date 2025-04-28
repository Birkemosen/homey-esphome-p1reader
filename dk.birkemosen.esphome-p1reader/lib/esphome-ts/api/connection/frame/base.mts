import { EventEmitter } from 'events';
import type { Socket } from 'net';
import type { FrameHelper } from './types.mts';
import { frameDebug } from './debug.mts';

export abstract class BaseFrameHelper extends EventEmitter implements FrameHelper {
  protected socket: Socket;
  protected buffer: Uint8Array | null = null;
  protected bufferLength = 0;
  protected position = 0;
  protected ready = false;
  protected readyPromise: Promise<void>;
  protected readyResolve!: (value: void | PromiseLike<void>) => void;
  protected readyReject!: (reason?: any) => void;

  constructor(socket: Socket) {
    super();
    this.socket = socket;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  protected writePackets(packets: Array<[number, Uint8Array]>): void {
    for (const [packetType, data] of packets) {
      this.writePacket(packetType, data);
    }
  }

  protected writePacket(packetType: number, data: Uint8Array): void {
    const header = new Uint8Array([packetType >> 8, packetType & 0xFF]);
    const length = data.length;
    const lengthBytes = new Uint8Array([length >> 8, length & 0xFF]);
    this.writeBytes([header, lengthBytes, data]);
  }

  protected writeBytes(data: Uint8Array[]): void {
    const flattened = new Uint8Array(data.reduce((acc, arr) => acc + arr.length, 0));
    let offset = 0;
    for (const arr of data) {
      flattened.set(arr, offset);
      offset += arr.length;
    }

    frameDebug.log(`Sending frame: [${Array.from(flattened).map(b => b.toString(16).padStart(2, '0')).join('')}]`);
    this.socket.write(flattened);
  }

  protected addToBuffer(data: Uint8Array): void {
    if (this.bufferLength === 0) {
      this.buffer = data;
    } else {
      if (!this.buffer) {
        throw new Error('Buffer should be set');
      }
      const newBuffer = new Uint8Array(this.bufferLength + data.length);
      newBuffer.set(this.buffer);
      newBuffer.set(data, this.bufferLength);
      this.buffer = newBuffer;
    }
    this.bufferLength += data.length;
  }

  protected removeFromBuffer(): void {
    const endOfFramePos = this.position;
    this.bufferLength -= endOfFramePos;
    if (this.bufferLength === 0) {
      this.buffer = null;
      return;
    }
    if (!this.buffer) {
      throw new Error('Buffer should be set');
    }
    this.buffer = this.buffer.slice(endOfFramePos, this.bufferLength + endOfFramePos);
    this.position = 0;
  }

  protected read(length: number): Uint8Array | null {
    const newPos = this.position + length;
    if (this.bufferLength < newPos) {
      return null;
    }
    if (!this.buffer) {
      throw new Error('Buffer should be set');
    }
    const originalPos = this.position;
    this.position = newPos;
    return this.buffer.slice(originalPos, newPos);
  }

  public handleError(error: Error): void {
    frameDebug.error('Frame error:', error);
    this.readyReject(error);
    this.emit('error', error);
  }

  public handleErrorAndClose(error: Error): void {
    frameDebug.error('Frame error (closing):', error);
    this.handleError(error);
    this.socket.end();
  }

  public abstract handleData(data: Uint8Array): void;
  public abstract sendMessage(message: any): void;
} 