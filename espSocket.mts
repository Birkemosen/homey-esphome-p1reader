import type { CommandInterface } from '../components/index.mts';
import { MessageTypes, BytePositions, HEADER_FIRST_BYTE, HEADER_SIZE } from './core.mts';
import { NativeSocket } from './socket.mts';

// Enhanced debug function
const debug = (...args: any[]) => {
  console.log('[esphome-p1reader:espsocket]', ...args);
};

export interface ReadData {
  payload: Uint8Array;
  type: number;
}

export class EspSocket extends NativeSocket implements CommandInterface {
  constructor(host: string, port: string) {
    super(host, port);

    this.on('data', (data: ArrayBuffer) => {
      const buffer = new Uint8Array(data);
      let bytesTaken = 0;
      while (bytesTaken < buffer.length) {
        const length = buffer[bytesTaken + BytePositions.LENGTH];
        if (length === undefined) {break;}
        
        const subBuffer = buffer.slice(
          bytesTaken,
          bytesTaken + HEADER_SIZE + length,
        );

        if (subBuffer.length >= HEADER_SIZE &&
          subBuffer[BytePositions.ZERO] === HEADER_FIRST_BYTE) {
          const type = subBuffer[BytePositions.TYPE];
          if (type === undefined) {break;}
          
          const data: ReadData = {
            payload: subBuffer.slice(
              BytePositions.PAYLOAD,
              BytePositions.PAYLOAD + length,
            ),
            type,
          };
          this.emit('espData', data);
        }

        bytesTaken += HEADER_SIZE + length;
      }
    });
  }

  async sendEspMessage(type: MessageTypes, payload: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('Socket not connected');
    }

    // ESPHome protocol format:
    // 1. Zero byte (0x00)
    // 2. VarInt for message size (payload length)
    // 3. VarInt for message type
    // 4. Payload

    // Create buffer with space for header and payload
    const headerSize = 3; // 1 byte for zero, 1 for size, 1 for type
    const messageBuffer = new Uint8Array(headerSize + payload.length);
    
    // Set zero byte
    messageBuffer[0] = 0x00;
    
    // Set size (as single byte since payload is small)
    messageBuffer[1] = payload.length;
    
    // Set type
    messageBuffer[2] = type;
    
    // Copy payload
    messageBuffer.set(payload, headerSize);
    
    debug('Sending ESP message:', { 
      type, 
      payloadLength: payload.length,
      totalLength: messageBuffer.length,
      firstBytes: Array.from(messageBuffer.slice(0, 5))
    });
    
    await this.send(messageBuffer);
  }
}

export default EspSocket;
