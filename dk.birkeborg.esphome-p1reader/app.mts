import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import Homey from 'homey';

// Enhanced debug function that logs in both development and production
const debug = (...args: any[]) => {
  console.log('[esphome-p1reader:app]', ...args);
};

class EsphomeP1ReaderApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    try {
      debug('Starting app initialization...');
      debug('Environment:', globalThis.process.env.NODE_ENV);
      debug('Node version:', globalThis.process.version);
      debug('Current directory:', globalThis.process.cwd());

      this.log('ESPHome P1 Reader app has been initialized');
      debug('App initialization completed successfully');

      // Enable debug logging in both development and production
      debug('Debug mode is enabled');
    } catch (error) {
      debug('Error during initialization:', error);
      this.error('Failed to initialize app:', error);
      throw error;
    }
  }
}

export default EsphomeP1ReaderApp;