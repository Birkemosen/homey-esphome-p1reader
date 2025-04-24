import Homey from 'homey';
import ESPHomeClient from '../../lib/esphome.mjs';

// Simple debug function that only logs in development
const debug = (...args: any[]) => {
  console.log('[esphome-p1reader:device]', ...args);
};

const CONNECT_TIMEOUT = 30 * 1000;

interface DiscoveryResult {
  id: string;
  lastSeen: Date;
  address?: string;
  port?: number;
  host?: string;
  txt?: {
    version?: string;
  };
}

type CapabilityType =
  | 'measure_power.consumed' | 'measure_power.produced'
  | 'meter_power.consumed' | 'meter_power.produced'
  | `measure_power.${'consumed' | 'produced'}.l${1 | 2 | 3}`
  | `measure_voltage.l${1 | 2 | 3}`
  | `measure_current.l${1 | 2 | 3}`;

/**
 * On Homey Pro (Early 2023) the host property in the discovery result ends with .local, on Homey
 * Pro (Early 2019) it doesn't.
 *
 * @param host
 * @returns
 */
function formatHostname(host: string) {
  if (host.endsWith('.local')) return host;
  return `${host}.local`;
}

/**
 * Get typed error message from unknown parameter.
 *
 * @param error
 * @returns
 */
function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

class EspHomeP1ReaderDevice extends Homey.Device {
  private debug = debug;
  private client?: ESPHomeClient;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.debug('ESPHome P1 Reader device has been initialized');

    // Get the initial settings from the device data
    const deviceData = this.getData();
    const currentSettings = this.getSettings();

    this.debug('Data and settings:', { deviceData, currentSettings });

    // Get the encryption key from the driver
    const driver = this.driver as any;
    if (driver.encryption_key) {
      this.debug('Found encryption key in driver');
      await this.setSettings({
        port: String(currentSettings.port),
        encryption_key: driver.encryption_key
      });
      currentSettings.encryption_key = driver.encryption_key;
    }

    // Setup the client with the settings
    await this.setupClient({
      host: currentSettings.host,
      port: Number(currentSettings.port),
      encryption_key: currentSettings.encryption_key
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('ESPHome P1 Reader has been added');

    // Get the encryption key from the driver and save it to device settings
    const driver = this.driver as any;
    if (driver.encryption_key) {
      this.log('Saving encryption key from driver to device settings', driver.encryption_key);
      await this.setSettings({ encryption_key: driver.encryption_key });
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: {
      [key: string]: boolean | string | number | undefined | null
    };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('Device settings where changed');

    // Validate IP if changed
    if (changedKeys.includes('ip')) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(String(newSettings.ip))) {
        throw new Error(this.homey.__('error.invalid_ip'));
      }
    }

    // If IP, Port or Encryption key has changed, disconnect and reconnect
    if (changedKeys.includes('ip') || changedKeys.includes('port') || changedKeys.includes('encryption_key')) {
      await this.setupClient({
        host: String(newSettings.ip),
        port: Number(newSettings.port),
        encryption_key: String(newSettings.encryption_key)
      });
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} _name The new name
   */
  async onRenamed(_name: string) {
    this.log('ESPHome P1 Reader was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.debug('Device deleted');

    // Disconnect and cleanup the client
    if (this.client) {
      try {
        // Remove listeners before disconnecting
        this.client.removeListener('measurement', this.handleMeasurement);
        this.client.removeListener('error', this.handleError);
        await this.client.disconnect();
      } catch (error) {
        this.error('Error disconnecting client:', error);
      }
      this.client = undefined;
    }

    // Clean up any remaining listeners
    this.removeAllListeners();
  }

  /**
  * Return a truthy value here if the discovery result matches your device.
  *
  * @param discoveryResult
  * @returns
  */
  onDiscoveryResult(discoveryResult: DiscoveryResult) {
    this.debug(`result match: ${discoveryResult.id === this.getData().id}`);
    return discoveryResult.id === this.getData().id;
  }

  /**
   * This method will be executed once when the device has been found (onDiscoveryResult returned
   * true).
   *
   * @param discoveryResult
   */
  async onDiscoveryAvailable(discoveryResult: DiscoveryResult) {
    this.debug('available', discoveryResult);
    const settings = this.getSettings();
    if (typeof discoveryResult.address === 'string' && settings.ip !== discoveryResult.address) {
      settings.ip = discoveryResult.address;
    }

    // Update settings if needed
    if (Object.keys(settings).length > 0) {
      this.setSettings(settings).catch((err) => {
        this.error('Failed to update IP in settings', err);
      });
    }

    // Try to reconnect with new settings if we're not connected
    if (!this.client?.isDeviceConnected()) {
      await this.setupClient({
        host: settings.ip as string,
        port: Number(settings.port),
        encryption_key: settings.encryption_key as string
      });
    }
  }

  private async handleCapabilityUpdate(type: CapabilityType, value: number) {
    try {
      this.debug('Handling capability update', { type, value, hasCapability: this.hasCapability(type) });
      if (this.hasCapability(type)) {
        await this.setCapabilityValue(type, value);
        this.debug('Successfully updated capability value', { type, value });
      } else {
        this.debug('Device does not have capability', { type });
      }
    } catch (error) {
      this.error(`Failed to set capability value for ${type}:`, getErrorMessage(error));
    }
  }

  private handleMeasurement = ({ type, value }: { type: string; value: number }) => {
    this.handleCapabilityUpdate(type as CapabilityType, value).catch(error =>
      this.error('Failed to handle measurement:', error)
    );
  };

  private handleError = (error: unknown) => {
    this.debug('Client error:', error);

    if (this.client?.hasEncryptionError()) {
      this.setUnavailable(this.homey.__('error.unavailable_encrypted'))
        .catch(err => this.error('Could not set unavailable', err));
      return;
    }

    if (!this.client?.isDeviceConnected() && !this.client?.hasEncryptionError()) {
      this.client?.connect().catch(connectError => {
        this.error('Could not re-connect:', connectError);
        this.setUnavailable(this.homey.__('error.unavailable'))
          .catch(err => this.error('Could not set unavailable', err));
      });
    }
  };

  private async setupClient(clientSettings: {
    host: string;
    port: number;
    encryption_key?: string;
  }) {
    try {
      if (this.client) {
        // Remove existing listeners before disconnecting
        this.client.removeListener('measurement', this.handleMeasurement);
        this.client.removeListener('error', this.handleError);
        await this.client.disconnect();
        this.client = undefined;
      }

      this.debug('Setting up client');
      this.client = new ESPHomeClient(clientSettings);

      // Use bound methods to prevent creating new function instances
      this.client.on('measurement', this.handleMeasurement);
      this.client.on('error', this.handleError);

      await this.client.connect();
      this.setAvailable();
    } catch (error) {
      this.error('Failed to setup client:', error);
      this.setUnavailable(getErrorMessage(error));
    }
  }
}

export default EspHomeP1ReaderDevice;