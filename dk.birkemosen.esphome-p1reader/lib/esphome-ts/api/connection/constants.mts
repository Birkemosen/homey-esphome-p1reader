// Connection timing constants
export const KEEP_ALIVE_TIMEOUT_RATIO = 4.5;
export const HANDSHAKE_TIMEOUT = 30.0;
export const TCP_CONNECT_TIMEOUT = 60.0;
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_BACKOFF_BASE = 1.0; // seconds

// Message handling constants
export const MESSAGE_TIMEOUT = 30.0; // seconds
export const MAX_MESSAGE_RETRIES = 3;
export const MESSAGE_RETRY_DELAY = 1.0; // seconds

// Debug function
export const debug = (...args: any[]) => {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG'] === '1') {
    console.log('[esphome-p1reader:connection]', ...args);
  }
}; 