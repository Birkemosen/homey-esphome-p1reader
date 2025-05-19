export function varuint_to_bytes(value: number): number[] {
    const bytes: number[] = [];
    while (value > 0) {
        bytes.push(value & 0x7f);
        value >>= 7;
        if (value > 0) {
            bytes[bytes.length - 1]! |= 0x80;
        }
    }
    return bytes;
}

export function recv_varuint(next: () => number | null): number | null {
    let value = 0;
    let shift = 0;
    let byte: number | null;

    while ((byte = next()) !== null) {
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) {
            return value;
        }
        shift += 7;
    }

    return null;
}

export function bytes_to_varuint(bytes: number[]): number | null {
    let result = 0;
    let bitpos = 0;
    for (const byte of bytes) {
        result |= (byte & 0x7F) << bitpos;
        bitpos += 7;
        if ((byte & 0x80) === 0) return result;
    }
    return null;
}

// Export the original implementations
export { FrameHelper } from './frameHelper.mts';
export { NoiseFrameHelper } from './noiseFrameHelper.mts';
export { PlaintextFrameHelper } from './plaintextFrameHelper.mts';