import { NativeSocket, SocketConfiguration } from './socket.mts';
import { BytePositions, HEADER_FIRST_BYTE, HEADER_SIZE } from './bytePositions.mts';
import { MessageTypes } from './messages.mts';
import { CommandInterface } from '../components/index.mts';

export interface ReadData {
  type: number;
  payload: Uint8Array;
}

export class EspSocket extends NativeSocket implements CommandInterface {
  constructor(host: string, port: number, config?: SocketConfiguration) {
    super(host, port, config);

    this.on('data', (data: ArrayBuffer) => {
      const buffer = new Uint8Array(data);
      let bytesTaken = 0;
      while (bytesTaken < buffer.length) {
        const subBuffer = buffer.slice(
          bytesTaken,
          bytesTaken + HEADER_SIZE + buffer[bytesTaken + BytePositions.LENGTH],
        );

        if (subBuffer.length >= HEADER_SIZE &&
          subBuffer[BytePositions.ZERO] === HEADER_FIRST_BYTE) {
          const data: ReadData = {
            type: subBuffer[BytePositions.TYPE],
            payload: subBuffer.slice(
              BytePositions.PAYLOAD,
              BytePositions.PAYLOAD + subBuffer[BytePositions.LENGTH],
            ),
          };
          this.emit('espData', data);
        }

        bytesTaken += HEADER_SIZE + buffer[bytesTaken + BytePositions.LENGTH];
      }
    });
  }

  async sendEspMessage(type: MessageTypes, payload: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('Socket not connected');
    }

    const final = new Uint8Array([HEADER_FIRST_BYTE, payload.length, type, ...payload]);
    await this.send(final);
  }
}

export default EspSocket;
