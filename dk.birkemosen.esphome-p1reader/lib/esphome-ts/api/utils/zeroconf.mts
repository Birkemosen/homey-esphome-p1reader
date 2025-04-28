// Using require since we don't have type definitions
const bonjour = require('bonjour-service');

export type ZeroconfInstanceType = any;

export class ZeroconfManager {
  private _created: boolean = false;
  private _instance: any = null;

  constructor(zeroconf: ZeroconfInstanceType | null = null) {
    if (zeroconf !== null) {
      this.setInstance(zeroconf);
    }
  }

  get hasInstance(): boolean {
    return this._instance !== null;
  }

  setInstance(zc: ZeroconfInstanceType): void {
    if (this._instance) {
      if (this._instance === zc) {
        return;
      }
      throw new Error('Zeroconf instance already set to a different instance');
    }
    this._instance = zc;
  }

  private _createInstance(): void {
    console.debug('Creating new Bonjour instance');
    this._instance = bonjour();
    this._created = true;
  }

  getInstance(): any {
    if (!this._instance) {
      this._createInstance();
    }
    return this._instance;
  }

  async asyncClose(): Promise<void> {
    if (!this._created || !this._instance) {
      return;
    }
    await new Promise<void>((resolve) => {
      this._instance.destroy(() => {
        resolve();
      });
    });
    this._instance = null;
    this._created = false;
  }
} 