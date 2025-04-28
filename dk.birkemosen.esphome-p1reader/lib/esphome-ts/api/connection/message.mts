import { EventEmitter } from 'events';
import { MESSAGE_TYPE_TO_PROTO, MessageTypes } from '../core/protocol.mts';
import type { FrameHelper } from './frame/types.mts';
import type { Logger } from '../core/logger.mts';

export interface Message {
  type: number;
  payload: Uint8Array;
}

export class MessageHandler extends EventEmitter {
  private frameHelper: FrameHelper | null = null;
  private debugEnabled: boolean = false;
  private logName: string;
  private logger: Logger;
  private messageHandlers: Map<number, Set<(message: Message) => void>> = new Map();
  private pendingMessages: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }> = new Map();

  constructor(
    logName: string,
    frameHelper: FrameHelper | null,
    debugEnabled: boolean,
    logger: Logger
  ) {
    super();
    this.logName = logName;
    this.frameHelper = frameHelper;
    this.debugEnabled = debugEnabled;
    this.logger = logger;
  }

  public setFrameHelper(frameHelper: FrameHelper | null): void {
    this.frameHelper = frameHelper;
  }

  public setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  public addMessageHandler(type: number, handler: (message: Message) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  public removeMessageHandler(type: number, handler: (message: Message) => void): void {
    if (this.messageHandlers.has(type)) {
      this.messageHandlers.get(type)!.delete(handler);
    }
  }

  public async sendMessageAwaitResponse<T>(
    type: number,
    data: Uint8Array,
    responseType: number
  ): Promise<T> {
    if (!this.frameHelper) {
      throw new Error('Frame helper not initialized');
    }

    return new Promise<T>((resolve, reject) => {
      try {
        this.pendingMessages.set(responseType, { resolve, reject });
        this.frameHelper!.sendMessage({ type, payload: data });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public handleMessage(data: any): void {
    if (this.debugEnabled) {
      if (typeof this.logger.debug === 'function') {
        this.logger.debug(`${this.logName}: Handling message:`, data);
      } else if (typeof this.logger.info === 'function') {
        this.logger.info(`${this.logName}: Handling message:`, data);
      } else {
        console.log(`${this.logName}: Handling message:`, data);
      }
    }

    // Get the message type from the deserialized message's $typeName
    const messageType = MessageTypes[data.$typeName as keyof typeof MessageTypes];
    if (messageType === undefined) {
      if (this.debugEnabled) {
        this.logger.error(`${this.logName}: Unknown message type:`, data.$typeName);
      }
      return;
    }

    // Validate that the message type exists in MESSAGE_TYPE_TO_PROTO
    if (!MESSAGE_TYPE_TO_PROTO[messageType]) {
      if (this.debugEnabled) {
        this.logger.error(`${this.logName}: Invalid message type ${messageType} not found in protocol mapping`);
      }
      return;
    }

    // Check for pending messages first
    const pending = this.pendingMessages.get(messageType);
    if (pending) {
      this.pendingMessages.delete(messageType);
      try {
        pending.resolve(data);
      } catch (error) {
        if (typeof this.logger.error === 'function') {
          this.logger.error(`${this.logName}: Error processing message:`, error);
        } else if (typeof this.logger.warn === 'function') {
          this.logger.warn(`${this.logName}: Error processing message:`, error);
        } else {
          console.error(`${this.logName}: Error processing message:`, error);
        }
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    // Then check for registered handlers
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          if (typeof this.logger.error === 'function') {
            this.logger.error(`${this.logName}: Error in message handler:`, error);
          } else if (typeof this.logger.warn === 'function') {
            this.logger.warn(`${this.logName}: Error in message handler:`, error);
          } else {
            console.error(`${this.logName}: Error in message handler:`, error);
          }
        }
      });
    }
  }
} 