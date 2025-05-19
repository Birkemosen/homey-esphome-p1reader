import { EventEmitter } from 'events';
// @ts-ignore - No type definitions available for multicast-dns
import Mdns from 'multicast-dns';

interface ESPHomeDevice {
  host?: string;
  address?: string;
  address6?: string;
  port?: number;
  [key: string]: any;
}

interface DiscoveryOptions {
  timeout?: number;
  [key: string]: any;
}

interface MDNSResponse {
  rcode: string;
  answers: Array<{
    type: string;
    name: string;
    data: any;
  }>;
  additionals: Array<{
    type: string;
    name: string;
    data: any;
  }>;
}

interface RInfo {
  address: string;
  family: string;
}

export class ESPHomeDiscovery extends EventEmitter {
  private options: DiscoveryOptions;
  private mdns: any;
  private response: (response: MDNSResponse, rinfo: RInfo) => void;

  constructor(options: DiscoveryOptions = {}) {
    super();
    this.options = options;
    this.response = this._response.bind(this);
  }

  public run(): void {
    this.mdns = Mdns(this.options);
    this.mdns.on('response', this.response);
    this.mdns.query({
      questions: [
        { name: '_esphomelib._tcp.local', type: 'ANY' },
      ],
    });
  }

  public destroy(): void {
    if (this.mdns) {
      this.mdns.off('response', this.response);
      this.mdns.destroy();
    }
    delete this.mdns;
  }

  private _response(response: MDNSResponse, rinfo: RInfo): void {
    let device: ESPHomeDevice = {};
    if (response.rcode === 'NOERROR') {
      // PTR - record
      const PTR = response.answers.find(
        ({ type, name }) => type === 'PTR' && name === '_esphomelib._tcp.local'
      ) || response.additionals.find(
        ({ type, name }) => type === 'PTR' && name === '_esphomelib._tcp.local'
      );

      if (PTR) {
        if (response.answers !== undefined) {
          device = { ...device, ...this._parse(response.answers) };
        }
        if (response.additionals !== undefined) {
          device = { ...device, ...this._parse(response.additionals) };
        }

        if (device.address === undefined || device.address6 === undefined) {
          if (device.address === undefined && rinfo.family === 'IPv4') {
            device.address = rinfo.address;
          }
          if (device.address6 === undefined && rinfo.family === 'IPv6') {
            device.address6 = rinfo.address;
          }
        }

        this.emit('info', device);
      }
    }
  }

  private _parse(response: Array<{ type: string; name: string; data: any }>): ESPHomeDevice {
    let device: ESPHomeDevice = {};
    response.find(({ name, type, data }) => {
      // A
      if (type === 'A') {
        device.host = name;
        device.address = data;
      }
      // AAAA
      if (type === 'AAAA') {
        device.host = name;
        device.address6 = data;
      }
      // TXT
      if (type === 'TXT') {
        data
          .toString()
          .split(',')
          .forEach((e: string) => {
            const array = e.split('=');
            if (array.length === 2) {
              const [key, value] = array;
              if (typeof key === 'string') {
                (device as Record<string, any>)[key] = value;
              }
            }
          });
      }
      // SRV
      if (type === 'SRV') {
        device.port = data.port;
      }
    });
    return device;
  }
}

// Create a proxy for the class to handle the Promise-based interface
export default new Proxy(ESPHomeDiscovery, {
  async apply(target: typeof ESPHomeDiscovery, thisArg: any, [{ timeout = 5, ...options } = {}]: [DiscoveryOptions]): Promise<ESPHomeDevice[]> {
    console.log('apply', target, thisArg, options);
    return new Promise((resolve) => {
      const devices: ESPHomeDevice[] = [];
      const discovery = new target(options);
      discovery.on('info', (info: ESPHomeDevice) => devices.push(info));
      discovery.run();
      setTimeout(() => {
        discovery.destroy();
        resolve(devices);
      }, timeout * 1000);
    });
  },
}); 