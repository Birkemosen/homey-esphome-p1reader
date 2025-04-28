import Homey from 'homey';
import { Client } from '../../lib/esphome-ts/api/client/client.mts';
import { P1Reader, type CapabilityType } from '../../lib/p1reader.mts';
import net from 'net';

// Simple debug function that only logs in development
const debug = (...args: any[]) => {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG']) {
    console.log('[esphome-p1reader:device]', ...args);
  }
};

interface DiscoveryResult {
  id: string;
  lastSeen: Date;
  address?: string;
  host?: string;
  port?: number;
  name?: string;
  mac?: string;
  version?: string;
  platform?: string;
  board?: string;
  txt?: {
    version?: string;
    mac?: string;
    platform?: string;
    board?: string;
    friendly_name?: string;
  };
}

class EspHomeP1ReaderDevice extends Homey.Device {
  private readonly debug = debug;
  private device?: Client;
  private p1Reader?: P1Reader;

  public override async onInit() {
    this.log('ESPHome P1 Reader device has been initialized');

    try {
      // Get the initial settings from the device data
      const deviceData = this.getData();
      const currentSettings = this.getSettings();

      this.debug('Data and settings:', { currentSettings, deviceData });

      // Get the encryption key from the driver
      const driver = this.driver as any;
      this.debug('Driver encryption key:', driver.encryption_key);
      this.debug('Current settings encryption key:', currentSettings.encryption_key);

      if (driver.encryption_key) {
        this.debug('Found encryption key in driver:', driver.encryption_key);
        await this.setSettings({
          encryption_key: driver.encryption_key,
          port: String(currentSettings.port)
        });
        currentSettings.encryption_key = driver.encryption_key;
        this.debug('Updated settings with encryption key:', currentSettings.encryption_key);
      }

      this.debug('Current settings:', currentSettings);

      // Ensure we have required settings
      if (!currentSettings.ip && !currentSettings.host) {
        throw new Error('No IP address or hostname configured');
      }

      // Setup the client with the settings
      await this.setupClient({
        host: currentSettings.ip || currentSettings.host,
        port: Number(currentSettings.port),
        encryptionKey: currentSettings.encryption_key
      });

      this.debug('Device initialization completed successfully');
    } catch (error) {
      this.error('Failed to initialize device:', error);
      this.setUnavailable(getErrorMessage(error));
    }
  }

  /**
   * OnAdded is called when the user adds the device, called just after pairing.
   */
  public override async onAdded() {
    this.log('ESPHome P1 Reader has been added');

    // Get the encryption key from the driver and save it to device settings
    const driver = this.driver as any;
    if (driver.encryption_key) {
      this.log('Saving encryption key from driver to device settings', driver.encryption_key);
      await this.setSettings({ encryption_key: driver.encryption_key });
    }
  }

  /**
   * OnSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  public override async onSettings({
    changedKeys,
    newSettings,
  }: {
    changedKeys: string[];
    newSettings: Record<string, boolean | number | string | null | undefined>;
    oldSettings: Record<string, boolean | number | string | null | undefined>;
  }): Promise<string | void> {
    this.log('Device settings where changed');

    // Validate IP if changed
    if (changedKeys.includes('ip')) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(String(newSettings['ip']))) {
        throw new Error(this.homey.__('error.invalid_ip'));
      }
    }

    // If IP, Port or Encryption key has changed, disconnect and reconnect
    if (changedKeys.includes('ip') || changedKeys.includes('port') || changedKeys.includes('encryption_key')) {
      await this.setupClient({
        host: String(newSettings['ip'] || newSettings['host']),
        port: Number(newSettings['port']),
        encryptionKey: String(newSettings['encryption_key'])
      });
    }
  }

  /**
   * OnRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} _name The new name
   */
  public override async onRenamed(_name: string) {
    this.log('ESPHome P1 Reader was renamed');
  }

  /**
   * OnDeleted is called when the user deleted the device.
   */
  public override async onDeleted() {
    this.debug('Device deleted');

    // Disconnect and cleanup
    if (this.device) {
      try {
        this.device.terminate();
      } catch (error) {
        this.error('Error disconnecting device:', error);
      }
      this.device = undefined;
      this.p1Reader = undefined;
    }
  }

  /**
   * Return a truthy value here if the discovery result matches your device.
   *
   * @param discoveryResult
   * @returns
   */
  public override onDiscoveryResult(discoveryResult: DiscoveryResult): boolean {
    const deviceData = this.getData();
    const matches = Boolean(discoveryResult.id === deviceData.id || 
                   (discoveryResult.mac && discoveryResult.mac === deviceData.id) ||
                   (discoveryResult.txt?.mac && discoveryResult.txt.mac === deviceData.id));
    this.debug(`result match: ${matches}`, { 
      discoveryId: discoveryResult.id, 
      deviceId: deviceData.id,
      discoveryMac: discoveryResult.mac || discoveryResult.txt?.mac
    });
    return matches;
  }

  /**
   * This method will be executed once when the device has been found (onDiscoveryResult returned
   * true).
   *
   * @param discoveryResult
   */
  private readonly handleError = (error: unknown) => {
    this.debug('Device error:', error);
    this.setUnavailable(this.homey.__('error.unavailable'))
      .catch(err => this.error('Could not set unavailable', err));
  };

  private readonly handleMeasurement = ({ type, value }: { type: CapabilityType; value: number }) => {
    this.handleCapabilityUpdate(type, value).catch(error =>
      { this.error('Failed to handle measurement:', error); }
    );
  };

  public override onDiscoveryAvailable(discoveryResult: DiscoveryResult) {
    this.debug('available', discoveryResult);
    const settings = this.getSettings();
    let needsUpdate = false;

    // Update IP if changed
    if (typeof discoveryResult.address === 'string' && settings.ip !== discoveryResult.address) {
      settings.ip = discoveryResult.address;
      needsUpdate = true;
    }

    // Update host if changed
    if (typeof discoveryResult.host === 'string' && settings.host !== discoveryResult.host) {
      settings.host = discoveryResult.host;
      needsUpdate = true;
    }

    // Update port if changed
    if (typeof discoveryResult.port === 'number' && settings.port !== String(discoveryResult.port)) {
      settings.port = String(discoveryResult.port);
      needsUpdate = true;
    }

    // Update version if changed
    const version = discoveryResult.version || discoveryResult.txt?.version;
    if (version && settings.esp_home_version !== version) {
      settings.esp_home_version = version;
      needsUpdate = true;
    }

    // Update mac if changed
    const mac = discoveryResult.mac || discoveryResult.txt?.mac;
    if (mac && settings.mac !== mac) {
      settings.mac = mac;
      needsUpdate = true;
    }

    // Update settings if needed
    if (needsUpdate) {
      this.debug('Updating settings with discovery data:', settings);
      this.setSettings(settings).catch((err) => {
        this.error('Failed to update settings from discovery:', err);
      });
    }

    // Try to reconnect with new settings if we're not connected
    if (!this.device) {
      this.debug('Reconnecting with new settings:', settings);
      this.setupClient({
        host: settings.ip || settings.host as string,
        port: Number(settings.port),
        encryptionKey: settings.encryption_key as string
      }).catch(error => {
        this.error('Failed to setup client:', error);
      });
    }
  }

  private async handleCapabilityUpdate(type: CapabilityType, value: number) {
    try {
      this.debug('Handling capability update', { hasCapability: this.hasCapability(type), type, value });
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

  private async setupClient(clientSettings: {
    host: string;
    port: number;
    encryptionKey?: string;
  }) {
    try {
      this.debug('Starting client setup with settings:', clientSettings);

      // Validate settings
      if (!clientSettings.host) {
        throw new Error('No host/IP address specified');
      }

      if (!clientSettings.port || clientSettings.port < 1 || clientSettings.port > 65535) {
        throw new Error(`Invalid port number: ${clientSettings.port}`);
      }

      if (!clientSettings.encryptionKey) {
        throw new Error('Encryption key is required for this device');
      }

      this.debug('Validating network connectivity...');
      try {
        const socket = new net.Socket();
        await new Promise<void>((resolve, reject) => {
          socket.on('error', (error) => {
            reject(new Error(`Cannot connect to ${clientSettings.host}:${clientSettings.port} - ${error.message}`));
          });
          socket.on('connect', () => {
            socket.destroy();
            resolve();
          });
          socket.connect(clientSettings.port, clientSettings.host);
        });
        this.debug('Network connectivity test successful');
      } catch (error) {
        throw new Error(`Network connectivity test failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (this.device) {
        this.debug('Terminating existing device connection');
        this.device.terminate();
        this.device = undefined;
        this.p1Reader = undefined;
      }

      this.debug('Creating new client instance with Noise encryption');
      this.device = new Client(
        {
          addresses: [clientSettings.host],
          port: String(clientSettings.port),
          password: '', // password is empty since we're using encryption
          clientInfo: 'esphome-p1reader',
          keepalive: 20,
          noisePsk: clientSettings.encryptionKey,
          expectedName: null,
          expectedMac: null
        }
      );

      if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG'] === '1') {
        this.debug('Enabling ESPHOME-TS debug logging');
        this.device.enableLogging('all');
      } else {
        this.debug('Disabling ESPHOME-TS debug logging');
        this.device.disableLogging('all');
      }

      this.debug('Waiting for client to connect...');
      // Wait for client to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Connection timeout after 30 seconds. Please verify that:
1. The ESPHome device is powered on
2. The IP address (${clientSettings.host}) is correct
3. The port (${clientSettings.port}) is correct
4. The encryption key is correct
5. The device is accessible on your network`));
        }, 30000); // 30 second timeout

        this.device!.on('connect', () => {
          this.debug('Client connected successfully');
          clearTimeout(timeout);
          resolve();
        });

        this.device!.on('error', (error: Error) => {
          this.debug('Client connection error:', error);
          clearTimeout(timeout);
          reject(new Error(`Connection error: ${error.message}`));
        });

        // Start the connection process
        this.device!.connect()
          .catch((error: Error) => {
            this.debug('Connection process failed:', error);
            clearTimeout(timeout);
            reject(error);
          });
      });

      this.debug('Creating P1Reader instance');
      // Create P1Reader with the existing client
      this.p1Reader = new P1Reader(this.device);

      this.p1Reader.on('measurement', (measurement) => {
        this.debug('Received measurement:', measurement);
        this.handleMeasurement(measurement);
      });
      this.p1Reader.on('error', (error) => {
        this.debug('Received error from P1Reader:', error);
        this.handleError(error);
      });

      this.debug('Device connection established');
      this.setAvailable();

      // First get the entity list
      this.debug('Getting entity list');
      await this.p1Reader.getEntitiesList();
      this.debug('Entity list received');

      // Then subscribe to state changes
      this.debug('Subscribing to state changes');
      await this.p1Reader.subscribeStateChange();
      this.debug('State change subscription successful');
    } catch (error) {
      this.error('Failed to setup client:', error);
      this.setUnavailable(getErrorMessage(error));
      throw error; // Re-throw to be caught by onInit
    }
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {return error.message;}
  return String(error);
}

export default EspHomeP1ReaderDevice;