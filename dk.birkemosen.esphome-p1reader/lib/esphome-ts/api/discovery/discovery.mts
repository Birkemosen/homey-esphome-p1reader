import { EventEmitter } from 'events';
import { MDNSHandler } from './mdns.mts';
import type { ESPHomeDevice } from './types.mts';
import { formatDeviceInfo } from './types.mts';

export class ESPHomeDiscovery extends EventEmitter {
  private mdnsHandler: MDNSHandler;
  private devices: Map<string, ESPHomeDevice>;
  private queryInterval: NodeJS.Timeout | null;
  private debugEnabled: boolean = false;

  constructor() {
    super();
    this.mdnsHandler = new MDNSHandler();
    this.devices = new Map();
    this.queryInterval = null;
    this.debug('Discovery instance created');
  }

  private debug(message: string): void {
    if (this.debugEnabled) {
      console.log(`[ESPHomeDiscovery] ${message}`);
    }
  }

  public setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.mdnsHandler.setDebug(enabled);
    this.debug(`Debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  public start(): void {
    this.debug('Starting discovery process');
    this.mdnsHandler.start();

    this.mdnsHandler.socket.on('message', (msg, rinfo) => {
      this.debug(`Received mDNS message from ${rinfo.address}:${rinfo.port}`);
      try {
        const device = this.mdnsHandler.parseMDNSResponse(msg, rinfo);
        if (device) {
          this.debug(`Discovered device: ${device.name} (${device.address})`);
          this.devices.set(device.name, device);
          this.emit('deviceDiscovered', device);
        }
      } catch (error) {
        console.error('Error parsing mDNS response:', error);
      }
    });

    this.mdnsHandler.socket.on('error', (error) => {
      console.error('mDNS socket error:', error);
    });
      
    // Send periodic queries
    this.debug('Setting up periodic mDNS queries');
    this.queryInterval = setInterval(() => {
      this.debug('Sending periodic mDNS query');
      this.mdnsHandler.sendQuery();
    }, 5000);
      
    // Send initial query
    this.debug('Sending initial mDNS query');
    this.mdnsHandler.sendQuery();
  }

  public stop(): void {
    this.debug('Stopping discovery process');
    if (this.queryInterval) {
      clearInterval(this.queryInterval);
      this.queryInterval = null;
      this.debug('Cleared query interval');
    }
    this.mdnsHandler.stop();
    this.debug('Discovery process stopped');
  }
}

// CLI entry point
export async function discoverDevices(): Promise<void> {
  console.log('Starting ESPHome device discovery...');
  const discovery = new ESPHomeDiscovery();
  
  console.log(formatDeviceInfo({
    status: 'ONLINE',
    name: 'Name',
    address: 'Address',
    mac: 'MAC',
    version: 'Version',
    platform: 'Platform',
    board: 'Board'
  }));
  console.log('-'.repeat(120));

  discovery.on('deviceDiscovered', (device: ESPHomeDevice) => {
    console.log(formatDeviceInfo(device));
  });

  discovery.start();

  // Keep the process running until interrupted
  process.on('SIGINT', () => {
    console.log('\nStopping discovery...');
    discovery.stop();
    process.exit(0);
  });
} 