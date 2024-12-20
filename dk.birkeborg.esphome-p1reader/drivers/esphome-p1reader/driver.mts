import Homey from 'homey';
import formatMacString from '../../lib/util.mjs';

interface DiscoveryResult {
  txt: {
    mac: string;
    version?: string;
  };
  address: string;
  host: string;
  port: number;
}

function isValidDiscoveryResult(result: unknown): result is DiscoveryResult {
  if (!result || typeof result !== 'object') return false;
  const r = result as any;
  return (
    r.txt?.mac &&
    typeof r.address === 'string' &&
    typeof r.host === 'string' &&
    typeof r.port === 'number'
  );
}

class ESPHomeP1ReaderDriver extends Homey.Driver {
  private discoveredDevices: Map<string, any> = new Map();
  private devices: any[] = [];
  private selectedDevice: any = null;
  public encryption_key: string = '';

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('ESPHome P1 Reader driver has been initialized');
  }

  async onPair(session: any) {
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
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
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
        name: `ESPHome P1 Reader (${formatMacString(discoveryResult.txt.mac)})`,
        data: {
          id: discoveryResult.txt.mac,
        },
        settings: {
          mac: formatMacString(discoveryResult.txt.mac),
          ip: discoveryResult.address,
          host: discoveryResult.host,
          port: discoveryResult.port,
          esp_home_version: discoveryResult.txt.version,
          encryption_key: this.encryption_key,
        },
      };

      this.discoveredDevices.set(discoveryResult.txt.mac, device);
      this.devices.push(device);
    });

    return this.devices;
  }
}

export default ESPHomeP1ReaderDriver;