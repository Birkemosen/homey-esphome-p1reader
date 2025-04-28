import { EncryptCipher } from './encryption.mts';

const varuintCache = new Map<number, Uint8Array>();

function varuintToBytes(value: number): Uint8Array {
  if (value <= 0x7F) {
    return new Uint8Array([value]);
  }

  const result: number[] = [];
  while (value) {
    const temp = value & 0x7F;
    value >>= 7;
    if (value) {
      result.push(temp | 0x80);
    } else {
      result.push(temp);
    }
  }
  return new Uint8Array(result);
}

function cachedVaruintToBytes(value: number): Uint8Array {
  let cached = varuintCache.get(value);
  if (!cached) {
    cached = varuintToBytes(value);
    varuintCache.set(value, cached);
  }
  return cached;
}

export function makePlainTextPackets(packets: Array<[number, Uint8Array]>): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const [type, data] of packets) {
    out.push(new Uint8Array([0x00]));
    out.push(cachedVaruintToBytes(data.length));
    out.push(cachedVaruintToBytes(type));
    if (data.length > 0) {
      out.push(data);
    }
  }
  return out;
}

export function makeNoisePackets(
  packets: Array<[number, Uint8Array]>,
  encryptCipher: EncryptCipher
): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const [type, data] of packets) {
    const dataLength = data.length;
    const dataHeader = new Uint8Array([
      (type >> 8) & 0xFF,
      type & 0xFF,
      (dataLength >> 8) & 0xFF,
      dataLength & 0xFF
    ]);
    
    const frame = encryptCipher.encrypt(new Uint8Array([...dataHeader, ...data]));
    const frameLength = frame.length;
    const header = new Uint8Array([
      0x01,
      (frameLength >> 8) & 0xFF,
      frameLength & 0xFF
    ]);
    
    out.push(header);
    out.push(frame);
  }
  return out;
} 