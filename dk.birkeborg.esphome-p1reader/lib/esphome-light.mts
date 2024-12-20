import { Socket } from 'net';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import dgram from 'dgram';
import { Buffer } from 'buffer';

// Constants for mDNS
const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const ESPHOME_SERVICE = '_esphome._tcp.local';

// Minimal protobuf implementation for P1 meter messages
const encodeMessage = (type: number, data: Buffer): Buffer => {
  const length = data.length;
  const header = Buffer.alloc(3);
  header[0] = type;
  header[1] = length & 0xff;
  header[2] = (length >> 8) & 0xff;
  return Buffer.concat([header, data]);
};

const decodeMessage = (data: Buffer): { type: number; data: Buffer } => {
  const type = data[0];
  const length = data[1] | (data[2] << 8);
  return {
    type,
    data: data.slice(3, 3 + length)
  };
};

// Lightweight mDNS discovery implementation
class Discovery extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private devices: Map<string, { id: string; address: string; port: number; lastSeen: Date }> = new Map();
  private discoveryTimeout: NodeJS.Timeout | null = null;

  constructor(private timeout: number = 5000) {
    super();
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('error', (err) => {
          this.emit('error', err);
        });

        this.socket.on('message', (msg, rinfo) => {
          this.handleMDNSResponse(msg, rinfo);
        });

        this.socket.bind(MDNS_PORT, () => {
          try {
            this.socket?.addMembership(MDNS_ADDRESS);
            this.sendQuery();
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        // Set discovery timeout
        this.discoveryTimeout = setTimeout(() => {
          this.stop();
        }, this.timeout);

      } catch (err) {
        reject(err);
      }
    });
  }

  public stop(): void {
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }
    if (this.socket) {
      try {
        this.socket.dropMembership(MDNS_ADDRESS);
        this.socket.close();
      } catch (err) {
        // Ignore cleanup errors
      }
      this.socket = null;
    }
  }

  private sendQuery(): void {
    // Simple mDNS query packet for ESPHome devices
    const query = Buffer.from([
      0x00, 0x00, // Transaction ID
      0x00, 0x00, // Flags
      0x00, 0x01, // Questions
      0x00, 0x00, // Answer RRs
      0x00, 0x00, // Authority RRs
      0x00, 0x00, // Additional RRs
      // Query for _esphome._tcp.local
      0x09, 0x5f, 0x65, 0x73, 0x70, 0x68, 0x6f, 0x6d, 0x65,
      0x04, 0x5f, 0x74, 0x63, 0x70,
      0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c,
      0x00,
      0x00, 0x0c, // Type PTR
      0x00, 0x01  // Class IN
    ]);

    this.socket?.send(query, 0, query.length, MDNS_PORT, MDNS_ADDRESS);
  }

  private handleMDNSResponse(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      // Basic parsing of mDNS response
      // In a real implementation, we'd parse the DNS packet properly
      // This is a simplified version that looks for ESPHome service patterns

      const deviceId = this.extractDeviceId(msg);
      if (deviceId) {
        const device = {
          id: deviceId,
          address: rinfo.address,
          port: this.extractPort(msg) || 6053, // Default ESPHome port
          lastSeen: new Date()
        };

        this.devices.set(deviceId, device);
        this.emit('device', device);
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  private extractDeviceId(msg: Buffer): string | null {
    // Simple pattern matching for ESPHome device names
    // In real implementation, proper DNS packet parsing would be needed
    const data = msg.toString('utf8');
    const match = data.match(/([a-zA-Z0-9-]+)\.local/);
    return match ? match[1] : null;
  }

  private extractPort(msg: Buffer): number | null {
    // Simple pattern matching for SRV record port
    // In real implementation, proper DNS packet parsing would be needed
    const portMatch = msg.toString('hex').match(/0021.{4}(....)/);
    if (portMatch) {
      return parseInt(portMatch[1], 16);
    }
    return null;
  }
}

export class ESPHomeClient extends EventEmitter {
  private socket: Socket | null = null;
  private connected = false;
  private encryptionError = false;
  private host: string;
  private port: number;
  private encryptionKey?: string;
  private connectTimeout: number;
  private buffer = Buffer.alloc(0);
  private static discovery: Discovery | null = null;

  constructor(options: {
    host: string;
    port: number;
    encryption_key?: string;
    connect_timeout?: number;
  }) {
    super();
    this.host = options.host;
    this.port = options.port;
    this.encryptionKey = options.encryption_key;
    this.connectTimeout = options.connect_timeout || 30000;
  }

  public static async discover(timeout: number = 5000): Promise<void> {
    if (this.discovery) {
      this.discovery.stop();
    }

    this.discovery = new Discovery(timeout);
    await this.discovery.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        this.discovery?.stop();
        this.discovery = null;
        resolve();
      }, timeout);
    });
  }

  public static onDiscover(callback: (device: { id: string; address: string; port: number; lastSeen: Date }) => void): void {
    if (this.discovery) {
      this.discovery.on('device', callback);
    }
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket();

      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      }, this.connectTimeout);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.setupEncryption().then(resolve).catch(reject);
      });

      this.socket.on('data', (data) => this.handleData(data));

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        this.emit('error', error);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('error', new Error('Connection closed'));
      });

      this.socket.connect(this.port, this.host);
    });
  }

  public async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  public isDeviceConnected(): boolean {
    return this.connected;
  }

  public hasEncryptionError(): boolean {
    return this.encryptionError;
  }

  private async setupEncryption(): Promise<void> {
    if (!this.encryptionKey) {
      return;
    }

    try {
      const key = createHash('sha256').update(this.encryptionKey).digest();
      // Implement minimal encryption handshake here
      // For P1 reader, we can use a simpler encryption scheme
    } catch (error) {
      this.encryptionError = true;
      throw error;
    }
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 3) {
      const length = this.buffer[1] | (this.buffer[2] << 8);
      if (this.buffer.length < length + 3) break;

      const message = decodeMessage(this.buffer);
      this.buffer = this.buffer.slice(length + 3);

      // Handle only sensor messages (type 44)
      if (message.type === 44) {
        try {
          // Parse sensor data and emit measurement
          // Example: power reading
          const value = message.data.readFloatLE(0);
          this.emit('measurement', {
            type: 'measure_power.consumed',
            value
          });
        } catch (error) {
          this.emit('error', error);
        }
      }
    }
  }
}

export default ESPHomeClient; 