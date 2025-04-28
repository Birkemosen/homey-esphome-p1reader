import { BaseFrameHelper } from './base.mts';
import { MessageTypes } from '../../core/protocol.mts';
import { fromBinary, toBinary } from '@bufbuild/protobuf';
import type { Message } from '@bufbuild/protobuf';
import type { Socket } from 'net';
import { MESSAGE_TYPE_TO_PROTO } from '../../core/protocol.mts';
import { frameDebug } from './debug.mts';

interface NoiseModule {
  HandshakeState: (protocol: string, role: number) => any;
  constants: {
    NOISE_ROLE_INITIATOR: number;
  };
}

const NOISE_STATE_HELLO = 1;
const NOISE_STATE_HANDSHAKE = 2;
const NOISE_STATE_READY = 3;
const NOISE_STATE_CLOSED = 4;

const NOISE_HELLO = new Uint8Array([0x01, 0x00, 0x00]);

export class NoiseFrameHelper extends BaseFrameHelper {
  private client: any;
  private encryptor: any;
  private decryptor: any;
  private state = NOISE_STATE_CLOSED;
  private serverName: string | null = null;
  private serverMac: string | null = null;
  private expectedName: string | null = null;
  private expectedMac: string | null = null;

  constructor(socket: Socket, encryptionKey: string, expectedName?: string, expectedMac?: string) {
    super(socket);
    this.expectedName = expectedName || null;
    this.expectedMac = expectedMac || null;
    this.initializeNoise(encryptionKey).catch(error => {
      this.handleError(error as Error);
    });
  }

  private async initializeNoise(encryptionKey: string) {
    // The encryption key is base64 encoded, decode it first
    const psk = Buffer.from(encryptionKey, 'base64');
    if (psk.length !== 32) {
      throw new Error('Invalid encryption key length');
    }

    const createNoise = await import('@richardhopton/noise-c.wasm');
    const noise: NoiseModule = await new Promise((resolve) => createNoise.default(resolve));
    
    this.client = noise.HandshakeState(
      'Noise_NNpsk0_25519_ChaChaPoly_SHA256',
      noise.constants.NOISE_ROLE_INITIATOR
    );

    // Initialize with the decoded PSK
    this.client.Initialize(
      new Uint8Array(Buffer.from('NoiseAPIInit\x00\x00')),
      null,
      null,
      new Uint8Array(psk)
    );

    this.socket.on('data', (data: Buffer) => {
      this.handleData(new Uint8Array(data));
    });

    // Start the handshake process
    this.startHandshake();
  }

  public override handleData(data: Uint8Array) {
    this.addToBuffer(data);
    frameDebug.log('Received data:', data);
    frameDebug.log('Current state:', this.state);
    
    try {
      while (this.bufferLength >= 3 && this.buffer) {
        // Check the indicator byte
        const indicator = this.buffer[0];
        if (indicator !== 0x01) {
          if (indicator === 0x00) {
            this.handleErrorAndClose(new Error('Device is using plaintext protocol'));
          } else {
            this.handleErrorAndClose(new Error(`Invalid marker byte: ${indicator}`));
          }
          return;
        }

        // Calculate frame length from bytes 1-2 (big-endian)
        const frameLength = ((this.buffer[1] ?? 0) << 8) | (this.buffer[2] ?? 0);
        const frameEnd = 3 + frameLength;
        
        // Check if we have enough data for the frame
        if (this.bufferLength < frameEnd) {
          // Not enough data yet, wait for more
          return;
        }

        // Extract the frame data (skip the header)
        const frame = this.buffer.slice(3, frameEnd);
        // Remove the processed data from the buffer
        this.buffer = this.buffer.slice(frameEnd);
        this.bufferLength = this.buffer.length;
        
        frameDebug.log('Processing frame in state:', this.state);
        
        switch (this.state) {
          case NOISE_STATE_HELLO:
            this.handleHello(frame);
            break;
          case NOISE_STATE_HANDSHAKE:
            frameDebug.log('Calling handleHandshake with frame:', frame);
            this.handleHandshake(frame);
            break;
          case NOISE_STATE_READY:
            this.handleFrame(frame);
            break;
          case NOISE_STATE_CLOSED:
            this.handleClosed();
            break;
        }
      }
    } catch (error) {
      frameDebug.error('Error in handleData:', error);
      this.handleErrorAndClose(error as Error);
    }
  }

  private handleFrame(frame: Uint8Array): void {
    if (!this.decryptor) {
      frameDebug.error('Decryptor not initialized, state:', this.state);
      throw new Error('Decryption not initialized');
    }

    try {
      frameDebug.log('Processing frame:', frame);
      frameDebug.log('Frame length:', frame.length);
      frameDebug.log('Frame bytes:', Array.from(frame).map((value: unknown) => (value as number).toString(16).padStart(2, '0')).join(' '));
      
      // Decrypt the entire frame
      const decrypted = this.decryptor.DecryptWithAd([], frame);
      frameDebug.log('Decrypted frame:', decrypted);
      frameDebug.log('Decrypted length:', decrypted.length);
      frameDebug.log('Decrypted bytes:', Array.from(decrypted).map((value: unknown) => (value as number).toString(16).padStart(2, '0')).join(' '));
      
      if (decrypted.length < 4) {
        frameDebug.error('Decrypted message too short:', decrypted);
        this.handleErrorAndClose(new Error('Decrypted message too short'));
        return;
      }

      // Use deserialize to convert the decrypted binary to a message
      const message = this.deserialize(decrypted);
      if (message) {
        frameDebug.log('Deserialized message:', message);
        // Just emit the deserialized message, let message.mts handle the type detection
        this.emit('message', message);
      } else {
        frameDebug.error('Failed to deserialize message from decrypted data:', decrypted);
      }
    } catch (error) {
      frameDebug.error('Frame error:', error);
      this.handleErrorAndClose(error as Error);
    }
  }

  private handleHello(serverHello: Uint8Array): void {
    frameDebug.log('Received server hello');
    if (serverHello.length === 0) {
      this.handleErrorAndClose(new Error('ServerHello is empty'));
      return;
    }

    const chosenProto = serverHello[0];
    if (chosenProto !== 0x01) {
      this.handleErrorAndClose(new Error(`Unknown protocol selected by server: ${chosenProto}`));
      return;
    }

    // Check server name
    const serverNameEnd = serverHello.indexOf(0, 1);
    if (serverNameEnd !== -1) {
      this.serverName = Buffer.from(serverHello.slice(1, serverNameEnd)).toString();
      frameDebug.log('Server name:', this.serverName);
      if (this.expectedName && this.expectedName !== this.serverName) {
        this.handleErrorAndClose(new Error(`Server name mismatch: ${this.serverName}`));
        return;
      }

      // Check MAC address
      const macEnd = serverHello.indexOf(0, serverNameEnd + 1);
      if (macEnd !== -1) {
        this.serverMac = Buffer.from(serverHello.slice(serverNameEnd + 1, macEnd)).toString();
        frameDebug.log('Server MAC:', this.serverMac);
        if (this.expectedMac && this.expectedMac !== this.serverMac) {
          this.handleErrorAndClose(new Error(`Server MAC mismatch: ${this.serverMac}`));
          return;
        }
      }
    }

    this.state = NOISE_STATE_HANDSHAKE;
    frameDebug.log('Transitioned to handshake state');
  }

  private handleHandshake(serverHandshake: Uint8Array): void {
    try {
      // The server handshake message should start with [0,...] after frame processing
      // We need to check the header byte and get the message
      const header = serverHandshake[0];
      const message = serverHandshake.slice(1);
      
      if (header !== 0) {
        throw new Error(`Handshake failure: ${Buffer.from(message).toString()}`);
      }
            
      // Read the handshake message through the Noise protocol
      this.client.ReadMessage(message, true);
      
      // Split the connection to get encryptor and decryptor
      const [encryptor, decryptor] = this.client.Split();
      if (!encryptor || !decryptor) {
        throw new Error('Failed to create encryptor/decryptor');
      }

      this.encryptor = encryptor;
      this.decryptor = decryptor;
      
      // Clear any remaining data in the buffer before transitioning to ready state
      this.buffer = null;
      this.bufferLength = 0;
      
      this.state = NOISE_STATE_READY;
      this.ready = true;
      
      // Emit ready event to signal successful handshake
      frameDebug.log('Handshake successful, changed state to:', this.state);
      frameDebug.log('Encryptor/decryptor initialized:', {
        encryptor: !!this.encryptor,
        decryptor: !!this.decryptor
      });
      this.emit('ready');
    } catch (error) {
      frameDebug.error('Handshake error:', error);
      if (error instanceof Error) {
        frameDebug.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
        if (error.message.includes('MAC failure')) {
          this.handleErrorAndClose(new Error('Invalid encryption key'));
        } else {
          this.handleErrorAndClose(new Error('Handshake failed: ' + error.message));
        }
      } else {
        this.handleErrorAndClose(new Error('Handshake failed: Unknown error'));
      }
    }
  }

  private handleClosed(): void {
    this.handleError(new Error('Connection closed'));
  }

  private serialize(message: any): Uint8Array {
    frameDebug.log('Serializing message:', message);
    if (!message || !message.constructor) {
      throw new Error('Invalid message format');
    }

    try {
      const encoded = toBinary(message.constructor, message);
      const messageId = MessageTypes[message.$typeName as keyof typeof MessageTypes];
      if (!messageId) {
        throw new Error(`Unknown message type: ${message.$typeName}`);
      }
      const messageLength = encoded.length;
      return new Uint8Array([
        (messageId >> 8) & 0xFF,
        messageId & 0xFF,
        (messageLength >> 8) & 0xFF,
        messageLength & 0xFF,
        ...encoded
      ]);
    } catch (error) {
      frameDebug.error('Serialization error:', error);
      throw new Error(`Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private deserialize(buffer: Uint8Array): Message | null {
    if (buffer.length < 4) return null;
    const messageId = ((buffer[0] ?? 0) << 8) | (buffer[1] ?? 0);
    const messageLength = ((buffer[2] ?? 0) << 8) | (buffer[3] ?? 0);
    const messageData = buffer.slice(4, messageLength + 4);
    
    try {
      const schema = this.getSchemaForMessageId(messageId);
      if (!schema) {
        frameDebug.error(`Unknown message type: ${messageId}`);
        return null;
      }
      return fromBinary(schema, messageData);
    } catch (error) {
      frameDebug.error(`Failed to deserialize message type ${messageId}:`, error);
      this.handleErrorAndClose(new Error(`Failed to deserialize message type ${messageId}`));
      return null;
    }
  }

  private getSchemaForMessageId(messageId: number): any {
    try {
      const schema = MESSAGE_TYPE_TO_PROTO[messageId];
      if (!schema) {
        frameDebug.error(`Unknown message ID: ${messageId}`);
        return null;
      }
      return schema;
    } catch (error) {
      frameDebug.error(`Error getting schema for message ID ${messageId}:`, error);
      return null;
    }
  }

  public sendMessage(message: any): void {
    if (!this.encryptor) {
      throw new Error('Encryption not initialized');
    }

    frameDebug.log('Sending message:', message);
    frameDebug.log('Message type:', message.$typeName || message.type);

    let packet: Uint8Array;
    if (message.type && message.payload) {
      // Handle raw type/payload format
      const messageId = message.type;
      const messageLength = message.payload.length;
      packet = new Uint8Array([
        (messageId >> 8) & 0xFF,
        messageId & 0xFF,
        (messageLength >> 8) & 0xFF,
        messageLength & 0xFF,
        ...message.payload
      ]);
      frameDebug.log('Created raw packet:', packet);
    } else {
      // Handle protobuf message
      packet = this.serialize(message);
      frameDebug.log('Created protobuf packet:', packet);
    }

    // Encrypt the packet
    const encryptedMessage = this.encryptor.EncryptWithAd([], packet);
    frameDebug.log('Encrypted message:', encryptedMessage);
    
    // Format the frame with indicator byte and length
    const frameLength = encryptedMessage.length;
    const header = new Uint8Array([
      0x01, // Indicator byte
      (frameLength >> 8) & 0xFF,
      frameLength & 0xFF
    ]);
    
    // Write the frame
    frameDebug.log('Writing frame with header:', header);
    this.writeBytes([header, encryptedMessage]);
  }

  public startHandshake(): void {
    this.state = NOISE_STATE_HELLO;
    const handshakeFrame = this.client.WriteMessage();
    const frameLength = handshakeFrame.length + 1;
    const header = new Uint8Array([0x01, (frameLength >> 8) & 0xFF, frameLength & 0xFF]);
    this.writeBytes([NOISE_HELLO, header, new Uint8Array([0x00]), handshakeFrame]);
    frameDebug.log('Started handshake');
  }
} 