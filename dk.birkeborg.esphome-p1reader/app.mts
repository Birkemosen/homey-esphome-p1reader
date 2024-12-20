import Homey from 'homey';
import Debug from 'debug';

// Configure debug to use less memory
Debug.enable('esphome-p1reader:*');
const debug = Debug('esphome-p1reader:app');

// Configure debug options
if (Debug.inspectOpts) {
  Debug.inspectOpts.depth = 2;
  Debug.inspectOpts.colors = false;
  Debug.inspectOpts.showHidden = false;
}

class EsphomeP1ReaderApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('ESPHome P1 Reader app has been initialized');

    // Only enable inspector in development
    if (process.env.DEBUG === '1' && process.env.NODE_ENV === 'development') {
      debug('Debug mode is enabled');
      const inspector = await import('inspector');
      inspector.open(9222, '0.0.0.0', true);
    }

    // Clean up debug logs periodically
    setInterval(() => {
      if (global.gc) {
        global.gc();
      }
      Debug.disable();
      Debug.enable('esphome-p1reader:*');
    }, 3600000); // Every hour
  }

  /**
   * onUninit is called when the app is destroyed.
   */
  async onUninit() {
    debug('Cleaning up...');
    Debug.disable();
    if (process.env.DEBUG === '1' && process.env.NODE_ENV === 'development') {
      const inspector = await import('inspector');
      inspector.close();
    }
  }
}

export default EsphomeP1ReaderApp;