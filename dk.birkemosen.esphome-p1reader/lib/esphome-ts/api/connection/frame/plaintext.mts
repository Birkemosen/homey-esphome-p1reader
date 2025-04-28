import { BaseFrameHelper } from './base.mts';
import { MessageTypes } from '../../core/protocol.mts';
import { toBinary } from '@bufbuild/protobuf';
import type { Socket } from 'net';
import { frameDebug } from './debug.mts';

export class PlaintextFrameHelper extends BaseFrameHelper {
  constructor(socket: Socket) {
    super(socket);
    this.socket.on('data', (data: Buffer) => {
      this.handleData(new Uint8Array(data));
    });
  }

  public handleData(data: Uint8Array): void {
    this.addToBuffer(data);
    
    try {
      while (this.bufferLength >= 3) {
        const header = this.read(3);
        if (!header) return;

        const preamble = this.readVarUint(header);
        if (preamble !== 0x00) {
          this.errorOnIncorrectPreamble(preamble);
          return;
        }

        const length = this.readVarUint();
        if (length === -1) return;

        const messageType = this.readVarUint();
        if (messageType === -1) return;

        if (length === 0) {
          this.removeFromBuffer();
          this.emit('message', { type: messageType, payload: new Uint8Array(0) });
          continue;
        }

        const messageData = this.read(length);
        if (!messageData) return;

        this.removeFromBuffer();
        this.emit('message', { type: messageType, payload: messageData });
      }
    } catch (error) {
      frameDebug.error('Error in handleData:', error);
      this.handleError(error as Error);
    }
  }

  private readVarUint(buffer?: Uint8Array): number {
    let result = 0;
    let bitpos = 0;
    let pos = 0;

    while (pos < (buffer?.length ?? this.bufferLength)) {
      const val = buffer ? buffer[pos] : this.buffer![pos];
      if (val === undefined) return -1;
      pos++;
      result |= (val & 0x7F) << bitpos;
      if ((val & 0x80) === 0) {
        return result;
      }
      bitpos += 7;
    }
    return -1;
  }

  private errorOnIncorrectPreamble(preamble: number): void {
    if (preamble === 0x01) {
      this.handleErrorAndClose(new Error('Connection requires encryption'));
    } else {
      this.handleErrorAndClose(new Error(`Invalid preamble ${preamble.toString(16).padStart(2, '0')}`));
    }
  }

  public sendMessage(message: any): void {
    const packet = this.serialize(message);
    this.writePacket(MessageTypes[message.$typeName as keyof typeof MessageTypes], packet);
  }

  private serialize(message: any): Uint8Array {
    if (!message || !message.constructor) {
      throw new Error('Invalid message format');
    }
    return toBinary(message.constructor, message);
  }
} 