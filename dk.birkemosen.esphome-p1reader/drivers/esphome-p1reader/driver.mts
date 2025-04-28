import Homey from 'homey';

import { formatMacString } from '../../lib/util.mts';

interface DiscoveryResult {
  address: string;
  host: string;
  port: number;
  txt: {
    mac: string;
    version?: string;
  };
}

class ESPHomeP1ReaderDriver extends Homey.Driver {
  public encryption_key = '';

  private readonly discoveredDevices = new Map<string, any>();

  private devices: any[] = [];

  private selectedDevice: any = null;

  /**
   * OnInit is called when the driver is initialized.
   */
  public override async onInit() {
    this.log('ESPHome P1 Reader driver has been initialized');
  }

  public override async onPair(session: any) {
    this.devices = [];
    this.selectedDevice = null;
    this.encryption_key = '';

    session.setHandler('list_devices', async () => {
      const devices = await this.onPairListDevices();
      // Set the first device as selected by default
      if (devices.length > 0) {
        this.selectedDevice = devices[0];
        this.log('Default device selected:', this.selectedDevice.name);
      }
      return devices;
    });

    session.setHandler('encryption_key_entered', async (key: string) => {
      this.log('Encryption key entered');
      if (!this.selectedDevice) {
        this.error('No device available when setting encryption key');
        return false;
      }
      this.encryption_key = key;
      this.log('Encryption key saved:', key);
      return true;
    });

    session.setHandler('list_devices_selection', async (data: any[]) => {
      if (!data || data.length === 0) {
        this.error('No device selected');
        return null;
      }

      const selectedDevice = data[0];
      this.log('Device selected:', selectedDevice?.name);
      this.selectedDevice = selectedDevice;
      return selectedDevice;
    });
  }

  /**
   * OnPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  public override async onPairListDevices() {
    this.log('ESPHome P1 Reader driver, searching for devices');
    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = discoveryStrategy.getDiscoveryResults();

    // Clear existing devices
    this.devices = [];

    Object.values(discoveryResults).forEach((discoveryResult: unknown) => {
      if (!isValidDiscoveryResult(discoveryResult)) {
        this.error('Got invalid discovery result');
        return;
      }

      const device = {
        data: {
          id: discoveryResult.txt.mac,
        },
        name: `ESPHome P1 Reader (${formatMacString(discoveryResult.txt.mac)})`,
        settings: {
          encryption_key: this.encryption_key,
          esp_home_version: discoveryResult.txt.version,
          host: discoveryResult.host,
          ip: discoveryResult.address,
          mac: formatMacString(discoveryResult.txt.mac),
          port: discoveryResult.port,
        },
      };

      this.discoveredDevices.set(discoveryResult.txt.mac, device);
      this.devices.push(device);
    });

    return this.devices;
  }
}

function isValidDiscoveryResult(result: unknown): result is DiscoveryResult {
  if (!result || typeof result !== 'object') {return false;}
  const r = result as any;
  return (
    r.txt?.mac &&
    typeof r.address === 'string' &&
    typeof r.host === 'string' &&
    typeof r.port === 'number'
  );
}

export default ESPHomeP1ReaderDriver;