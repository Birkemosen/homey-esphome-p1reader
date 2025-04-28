import Homey from 'homey';

export default class EsphomeP1ReaderApp extends Homey.App {
  private readonly debug = (...args: any[]) => {
    console.log('[esphome-p1reader:app]', ...args);
    this.homey.log('[esphome-p1reader:app]', ...args);
  };

  /**
   * OnInit is called when the app is initialized.
   */
  public override async onInit() {
    console.log('App starting initialization...');
    this.debug('ESPHome P1 Reader app has been initialized');
    this.log('ESPHome P1 Reader app has been initialized');
    this.homey.log('ESPHome P1 Reader app has been initialized');

    // Enable debug logging in both development and production
    if (process.env['NODE_ENV'] === 'development') {
      this.debug('Debug mode is enabled');
    }
  }

  public override async onUninit() {
    this.log('ESPHome P1 Reader app has been uninitialized');
    this.homey.log('ESPHome P1 Reader app has been uninitialized');
  }
}
