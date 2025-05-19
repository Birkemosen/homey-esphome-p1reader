import { FrameHelper } from './frameHelper.mts';
import createNoise from '@richardhopton/noise-c.wasm';
import { toBinary } from '@bufbuild/protobuf';
import { id_to_type, MESSAGE_TYPE_TO_PROTO, type_to_id } from './messages.mts';
// Define handshake states
enum HandshakeState {
    HELLO = 1,
    HANDSHAKE = 2,
    READY = 3,
    CLOSED = 4
}

// Define noise client types
interface NoiseClient {
    Initialize(prologue: Uint8Array, s: null, rs: null, psk: Uint8Array): void;
    WriteMessage(): Uint8Array;
    ReadMessage(message: Uint8Array, final: boolean): void;
    Split(): [NoiseCipher, NoiseCipher];
}

interface NoiseCipher {
    EncryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Uint8Array;
    DecryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
}

interface NoiseModule {
    HandshakeState(pattern: string, role: number): NoiseClient;
    constants: {
        NOISE_ROLE_INITIATOR: number;
    };
}

export class NoiseFrameHelper extends FrameHelper {
    private encryptionKey: string;
    private expectedServerName: string | null;
    private handshakeState: HandshakeState;
    private client: NoiseClient | null;
    private encryptor: NoiseCipher | null;
    private decryptor: NoiseCipher | null;

    constructor(host: string, port: number, encryptionKey: string, expectedServerName: string | null = null) {
        super(host, port);
        this.encryptionKey = encryptionKey;
        this.expectedServerName = expectedServerName;
        this.handshakeState = HandshakeState.CLOSED;
        this.client = null;
        this.encryptor = null;
        this.decryptor = null;

        this.socket.on('data', (data: Buffer) => this.onData(data));
        this.socket.on('connect', async () => await this.onConnect());
        this.socket.on('close', () => this.handshakeState = HandshakeState.CLOSED);
    }

    private async onConnect(): Promise<void> {
        const psk = Buffer.from(this.encryptionKey, 'base64');
        const noise = await new Promise<NoiseModule>((resolve) => createNoise(resolve));
        
        this.client = noise.HandshakeState(
            'Noise_NNpsk0_25519_ChaChaPoly_SHA256',
            noise.constants.NOISE_ROLE_INITIATOR
        );

        try {
            if (this.client) {
                this.client.Initialize(
                    new Uint8Array(Buffer.from('NoiseAPIInit\x00\x00')),
                    null,
                    null,
                    new Uint8Array(psk)
                );
            }
        } catch (e) {
            this.emit('error', e);
            this.end();
            return;
        }

        this.handshakeState = HandshakeState.HELLO;
        this.write(new Uint8Array());
    }

    private extractFrameBytes(): Buffer | null {
        if (this.buffer.length < 3) return null;
        const indicator = this.buffer[0];
        if (indicator !== 1) {
            throw new Error('Bad format. Expected 1 at the beginning');
        }

        const frameLength = (this.buffer[1] ?? 0) << 8 | (this.buffer[2] ?? 0);
        const frameEnd = 3 + frameLength;
        if (this.buffer.length < frameEnd) return null;
        const frame = this.buffer.subarray(3, frameEnd);
        this.buffer = this.buffer.subarray(frameEnd);
        return frame;
    }

    private onData(data: Buffer): void {
        this.emit('data', data);
        this.buffer = Buffer.concat([this.buffer, data]);
        let frame: Buffer | null;

        try {
            while ((frame = this.extractFrameBytes())) {
                console.log('Extracted frame, handshake state:', HandshakeState[this.handshakeState]);
                switch (this.handshakeState) {
                    case HandshakeState.HELLO:
                        this.handleHello(frame);
                        break;
                    case HandshakeState.HANDSHAKE:
                        this.handleHandshake(frame);
                        break;
                    case HandshakeState.READY:
                        if (this.decryptor) {
                            console.log('Decrypting frame...');
                            try {
                                const decrypted = this.decryptor.DecryptWithAd(new Uint8Array(), new Uint8Array(frame));
                                console.log('Decrypted frame length:', decrypted.length);
                                console.log('Decrypted frame bytes:', decrypted);
                                const message = this.deserialize(decrypted);
                                if (message) {
                                    console.log('Received message:', message.type);
                                    console.log('Message object:', message);
                                    this.emit('message', message);
                                } else {
                                    console.log('Failed to deserialize message');
                                }
                            } catch (e) {
                                console.error('Error decrypting/deserializing frame:', e);
                                this.emit('error', e);
                            }
                        } else {
                            console.log('No decryptor available');
                        }
                        break;
                }
            }
        } catch (e) {
            console.error('Error in onData:', e);
            this.emit('error', e);
            this.emit('unhandledData', data);
        }
    }

    private handleHello(serverHello: Buffer): void {
        const chosenProto = serverHello[0];
        if (chosenProto !== 1) {
            throw new Error(`Unknown protocol selected by server ${chosenProto}`);
        }

        if (this.expectedServerName) {
            const serverNameEnd = serverHello.indexOf('\0', 1);
            if (serverNameEnd > 1) {
                const serverName = serverHello
                    .subarray(1, serverNameEnd)
                    .toString();
                if (this.expectedServerName !== serverName) {
                    throw new Error(`Server name mismatch, expected ${this.expectedServerName}, got ${serverName}`);
                }
            }
        }

        this.handshakeState = HandshakeState.HANDSHAKE;
        if (this.client) {
            const message = this.client.WriteMessage();
            this.write(new Uint8Array([0, ...message]));
        }
    }

    private handleHandshake(serverHandshake: Buffer): void {
        const header = serverHandshake[0];
        const message = serverHandshake.subarray(1);
        
        if (header !== 0) {
            throw new Error(`Handshake failure: ${message.toString()}`);
        }

        if (this.client) {
            this.client.ReadMessage(new Uint8Array(message), true);
            const [encryptor, decryptor] = this.client.Split();
            this.encryptor = encryptor;
            this.decryptor = decryptor;
            this.handshakeState = HandshakeState.READY;
            console.log('Handshake complete, transitioning to READY state');
            this.emit('connect');
        }
    }

    public sendMessage(message: any): void {
        if (this.encryptor) {
            this.write(this.encryptor.EncryptWithAd(new Uint8Array(), this.serialize(message)));
        } else {
            console.error('Cannot send message: no encryptor available');
        }
    }

    private serialize(message: any): Uint8Array {
      // Get the message ID - this assumes message.constructor.id is available
      console.log('message', message);
      const messageId = type_to_id[message.$typeName];
      if (!messageId) {
          throw new Error('Cannot determine message ID: message.id is missing');
      }
        // Get the schema for this message type
        const schema = MESSAGE_TYPE_TO_PROTO[messageId];
        if (!schema) {
            throw new Error(`No schema found for message ID ${messageId}`);
        }
        
        // Use the standard toBinary method for serialization
        const encodedMessage = toBinary(schema, message);
        const messageLength = encodedMessage.length;
        
        // Create the frame with header
        return new Uint8Array([
            (messageId >> 8) & 255,
            messageId & 255,
            (messageLength >> 8) & 255,
            messageLength & 255,
            ...encodedMessage
        ]);
    }

    private deserialize(buffer: Uint8Array): any {
        if (buffer.length < 4) return null;
        const messageId = (buffer[0] ?? 0) << 8 | (buffer[1] ?? 0);
        const messageLength = (buffer[2] ?? 0) << 8 | (buffer[3] ?? 0);
        const message = this.buildMessage(messageId, buffer.subarray(4, messageLength + 4));
        if (message) {
            message.length = messageLength + 4;
        }
        return message;
    }

    private write(frame: Uint8Array): void {
        const frameLength = frame.length;
        const header = new Uint8Array([1, (frameLength >> 8) & 255, frameLength & 255]);
        const payload = Buffer.concat([Buffer.from(header), Buffer.from(frame)]);
        this.socket.write(payload);
    }

    public override buildMessage(messageId: number, bytes: Uint8Array): any {
        const message = super.buildMessage(messageId, bytes);
        if (message) {
            const messageType = id_to_type[messageId];
            if (messageType) {
                message.constructor.type = messageType;
            }
        }
        return message;
    }
} 