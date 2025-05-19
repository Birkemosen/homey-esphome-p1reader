import { FrameHelper } from './frameHelper.mts';
import { varuint_to_bytes, recv_varuint } from './index.mts';
import { toBinary } from '@bufbuild/protobuf';

export class PlaintextFrameHelper extends FrameHelper {
    constructor(host: string, port: number) {
        super(host, port);
        this.socket.on('data', (data: Buffer) => this.onData(data));
        this.socket.on('connect', () => this.onConnect());
    }

  private serialize(message: any, schema: any): Buffer {
    const encoded = toBinary(schema, message);
    return Buffer.from([
      0,
      ...varuint_to_bytes(encoded.length),
      ...varuint_to_bytes(message.constructor.id),
      ...encoded,
    ]);
  }

    private deserialize(buffer: Buffer): any {
        if (buffer.length < 3) return null;

        let offset = 0;
        const next = (): number | null => {
            if (offset >= buffer.length) return null;
            const value = buffer[offset];
            offset++;
            return value ?? null;
        };

        const t = next();
        if (t === null) return null;
        
        if (t !== 0) {
            if (t === 1) throw new Error('Bad format: Encryption expected');
            throw new Error('Bad format. Expected 0 at the beginning');
        }

        const messageLength = recv_varuint(next);
        if (messageLength === null) return null;
        
        const messageId = recv_varuint(next);
        if (messageId === null) return null;
        
        if (messageLength + offset > buffer.length) return null;

        const message = this.buildMessage(messageId, buffer.subarray(offset, messageLength + offset));
        if (message) {
            message.length = messageLength + offset;
        }
        return message;
    }

    private onData(data: Buffer): void {
        this.emit('data', data);
        this.buffer = Buffer.concat([this.buffer, data]);
        let message: any;

        try {
            while ((message = this.deserialize(this.buffer))) {
                this.buffer = this.buffer.slice(message.length);
                this.emit('message', message);
            }
        } catch (e) {
            this.emit('error', e);
            this.emit('unhandledData', data);
        }
    }

    private onConnect(): void {
        this.emit('connect');
    }

    public sendMessage(schema: any, message: any): void {
        this.socket.write(this.serialize(schema, message));
    }
} 