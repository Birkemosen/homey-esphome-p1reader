import { MessageTypes } from '../core/protocol.mts';
import { KEEP_ALIVE_TIMEOUT_RATIO } from './constants.mts';
import type { MessageHandler } from './message.mts';
import type { Logger } from '../core/logger.mts';

export class KeepAliveHandler {
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private sendPendingPing: boolean = false;
  private keepAliveTimeout: number;

  constructor(
    private messageHandler: MessageHandler,
    private logName: string,
    private keepAliveInterval: number,
    private debugEnabled: boolean = false,
    private logger: Logger
  ) {
    this.keepAliveTimeout = keepAliveInterval * KEEP_ALIVE_TIMEOUT_RATIO;
  }

  private debug(...args: any[]) {
    if (this.debugEnabled) {
      this.logger.debug(...args);
    }
  }

  public start(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
    }
    this.scheduleKeepAlive();
  }

  public stop(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    this.sendPendingPing = false;
  }

  private scheduleKeepAlive(): void {
    this.sendPendingPing = true;
    this.pingTimer = setTimeout(() => this.sendKeepAlive(), this.keepAliveInterval * 1000);
  }

  private async sendKeepAlive(): Promise<void> {
    if (!this.sendPendingPing) {
      return;
    }

    try {
      // Clear any existing pong timer
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }

      this.debug(`${this.logName}: Sending keepalive ping`);

      await this.messageHandler.sendMessageAwaitResponse(
        MessageTypes.PingRequest,
        new Uint8Array(),
        MessageTypes.PingResponse
      );

      this.debug(`${this.logName}: Keepalive ping successful`);

      // Reset the pending flag since we got a response
      this.sendPendingPing = false;

      // Set up new pong timer
      this.pongTimer = setTimeout(() => this.pongNotReceived(), this.keepAliveTimeout * 1000);

      // Schedule next ping
      this.scheduleKeepAlive();
    } catch (error) {
      this.debug(`${this.logName}: Failed to send keepalive:`, error);
      // Retry the ping
      this.scheduleKeepAlive();
    }
  }

  private pongNotReceived(): void {
    this.debug(`${this.logName}: Ping response not received after ${this.keepAliveTimeout} seconds`);
    // Reset the pong timer
    this.pongTimer = null;
    // Retry the ping
    this.scheduleKeepAlive();
  }
} 