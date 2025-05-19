import Homey from 'homey';
import P1Reader from '../../lib/p1reader.mts';

// Constants
const DEBUG_PREFIX = '[esphome-p1reader:device]';
const DEFAULT_PORT = 6053;
const KEEPALIVE_INTERVAL = 15;

// Types
interface DeviceSettings {
  ip?: string;
  port?: number;
  encryptionKey?: string;
}

interface ClientSettings {
  host: string;
  port: number;
  encryptionKey?: string;
}

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

// Debug utility
const debug = (...args: any[]) => {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG'] === 'true') {
    console.log(DEBUG_PREFIX, ...args);
  }
};

// Error handling utility
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

class EspHomeP1ReaderDevice extends Homey.Device {
  private client?: P1Reader;
  private readonly debug = debug;

  /**
   * onInit is called when the device is initialized.
   */
  override async onInit(): Promise<void> {
    this.debug('Device initializing');

    try {
      const deviceData = this.getData();
      const currentSettings = this.getSettings() as DeviceSettings;

      this.debug('Initial data and settings:', { deviceData, currentSettings });

      // Handle encryption key from driver
      await this.handleDriverEncryptionKey(currentSettings);

      // Setup the client
      await this.setupClient({
        host: currentSettings.ip as string,
        port: Number(currentSettings.port) || DEFAULT_PORT,
        encryptionKey: currentSettings.encryptionKey
      });
    } catch (error) {
      this.error('Failed to initialize device:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Handle encryption key from driver
   */
  private async handleDriverEncryptionKey(currentSettings: DeviceSettings): Promise<void> {
    const driver = this.driver as { encryption_key?: string };
    if (driver.encryption_key) {
      this.debug('Found encryption key in driver');
      await this.setSettings({
        ...currentSettings,
        encryptionKey: driver.encryption_key
      });
      currentSettings.encryptionKey = driver.encryption_key;
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  override async onAdded(): Promise<void> {
    this.log('Device added');

    try {
      const driver = this.driver as { encryption_key?: string };
      if (driver.encryption_key) {
        this.log('Saving encryption key from driver to device settings');
        await this.setSettings({ encryptionKey: driver.encryption_key });
      }
    } catch (error) {
      this.error('Failed to handle device addition:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   */
  override async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: DeviceSettings;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('Device settings changed');

    try {
      // Validate IP if changed
      if (changedKeys.includes('ip')) {
        this.validateIpAddress(newSettings.ip);
      }

      // Reconnect if connection settings changed
      if (this.shouldReconnect(changedKeys)) {
        await this.setupClient({
          host: newSettings.ip as string,
          port: Number(newSettings.port) || DEFAULT_PORT,
          encryptionKey: newSettings.encryptionKey
        });
      }
    } catch (error) {
      this.error('Failed to update settings:', getErrorMessage(error));
      throw error;
    }
  }

  private validateIpAddress(ip?: string): void {
    if (!ip) return;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      throw new Error(this.homey.__('error.invalid_ip'));
    }
  }

  private shouldReconnect(changedKeys: string[]): boolean {
    return changedKeys.some(key => ['ip', 'port', 'encryption_key'].includes(key));
  }

  /**
   * onRenamed is called when the user updates the device's name.
   */
  override async onRenamed(_name: string): Promise<void> {
    this.log('Device renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  override async onDeleted(): Promise<void> {
    this.debug('Device deleted');
    await this.cleanupClient();
  }

  /**
   * Handle device discovery result
   */
  override onDiscoveryResult(discoveryResult: DiscoveryResult): boolean {
    const isMatch = discoveryResult.id === this.getData().id;
    this.debug(`Discovery result match: ${isMatch}`);
    return isMatch;
  }

  /**
   * Handle device discovery availability
   */
  override async onDiscoveryAvailable(discoveryResult: DiscoveryResult): Promise<void> {
    this.debug('Device discovered:', discoveryResult);

    try {
      const settings = this.getSettings() as DeviceSettings;
      await this.updateDiscoverySettings(settings, discoveryResult);
    } catch (error) {
      this.error('Failed to handle discovery:', getErrorMessage(error));
    }
  }

  private async updateDiscoverySettings(settings: DeviceSettings, discoveryResult: DiscoveryResult): Promise<void> {
    if (typeof discoveryResult.address === 'string' && settings.ip !== discoveryResult.address) {
      settings.ip = discoveryResult.address;
      await this.setSettings(settings);
    }

    if (!this.client?.isDeviceConnected() && !this.client?.isDeviceConnecting()) {
      await this.setupClient({
        host: settings.ip as string,
        port: Number(settings.port) || DEFAULT_PORT,
        encryptionKey: settings.encryptionKey
      });
    }
  }

  /**
   * Handle capability updates
   */
  private async handleCapabilityUpdate(type: CapabilityType, value: number): Promise<void> {
    try {
      this.debug('Updating capability', { type, value, hasCapability: this.hasCapability(type) });
      
      if (this.hasCapability(type)) {
        await this.setCapabilityValue(type, value);
        this.debug('Capability updated successfully', { type, value });
      } else {
        this.debug('Capability not available', { type });
      }
    } catch (error) {
      this.error(`Failed to update capability ${type}:`, getErrorMessage(error));
    }
  }

  /**
   * Handle measurement events
   */
  private handleMeasurement = ({ type, value }: { type: string; value: number }): void => {
    this.handleCapabilityUpdate(type as CapabilityType, value).catch(error =>
      this.error('Failed to handle measurement:', getErrorMessage(error))
    );
  };

  /**
   * Handle error events
   */
  private handleError = (error: unknown): void => {
    this.debug('Client error:', error);

    if (this.client?.hasEncryptionError()) {
      this.setUnavailable(this.homey.__('error.unavailable_encrypted'))
        .catch(err => this.error('Failed to set unavailable state:', getErrorMessage(err)));
      return;
    }

    if (!this.client?.isDeviceConnected() && !this.client?.hasEncryptionError()) {
      this.client?.connect().catch(connectError => {
        this.error('Reconnection failed:', getErrorMessage(connectError));
        this.setUnavailable(this.homey.__('error.unavailable'))
          .catch(err => this.error('Failed to set unavailable state:', getErrorMessage(err)));
      });
    }
  };

  private readonly errorHandler = this.handleError.bind(this);
  private readonly measurementHandler = this.handleMeasurement.bind(this);

  /**
   * Setup client connection
   */
  private async setupClient(clientSettings: ClientSettings): Promise<void> {
    try {
      await this.cleanupClient();

      this.debug('Setting up new client');
      this.client = new P1Reader({
        host: clientSettings.host,
        port: String(clientSettings.port),
        password: null,
        clientInfo: 'homey-esphome-p1reader',
        keepalive: KEEPALIVE_INTERVAL,
        encryptionKey: clientSettings.encryptionKey || null,
        expectedName: null,
        expectedMac: null
      });

      this.setupClientListeners();
      await this.client.connect();
      this.setAvailable();
    } catch (error) {
      this.error('Client setup failed:', getErrorMessage(error));
      this.setUnavailable(getErrorMessage(error));
    }
  }

  private setupClientListeners(): void {
    if (!this.client) return;

    this.client.removeAllListeners('measurement');
    this.client.removeAllListeners('error');
    
    this.client.on('measurement', this.measurementHandler);
    this.client.on('error', this.errorHandler);
  }

  private async cleanupClient(): Promise<void> {
    if (this.client) {
      try {
        this.client.removeAllListeners('measurement');
        this.client.removeAllListeners('error');
        await this.client.disconnect();
      } catch (error) {
        this.error('Client cleanup failed:', getErrorMessage(error));
      }
      this.client = undefined;
    }
  }
}

export default EspHomeP1ReaderDevice;