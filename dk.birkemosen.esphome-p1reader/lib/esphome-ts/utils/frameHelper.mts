import { EventEmitter } from 'events';
import net from 'net';
import { id_to_type, MESSAGE_TYPE_TO_PROTO } from './messages.mts';
import { fromBinary} from '@bufbuild/protobuf';

export class FrameHelper extends EventEmitter {
    protected host: string;
    protected port: number;
    protected buffer: Buffer;
    protected socket: net.Socket;

    constructor(host: string, port: number) {
        super();
        this.host = host;
        this.port = port;
        this.buffer = Buffer.from([]);
        this.socket = new net.Socket();

        this.socket.on('close', () => this.emit('close'));
        this.socket.on('error', (e: Error) => {
            this.emit('error', e);
            this.socket.end();
        });
    }

    public connect(): void {
        this.socket.connect(this.port, this.host);
    }

    public end(): void {
        this.socket.end();
    }

    public destroy(): void {
        this.socket.destroy();
    }

    public override removeAllListeners(event?: string | symbol): this {
        this.socket.removeAllListeners(event);
        super.removeAllListeners(event);
        return this;
    }

    public buildMessage(messageId: number, bytes: Uint8Array): any {
        try {
            const messageType = id_to_type[messageId];
            if (messageType) {
                const schema = MESSAGE_TYPE_TO_PROTO[messageId];
                if (schema) {
                    const message = fromBinary(schema, bytes);
                    if (typeof message === 'object' && message !== null) {
                        const msg = message as any;
                        msg.type = messageType;
                        msg.constructor = { type: messageType, id: messageId };
                        if (!('toObject' in msg)) {
                            msg.toObject = () => ({...msg});
                        }
                    }
                    return message;
                }
                throw new Error(`Schema not found for message type: ${messageType}`);
            }
            throw new Error(`Unknown message type for Id: ${messageId}`);
        } catch (e: unknown) {
            this.emit('error', new Error(`Failed to parse message (id ${messageId}): ${e instanceof Error ? e.message : String(e)}`));
            if (typeof id_to_type[messageId] !== 'undefined') {
                // We know this type and close connection to prevent error or freeze
                this.socket.end();
            }
        }
    }
} 