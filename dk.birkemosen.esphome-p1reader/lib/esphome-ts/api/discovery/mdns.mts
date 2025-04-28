import dgram from 'dgram';
import type { ESPHomeDevice, ESPHomeServiceProperties } from './types.mts';

export class MDNSHandler {
  public socket: dgram.Socket;
  private debugEnabled: boolean = false;

  constructor() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  private debug(message: string): void {
    if (this.debugEnabled) {
      console.log(`[ESPHomeDiscovery] ${message}`);
    }
  }

  public start(): void {
    this.socket.bind(5353, () => {
      this.socket.addMembership('224.0.0.251');
      this.socket.setMulticastTTL(255);
      this.socket.setMulticastLoopback(false);
    });
  }

  public stop(): void {
    this.socket.close();
  }

  public sendQuery(): void {
    const query = Buffer.from([
      0x00, 0x00, // Transaction ID
      0x00, 0x00, // Flags
      0x00, 0x01, // Questions
      0x00, 0x00, // Answer RRs
      0x00, 0x00, // Authority RRs
      0x00, 0x00, // Additional RRs
      // Query name: _esphomelib._tcp.local
      0x0b, 0x5f, 0x65, 0x73, 0x70, 0x68, 0x6f, 0x6d, 0x65, 0x6c, 0x69, 0x62,
      0x04, 0x5f, 0x74, 0x63, 0x70,
      0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c,
      0x00,
      0x00, 0x0c, // Type: PTR
      0x00, 0x01  // Class: IN
    ]);

    this.socket.send(query, 0, query.length, 5353, '224.0.0.251');
  }

  public parseMDNSResponse(msg: Buffer, rinfo: dgram.RemoteInfo): ESPHomeDevice | null {
    // Skip header (12 bytes)
    let offset = 12;
    
    // Parse questions section
    const questionCount = msg.readUInt16BE(4);
    for (let i = 0; i < questionCount; i++) {
      offset = this.skipName(msg, offset);
      offset += 4; // Skip type and class
    }
    
    // Parse answer section
    const answerCount = msg.readUInt16BE(6);
    for (let i = 0; i < answerCount; i++) {
      offset = this.skipName(msg, offset);
      const type = msg.readUInt16BE(offset);
      offset += 2;
      const class_ = msg.readUInt16BE(offset);
      offset += 2;
      const ttl = msg.readUInt32BE(offset);
      offset += 4;
      const rdlength = msg.readUInt16BE(offset);
      offset += 2;
      
      this.debug(`type: ${type}, class_: ${class_}, ttl: ${ttl}, rdlength: ${rdlength}`);

      if (type === 0x0c) { // PTR record
        const name = this.readName(msg, offset);
        if (name.includes('_esphomelib._tcp.local')) {
          return this.parseServiceInfo(name, rinfo);
        }
      }
      offset += rdlength;
    }
    
    return null;
  }

  private skipName(msg: Buffer, offset: number): number {
    while (msg[offset] !== 0) {
      const byte = msg[offset];
      if (byte === undefined) return offset;
      if ((byte & 0xc0) === 0xc0) {
        return offset + 2;
      }
      offset += byte + 1;
    }
    return offset + 1;
  }

  private readName(msg: Buffer, offset: number): string {
    const parts: string[] = [];
    while (msg[offset] !== 0) {
      const byte = msg[offset];
      if (byte === undefined) return parts.join('.');
      if ((byte & 0xc0) === 0xc0) {
        const pointer = ((byte & 0x3f) << 8) | (msg[offset + 1] || 0);
        parts.push(this.readName(msg, pointer));
        return parts.join('.');
      }
      const length = byte;
      offset++;
      parts.push(msg.slice(offset, offset + length).toString());
      offset += length;
    }
    return parts.join('.');
  }

  private parseServiceInfo(name: string, rinfo: dgram.RemoteInfo): ESPHomeDevice {
    const deviceName = name.split('.')[0] || 'unknown';
    const properties: ESPHomeServiceProperties = {};
    
    // Extract properties from the service name
    const parts = deviceName.split('_');
    if (parts.length >= 4) {
      properties.mac = parts[1];
      properties.version = parts[2];
      properties.platform = parts[3];
      properties.board = parts.slice(4).join('_');
    }

    return {
      status: 'ONLINE',
      name: deviceName,
      address: rinfo.address,
      mac: properties.mac || 'unknown',
      version: properties.version || 'unknown',
      platform: properties.platform || 'unknown',
      board: properties.board || 'unknown'
    };
  }
} 