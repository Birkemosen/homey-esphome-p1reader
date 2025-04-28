// Protocol Constants
export const BytePositions = {
  ZERO: 0,
  LENGTH: 1,
  TYPE: 2,
  PAYLOAD: 3,
} as const;

export const HEADER_FIRST_BYTE = 0x00;
export const HEADER_SIZE = 3;

// Message handling constants
export const MESSAGE_TIMEOUT = 30.0; // seconds
export const MAX_MESSAGE_RETRIES = 3;
export const MESSAGE_RETRY_DELAY = 1.0; // seconds

// Connection constants
export const KEEP_ALIVE_TIMEOUT_RATIO = 4.5;
export const HANDSHAKE_TIMEOUT = 30.0;
export const TCP_CONNECT_TIMEOUT = 60.0;
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_BACKOFF_BASE = 1.0; // seconds
export const EXPECTED_DISCONNECT_COOLDOWN = 5.0;
export const MAXIMUM_BACKOFF_TRIES = 100;