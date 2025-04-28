export class APIConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'APIConnectionError';
  }
}

export class APIConnectionCancelledError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'APIConnectionCancelledError';
  }
}

export class InvalidAuthAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthAPIError';
  }
}

export class ResolveAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveAPIError';
  }
}

export class ResolveTimeoutAPIError extends ResolveAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveTimeoutAPIError';
  }
}

export class ProtocolAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolAPIError';
  }
}

export class RequiresEncryptionAPIError extends ProtocolAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'RequiresEncryptionAPIError';
  }
}

export class SocketAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'SocketAPIError';
  }
}

export class SocketClosedAPIError extends SocketAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'SocketClosedAPIError';
  }
}

export class HandshakeAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'HandshakeAPIError';
  }
}

export class ConnectionNotEstablishedAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionNotEstablishedAPIError';
  }
}

export class BadNameAPIError extends APIConnectionError {
  constructor(message: string, public receivedName: string) {
    super(`${message}: received_name=${receivedName}`);
    this.name = 'BadNameAPIError';
  }
}

export class BadMACAddressAPIError extends APIConnectionError {
  constructor(message: string, public receivedName: string, public receivedMac: string) {
    super(`${message}: received_name=${receivedName}, received_mac=${receivedMac}`);
    this.name = 'BadMACAddressAPIError';
  }
}

export class InvalidEncryptionKeyAPIError extends HandshakeAPIError {
  constructor(message: string | null, public receivedName: string | null, public receivedMac: string | null) {
    super(`${message}: received_name=${receivedName}, received_mac=${receivedMac}`);
    this.name = 'InvalidEncryptionKeyAPIError';
  }
}

export class EncryptionErrorAPIError extends InvalidEncryptionKeyAPIError {
  constructor(message: string | null, receivedName: string | null, receivedMac: string | null) {
    super(message, receivedName, receivedMac);
    this.name = 'EncryptionErrorAPIError';
  }
}

export class EncryptionHelloAPIError extends HandshakeAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionHelloAPIError';
  }
}

export class EncryptionPlaintextAPIError extends HandshakeAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionPlaintextAPIError';
  }
}

export class PingFailedAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'PingFailedAPIError';
  }
}

export class TimeoutAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutAPIError';
  }
}

export class ReadFailedAPIError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'ReadFailedAPIError';
  }
}

export class UnhandledAPIConnectionError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'UnhandledAPIConnectionError';
  }
}

export class BluetoothConnectionDroppedError extends APIConnectionError {
  constructor(message: string) {
    super(message);
    this.name = 'BluetoothConnectionDroppedError';
  }
}

export interface BluetoothGATTError {
  address: number;
  handle: number;
  error: number;
}

export class BluetoothGATTAPIError extends APIConnectionError {
  public error: BluetoothGATTError;

  constructor(error: BluetoothGATTError) {
    super(
      `Bluetooth GATT Error ` +
      `address=${toHumanReadableAddress(error.address)} ` +
      `handle=${error.handle} ` +
      `error=${error.error} ` +
      `description=${toHumanReadableGattError(error.error)}`
    );
    this.name = 'BluetoothGATTAPIError';
    this.error = error;
  }
}

export const ESPHOME_GATT_ERRORS: Record<number, string> = {
  [-1]: "Not connected",  // Custom ESPHome error
  1: "Invalid handle",
  2: "Read not permitted",
  3: "Write not permitted",
  4: "Invalid PDU",
  5: "Insufficient authentication",
  6: "Request not supported",
  7: "Invalid offset",
  8: "Insufficient authorization",
  9: "Prepare queue full",
  10: "Attribute not found",
  11: "Attribute not long",
  12: "Insufficient key size",
  13: "Invalid attribute length",
  14: "Unlikely error",
  15: "Insufficient encryption",
  16: "Unsupported group type",
  17: "Insufficient resources",
  128: "Application error",
  129: "Internal error",
  130: "Wrong state",
  131: "Database full",
  132: "Busy",
  133: "Error",
  134: "Command started",
  135: "Illegal parameter",
  136: "Pending",
  137: "Auth fail",
  138: "More",
  139: "Invalid configuration",
  140: "Service started",
  141: "Encrypted no mitm",
  142: "Not encrypted",
  143: "Congested",
  144: "Duplicate registration",
  145: "Already open",
  146: "Cancel",
  224: "Stack RSP",
  225: "App RSP",
  239: "Unknown error",
  253: "CCC config error",
  254: "Procedure already in progress",
  255: "Out of range",
};

export function toHumanReadableAddress(address: number): string {
  const hex = address.toString(16).padStart(12, '0');
  return hex.match(/.{2}/g)?.join(':') || '';
}

export function toHumanReadableGattError(error: number): string {
  return ESPHOME_GATT_ERRORS[error] || "Unknown error";
} 