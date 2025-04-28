import { debug, MAX_RECONNECT_ATTEMPTS, RECONNECT_BACKOFF_BASE } from './constants.mts';
import { APIConnectionError } from '../core/errors.mts';

export class ReconnectHandler {
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private logName: string,
    private debugEnabled: boolean = false
  ) {}

  public async attemptReconnect(connectFn: () => Promise<void>): Promise<void> {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      throw new APIConnectionError(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    }

    const backoff = RECONNECT_BACKOFF_BASE * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    if (this.debugEnabled) {
      debug(`${this.logName}: Attempting to reconnect in ${backoff} seconds (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    }

    await new Promise(resolve => {
      this.reconnectTimer = setTimeout(resolve, backoff * 1000);
    });

    try {
      await connectFn();
      this.reconnectAttempts = 0; // Reset on successful connection
    } catch (error) {
      if (error instanceof APIConnectionError) {
        throw error;
      }
      await this.attemptReconnect(connectFn);
    }
  }

  public cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
} 