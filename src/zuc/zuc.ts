import { wordsToBytes } from '../core/bytes'
import { validateKeystreamRequest } from '../core/cellular'
import { ZUC_D, ZUC_S0, ZUC_S1 } from './constants'

const MOD31 = 0x7fffffff

export interface ZucRoundTrace {
  wordIndex: number
  lfsrBefore: number[]
  bitReconstruction: [number, number, number, number]
  fsmBefore: [number, number]
  fOutput: number
  keystreamWord: number
  feedback: number
  fsmAfter: [number, number]
  lfsrAfter: number[]
}

export type ZucResult =
  | { ok: true; bytes: Uint8Array; trace: ZucRoundTrace }
  | { ok: false; error: string }

function add31(left: number, right: number): number {
  const sum = (left + right) >>> 0
  return ((sum & MOD31) + (sum >>> 31)) >>> 0
}

function rotate31(value: number, distance: number): number {
  return (((value << distance) | (value >>> (31 - distance))) & MOD31) >>> 0
}

function rotate32(value: number, distance: number): number {
  return ((value << distance) | (value >>> (32 - distance))) >>> 0
}

function linear1(value: number): number {
  return (
    value ^
    rotate32(value, 2) ^
    rotate32(value, 10) ^
    rotate32(value, 18) ^
    rotate32(value, 24)
  ) >>> 0
}

function linear2(value: number): number {
  return (
    value ^
    rotate32(value, 8) ^
    rotate32(value, 14) ^
    rotate32(value, 22) ^
    rotate32(value, 30)
  ) >>> 0
}

function substitute(value: number): number {
  return (
    (ZUC_S0[(value >>> 24) & 0xff] << 24) |
    (ZUC_S1[(value >>> 16) & 0xff] << 16) |
    (ZUC_S0[(value >>> 8) & 0xff] << 8) |
    ZUC_S1[value & 0xff]
  ) >>> 0
}

function makeLfsrWord(keyByte: number, constant: number, ivByte: number): number {
  return ((keyByte << 23) | (constant << 8) | ivByte) >>> 0
}

export class Zuc128 {
  private readonly lfsr = new Uint32Array(16)
  private readonly x = new Uint32Array(4)
  private r1 = 0
  private r2 = 0
  private wordIndex = 0

  constructor(key: Uint8Array, iv: Uint8Array) {
    if (key.length !== 16 || iv.length !== 16) {
      throw new Error('ZUC-128 requires a 16-byte key and a 16-byte IV.')
    }

    for (let index = 0; index < 16; index += 1) {
      this.lfsr[index] = makeLfsrWord(key[index], ZUC_D[index], iv[index])
    }

    for (let round = 0; round < 32; round += 1) {
      this.reconstructBits()
      const output = this.clockFsm()
      this.clockLfsr(output >>> 1)
    }

    this.reconstructBits()
    this.clockFsm()
    this.clockLfsr()
  }

  private reconstructBits(): void {
    this.x[0] = (((this.lfsr[15] & 0x7fff8000) << 1) | (this.lfsr[14] & 0xffff)) >>> 0
    this.x[1] = (((this.lfsr[11] & 0xffff) << 16) | (this.lfsr[9] >>> 15)) >>> 0
    this.x[2] = (((this.lfsr[7] & 0xffff) << 16) | (this.lfsr[5] >>> 15)) >>> 0
    this.x[3] = (((this.lfsr[2] & 0xffff) << 16) | (this.lfsr[0] >>> 15)) >>> 0
  }

  private clockFsm(): number {
    const output = ((((this.x[0] ^ this.r1) >>> 0) + this.r2) >>> 0)
    const w1 = (this.r1 + this.x[1]) >>> 0
    const w2 = (this.r2 ^ this.x[2]) >>> 0
    this.r1 = substitute(linear1(((w1 << 16) | (w2 >>> 16)) >>> 0))
    this.r2 = substitute(linear2(((w2 << 16) | (w1 >>> 16)) >>> 0))
    return output
  }

  private clockLfsr(initializationInput?: number): number {
    let feedback = this.lfsr[0]
    feedback = add31(feedback, rotate31(this.lfsr[0], 8))
    feedback = add31(feedback, rotate31(this.lfsr[4], 20))
    feedback = add31(feedback, rotate31(this.lfsr[10], 21))
    feedback = add31(feedback, rotate31(this.lfsr[13], 17))
    feedback = add31(feedback, rotate31(this.lfsr[15], 15))
    if (initializationInput !== undefined) feedback = add31(feedback, initializationInput)
    if (feedback === 0) feedback = MOD31

    this.lfsr.copyWithin(0, 1)
    this.lfsr[15] = feedback
    return feedback
  }

  nextWordWithTrace(): ZucRoundTrace {
    const lfsrBefore = Array.from(this.lfsr)
    const fsmBefore: [number, number] = [this.r1, this.r2]
    this.reconstructBits()
    const bitReconstruction: [number, number, number, number] = [
      this.x[0], this.x[1], this.x[2], this.x[3],
    ]
    const fOutput = this.clockFsm()
    const keystreamWord = (fOutput ^ this.x[3]) >>> 0
    const feedback = this.clockLfsr()
    const trace: ZucRoundTrace = {
      wordIndex: this.wordIndex,
      lfsrBefore,
      bitReconstruction,
      fsmBefore,
      fOutput,
      keystreamWord,
      feedback,
      fsmAfter: [this.r1, this.r2],
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

export function buildEea3Iv(count: number, bearer: number, direction: number): Uint8Array {
  const iv = new Uint8Array(16)
  iv[0] = count >>> 24
  iv[1] = count >>> 16
  iv[2] = count >>> 8
  iv[3] = count
  iv[4] = (bearer << 3) | (direction << 2)
  iv.set(iv.subarray(0, 8), 8)
  return iv
}

export function generateZucEea3Keystream(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  byteLength: number,
): ZucResult {
  const error = validateKeystreamRequest(key, count, bearer, direction, byteLength)
  if (error) return { ok: false, error }

  const generator = new Zuc128(key, buildEea3Iv(count, bearer, direction))
  const trace = generator.nextWordWithTrace()
  const remaining = byteLength - Math.min(4, byteLength)
  const first = wordsToBytes(Uint32Array.of(trace.keystreamWord), Math.min(4, byteLength))
  if (remaining === 0) return { ok: true, bytes: first, trace }

  const bytes = new Uint8Array(byteLength)
  bytes.set(first)
  bytes.set(generator.keystream(remaining), first.length)
  return { ok: true, bytes, trace }
}

export function encryptZucEea3(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  data: Uint8Array,
  bitLength = data.length * 8,
): ZucResult {
  const outputLength = Math.ceil(bitLength / 8)
  if (!Number.isSafeInteger(bitLength) || bitLength < 1 || bitLength > data.length * 8) {
    return { ok: false, error: 'Bit length must select at least one bit within the input.' }
  }

  const stream = generateZucEea3Keystream(key, count, bearer, direction, outputLength)
  if (!stream.ok) return stream

  const bytes = stream.bytes.map((byte, index) => byte ^ data[index])
  const unusedBits = (8 - (bitLength % 8)) % 8
  if (unusedBits > 0) bytes[bytes.length - 1] &= 0xff << unusedBits
  return { ok: true, bytes, trace: stream.trace }
}