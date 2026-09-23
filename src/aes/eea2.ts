import { validateKeystreamRequest } from '../core/cellular'

export interface AesEea2Trace {
  initialCounter: Uint8Array
  firstCounter: Uint8Array
  firstEncryptedCounter: Uint8Array
  nextCounter: Uint8Array
}

export type AesEea2Result =
  | { ok: true; bytes: Uint8Array; trace: AesEea2Trace }
  | { ok: false; error: string }

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asArrayBuffer(key), { name: 'AES-CBC' }, false, ['encrypt'])
}

async function encryptAesBlock(key: CryptoKey, block: Uint8Array): Promise<Uint8Array> {
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new Uint8Array(16) },
    key,
    asArrayBuffer(block),
  )
  return new Uint8Array(encrypted).slice(0, 16)
}

export function buildEea2Counter(count: number, bearer: number, direction: number): Uint8Array {
  const counter = new Uint8Array(16)
  counter[0] = count >>> 24
  counter[1] = count >>> 16
  counter[2] = count >>> 8
  counter[3] = count
  counter[4] = (bearer << 3) | (direction << 2)
  return counter
}

export function incrementEea2Counter(counter: Uint8Array): void {
  for (let index = 15; index >= 8; index -= 1) {
    counter[index] = (counter[index] + 1) & 0xff
    if (counter[index] !== 0) return
  }
}

export async function generateAesEea2Keystream(
  keyBytes: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  byteLength: number,
): Promise<AesEea2Result> {
  const error = validateKeystreamRequest(keyBytes, count, bearer, direction, byteLength)
  if (error) return { ok: false, error }

  const key = await importAesKey(keyBytes)
  const counter = buildEea2Counter(count, bearer, direction)
  const initialCounter = counter.slice()
  const bytes = new Uint8Array(byteLength)
  let firstEncryptedCounter = new Uint8Array(16)
  let nextCounter = new Uint8Array(16)
  let offset = 0

  while (offset < byteLength) {
    const isFirstBlock = offset === 0
    const encryptedCounter = await encryptAesBlock(key, counter)
    if (isFirstBlock) firstEncryptedCounter = encryptedCounter.slice()
    const take = Math.min(16, byteLength - offset)
    bytes.set(encryptedCounter.subarray(0, take), offset)
    offset += take
    incrementEea2Counter(counter)
    if (isFirstBlock) nextCounter = counter.slice()
  }

  return {
    ok: true,
    bytes,
    trace: {
      initialCounter,
      firstCounter: initialCounter.slice(),
      firstEncryptedCounter,
      nextCounter,
    },
  }
}

export async function encryptAesEea2(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  data: Uint8Array,
  bitLength = data.length * 8,
): Promise<AesEea2Result> {
  const outputLength = Math.ceil(bitLength / 8)
  if (!Number.isSafeInteger(bitLength) || bitLength < 1 || bitLength > data.length * 8) {
    return { ok: false, error: 'Bit length must select at least one bit within the input.' }
  }

  const stream = await generateAesEea2Keystream(key, count, bearer, direction, outputLength)
  if (!stream.ok) return stream

  const bytes = stream.bytes.map((byte, index) => byte ^ data[index])
  const unusedBits = (8 - (bitLength % 8)) % 8
  if (unusedBits > 0) bytes[bytes.length - 1] &= 0xff << unusedBits
  return { ok: true, bytes, trace: stream.trace }
}