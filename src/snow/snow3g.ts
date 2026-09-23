import { wordsToBytes } from '../core/bytes'
import { validateKeystreamRequest } from '../core/cellular'
import { SNOW_SQ } from './constants'

const UINT32_MASK = 0xffffffff

export interface SnowRoundTrace {
  wordIndex: number
  lfsrBefore: number[]
  fsmBefore: [number, number, number]
  fOutput: number
  keystreamWord: number
  feedback: number
  fsmAfter: [number, number, number]
  lfsrAfter: number[]
}

export type SnowResult =
  | { ok: true; bytes: Uint8Array; trace: SnowRoundTrace }
  | { ok: false; error: string }

function multiplyX(value: number, polynomial: number): number {
  return (((value << 1) ^ ((value & 0x80) === 0 ? 0 : polynomial)) & 0xff) >>> 0
}

function multiplyXPower(value: number, exponent: number, polynomial: number): number {
  let result = value
  for (let index = 0; index < exponent; index += 1) result = multiplyX(result, polynomial)
  return result
}

function multiplyByte(left: number, right: number): number {
  let result = 0
  let multiplicand = left
  let multiplier = right
  while (multiplier !== 0) {
    if ((multiplier & 1) !== 0) result ^= multiplicand
    multiplicand = multiplyX(multiplicand, 0x1b)
    multiplier >>>= 1
  }
  return result
}

function rotateByte(value: number, distance: number): number {
  return ((value << distance) | (value >>> (8 - distance))) & 0xff
}

function makeRijndaelSbox(): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, value) => {
    let inverse = 0
    if (value !== 0) {
      inverse = 1
      for (let exponent = 0; exponent < 254; exponent += 1) inverse = multiplyByte(inverse, value)
    }
    return (
      inverse ^
      rotateByte(inverse, 1) ^
      rotateByte(inverse, 2) ^
      rotateByte(inverse, 3) ^
      rotateByte(inverse, 4) ^
      0x63
    ) & 0xff
  })
}

const RIJNDAEL_SBOX = makeRijndaelSbox()

function transformWord(word: number, sbox: Uint8Array, polynomial: number): number {
  const bytes = [
    sbox[(word >>> 24) & 0xff],
    sbox[(word >>> 16) & 0xff],
    sbox[(word >>> 8) & 0xff],
    sbox[word & 0xff],
  ]
  const doubled = bytes.map((byte) => multiplyX(byte, polynomial))
  const output = [
    doubled[0] ^ bytes[1] ^ bytes[2] ^ doubled[3] ^ bytes[3],
    doubled[0] ^ bytes[0] ^ doubled[1] ^ bytes[2] ^ bytes[3],
    bytes[0] ^ doubled[1] ^ bytes[1] ^ doubled[2] ^ bytes[3],
    bytes[0] ^ bytes[1] ^ doubled[2] ^ bytes[2] ^ doubled[3],
  ]
  return ((output[0] << 24) | (output[1] << 16) | (output[2] << 8) | output[3]) >>> 0
}

function multiplyAlpha(value: number): number {
  return (
    (multiplyXPower(value, 23, 0xa9) << 24) |
    (multiplyXPower(value, 245, 0xa9) << 16) |
    (multiplyXPower(value, 48, 0xa9) << 8) |
    multiplyXPower(value, 239, 0xa9)
  ) >>> 0
}

function divideAlpha(value: number): number {
  return (
    (multiplyXPower(value, 16, 0xa9) << 24) |
    (multiplyXPower(value, 39, 0xa9) << 16) |
    (multiplyXPower(value, 6, 0xa9) << 8) |
    multiplyXPower(value, 64, 0xa9)
  ) >>> 0
}

function readWord(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0
}

function reverseWordOrder(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(16)
  for (let word = 0; word < 4; word += 1) {
    output.set(bytes.subarray((3 - word) * 4, (4 - word) * 4), word * 4)
  }
  return output
}

export class Snow3g {
  private readonly lfsr = new Uint32Array(16)
  private r1 = 0
  private r2 = 0
  private r3 = 0
  private wordIndex = 0

  constructor(key: Uint8Array, iv: Uint8Array) {
    if (key.length !== 16 || iv.length !== 16) {
      throw new Error('SNOW 3G requires a 16-byte key and a 16-byte IV.')
    }
    const keyWords = Uint32Array.from({ length: 4 }, (_, index) => readWord(key, index * 4))
    const ivWords = Uint32Array.from({ length: 4 }, (_, index) => readWord(iv, index * 4))
    this.initialize(keyWords, ivWords)
  }

  private initialize(key: Uint32Array, iv: Uint32Array): void {
    this.lfsr[15] = (key[3] ^ iv[0]) >>> 0
    this.lfsr[14] = key[2]
    this.lfsr[13] = key[1]
    this.lfsr[12] = (key[0] ^ iv[1]) >>> 0
    this.lfsr[11] = (key[3] ^ UINT32_MASK) >>> 0
    this.lfsr[10] = (key[2] ^ UINT32_MASK ^ iv[2]) >>> 0
    this.lfsr[9] = (key[1] ^ UINT32_MASK ^ iv[3]) >>> 0
    this.lfsr[8] = (key[0] ^ UINT32_MASK) >>> 0
    this.lfsr[7] = key[3]
    this.lfsr[6] = key[2]
    this.lfsr[5] = key[1]
    this.lfsr[4] = key[0]
    this.lfsr[3] = (key[3] ^ UINT32_MASK) >>> 0
    this.lfsr[2] = (key[2] ^ UINT32_MASK) >>> 0
    this.lfsr[1] = (key[1] ^ UINT32_MASK) >>> 0
    this.lfsr[0] = (key[0] ^ UINT32_MASK) >>> 0

    for (let round = 0; round < 32; round += 1) this.clockLfsr(this.clockFsm())
    this.clockFsm()
    this.clockLfsr()
  }

  private clockFsm(): number {
    const output = (((this.lfsr[15] + this.r1) >>> 0) ^ this.r2) >>> 0
    const nextR1 = (this.r2 + ((this.r3 ^ this.lfsr[5]) >>> 0)) >>> 0
    this.r3 = transformWord(this.r2, SNOW_SQ, 0x69)
    this.r2 = transformWord(this.r1, RIJNDAEL_SBOX, 0x1b)
    this.r1 = nextR1
    return output
  }

  private clockLfsr(initializationInput = 0): number {
    const feedback = (
      ((this.lfsr[0] << 8) & 0xffffff00) ^
      multiplyAlpha(this.lfsr[0] >>> 24) ^
      this.lfsr[2] ^
      (this.lfsr[11] >>> 8) ^
      divideAlpha(this.lfsr[11] & 0xff) ^
      initializationInput
    ) >>> 0
    this.lfsr.copyWithin(0, 1)
    this.lfsr[15] = feedback
    return feedback
  }

  nextWordWithTrace(): SnowRoundTrace {
    const lfsrBefore = Array.from(this.lfsr)
    const fsmBefore: [number, number, number] = [this.r1, this.r2, this.r3]
    const fOutput = this.clockFsm()
    const keystreamWord = (fOutput ^ this.lfsr[0]) >>> 0
    const feedback = this.clockLfsr()
    const trace: SnowRoundTrace = {
      wordIndex: this.wordIndex,
      lfsrBefore,
      fsmBefore,
      fOutput,
      keystreamWord,
      feedback,
      fsmAfter: [this.r1, this.r2, this.r3],
      lfsrAfter: Array.from(this.lfsr),
    }
    this.wordIndex += 1
    return trace
  }

  nextWord(): number {
    return this.nextWordWithTrace().keystreamWord
  }

  keystream(byteLength: number): Uint8Array {
    if (!Number.isSafeInteger(byteLength) || byteLength < 1) {
      throw new Error('Keystream length must be a positive whole number of bytes.')
    }
    const words = new Uint32Array(Math.ceil(byteLength / 4))
    for (let index = 0; index < words.length; index += 1) words[index] = this.nextWord()
    return wordsToBytes(words, byteLength)
  }
}

export function buildEea1Initialization(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
): { key: Uint8Array; iv: Uint8Array } {
  const bearerDirection = ((bearer << 27) | (direction << 26)) >>> 0
  const iv = wordsToBytes(Uint32Array.of(bearerDirection, count, bearerDirection, count))
  return { key: reverseWordOrder(key), iv }
}

export function generateSnowEea1Keystream(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  byteLength: number,
): SnowResult {
  const error = validateKeystreamRequest(key, count, bearer, direction, byteLength)
  if (error) return { ok: false, error }

  const initialization = buildEea1Initialization(key, count, bearer, direction)
  const generator = new Snow3g(initialization.key, initialization.iv)
  const trace = generator.nextWordWithTrace()
  const firstLength = Math.min(4, byteLength)
  const first = wordsToBytes(Uint32Array.of(trace.keystreamWord), firstLength)
  if (byteLength === firstLength) return { ok: true, bytes: first, trace }

  const bytes = new Uint8Array(byteLength)
  bytes.set(first)
  bytes.set(generator.keystream(byteLength - firstLength), firstLength)
  return { ok: true, bytes, trace }
}

export function encryptSnowEea1(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  data: Uint8Array,
  bitLength = data.length * 8,
): SnowResult {
  const outputLength = Math.ceil(bitLength / 8)
  if (!Number.isSafeInteger(bitLength) || bitLength < 1 || bitLength > data.length * 8) {
    return { ok: false, error: 'Bit length must select at least one bit within the input.' }
  }

  const stream = generateSnowEea1Keystream(key, count, bearer, direction, outputLength)
  if (!stream.ok) return stream

  const bytes = stream.bytes.map((byte, index) => byte ^ data[index])
  const unusedBits = (8 - (bitLength % 8)) % 8
  if (unusedBits > 0) bytes[bytes.length - 1] &= 0xff << unusedBits
  return { ok: true, bytes, trace: stream.trace }
}