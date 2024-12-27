import Homey from 'homey';

// Simple debug function that only logs in development
const debug = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[esphome-p1reader:app]', ...args);
  }
};

class EsphomeP1ReaderApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('ESPHome P1 Reader app has been initialized');

    // Only enable inspector in development
    if (process.env.NODE_ENV === 'development') {
      debug('Debug mode is enabled');
    }
  }
}

export default EsphomeP1ReaderApp;