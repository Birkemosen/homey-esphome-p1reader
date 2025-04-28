export interface Logger {
  debug(...args: any[]): void;
  error(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  setEnabled(enabled: boolean): void;
}

export class ConsoleLogger implements Logger {
  private enabled: boolean = false;
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  debug(...args: any[]): void {
    if (this.enabled) {
      console.log(`[${this.prefix}]`, ...args);
    }
  }

  error(...args: any[]): void {
    console.error(`[${this.prefix}]`, ...args);
  }

  info(...args: any[]): void {
    console.info(`[${this.prefix}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[${this.prefix}]`, ...args);
  }
} 