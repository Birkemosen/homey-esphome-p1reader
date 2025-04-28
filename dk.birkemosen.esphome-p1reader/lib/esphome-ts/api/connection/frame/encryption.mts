interface Cipher {
  encrypt(nonce: Uint8Array, data: Uint8Array): Uint8Array;
  decrypt(nonce: Uint8Array, data: Uint8Array): Uint8Array;
}

export interface CipherState {
  cipher: Cipher;
  n: number;
}

export class EncryptCipher {
  private readonly _encrypt: (nonce: Uint8Array, data: Uint8Array) => Uint8Array;
  private nonce: number;

  constructor(cipherState: CipherState) {
    this._encrypt = cipherState.cipher.encrypt;
    this.nonce = cipherState.n;
  }

  public encrypt(data: Uint8Array): Uint8Array {
    const nonce = new Uint8Array(12);
    nonce.set(new Uint8Array([0, 0, 0, 0, ...new Uint8Array(8)]));
    const ciphertext = this._encrypt(nonce, data);
    this.nonce += 1;
    return ciphertext;
  }
}

export class DecryptCipher {
  private readonly _decrypt: (nonce: Uint8Array, data: Uint8Array) => Uint8Array;
  private nonce: number;

  constructor(cipherState: CipherState) {
    this._decrypt = cipherState.cipher.decrypt;
    this.nonce = cipherState.n;
  }

  public decrypt(data: Uint8Array): Uint8Array {
    const nonce = new Uint8Array(12);
    nonce.set(new Uint8Array([0, 0, 0, 0, ...new Uint8Array(8)]));
    const plaintext = this._decrypt(nonce, data);
    this.nonce += 1;
    return plaintext;
  }
} 