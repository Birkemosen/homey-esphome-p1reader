import type { Logger } from '../../core/logger.mts';

let isDebugEnabled = false;
let logger: Logger | null = null;

export const frameDebug = {
  setLogger: (newLogger: Logger) => {
    logger = newLogger;
  },

  enable: () => {
    isDebugEnabled = true;
  },

  disable: () => {
    isDebugEnabled = false;
  },

  log: (...args: any[]) => {
    if (isDebugEnabled && logger) {
      if (typeof logger.debug === 'function') {
        logger.debug('[Frame]', ...args);
      } else if (typeof logger.info === 'function') {
        logger.info('[Frame]', ...args);
      } else {
        console.log('[Frame]', ...args);
      }
    }
  },

  error: (...args: any[]) => {
    if (logger) {
      if (typeof logger.error === 'function') {
        logger.error('[Frame]', ...args);
      } else if (typeof logger.warn === 'function') {
        logger.warn('[Frame]', ...args);
      } else {
        console.error('[Frame]', ...args);
      }
    }
  }
}; 