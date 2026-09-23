import { encryptAesEea2, generateAesEea2Keystream, type AesEea2Trace } from '../aes/eea2'
import { encryptSnowEea1, generateSnowEea1Keystream, type SnowRoundTrace } from '../snow/snow3g'
import { encryptZucEea3, generateZucEea3Keystream, type ZucRoundTrace } from '../zuc/zuc'
import { bytesToHex, hexToBytes } from './bytes'

export type FamilyId = 'snow' | 'aes' | 'zuc'

// [extension] Add EIA/NIA result types beside these confidentiality outputs.

export interface CellularInputs {
  key: Uint8Array
  count: number
  bearer: number
  direction: 0 | 1
  byteLength: number
}

export interface FamilyOutput {
  id: FamilyId
  label: string
  algorithm: string
  bytes: Uint8Array
  hex: string
  trace: SnowRoundTrace | AesEea2Trace | ZucRoundTrace
}

export interface FamilyRun {
  ok: boolean
  outputs: FamilyOutput[]
  allDifferent: boolean
  error?: string
}

export interface KatResult {
  id: FamilyId
  label: string
  sourceLabel: string
  sourceUrl: string
  expected: string
  actual: string
  pass: boolean
}

export interface TwoTimePadResult {
  family: FamilyId
  plaintextA: Uint8Array
  plaintextB: Uint8Array
  ciphertextA: Uint8Array
  ciphertextB: Uint8Array
  ciphertextXor: Uint8Array
  recoveredB: Uint8Array
  recoveredText: string
  recovered: boolean
}

export const DEFAULT_INPUTS: CellularInputs = {
  key: hexToBytes('d3c5d592327fb11c4035c6680af8c6d1'),
  count: 0x398a59b4,
  bearer: 0x15,
  direction: 1,
  byteLength: 32,
}

async function generateFamily(id: FamilyId, inputs: CellularInputs): Promise<FamilyOutput | string> {
  const args = [inputs.key, inputs.count, inputs.bearer, inputs.direction, inputs.byteLength] as const
  const result = id === 'snow'
    ? generateSnowEea1Keystream(...args)
    : id === 'aes'
      ? await generateAesEea2Keystream(...args)
      : generateZucEea3Keystream(...args)

  if ('error' in result) return result.error
  const metadata = {
    snow: ['SNOW 3G', '128-EEA1'],
    aes: ['AES-CTR', '128-EEA2'],
    zuc: ['ZUC', '128-EEA3'],
  } as const
  return {
    id,
    label: metadata[id][0],
    algorithm: metadata[id][1],
    bytes: result.bytes,
    hex: bytesToHex(result.bytes),
    trace: result.trace,
  }
}

export async function runFamilies(inputs: CellularInputs): Promise<FamilyRun> {
  const outputsOrErrors = await Promise.all(
    (['snow', 'aes', 'zuc'] as const).map((id) => generateFamily(id, inputs)),
  )
  const error = outputsOrErrors.find((output): output is string => typeof output === 'string')
  if (error) return { ok: false, outputs: [], allDifferent: false, error }

  const outputs = outputsOrErrors as FamilyOutput[]
  return {
    ok: true,
    outputs,
    allDifferent: new Set(outputs.map((output) => output.hex)).size === outputs.length,
  }
}

export async function runKnownAnswerTests(): Promise<KatResult[]> {
  // [extension] Add NCA fixtures only when a public implementors' vector is available.
  const snowKey = hexToBytes('d3c5d592327fb11c4035c6680af8c6d1')
  const snowPlaintext = hexToBytes('981ba6824c1bfb1ab485472029b71d808ce33e2cc3c0b5fc1f3de8a6dc66b1f0')
  const snowExpected = '5d5bfe75eb04f68ce0a12377ea00b37d47c6a0ba06309155086a859c4341b378'
  const snow = encryptSnowEea1(snowKey, 0x398a59b4, 0x15, 1, snowPlaintext, 253)

  const aesExpected = 'e9fed8a63d155304d71df20bf3e82214b20ed7dad2f233dc3c22d7bdeeed8e78'
  const aes = await encryptAesEea2(snowKey, 0x398a59b4, 0x15, 1, snowPlaintext, 253)

  const zucKey = hexToBytes('173d14ba5003731d7a60049470f00a29')
  const zucPlaintext = hexToBytes('6cf65340735552ab0c9752fa6f9025fe0bd675d9005875b200000000')
  const zucExpected = 'a6c85fc66afb8533aafc2518dfe784940ee1e4b030238cc800'
  const zuc = encryptZucEea3(zucKey, 0x66035492, 0x0f, 0, zucPlaintext, 193)

  const rows = [
    {
      id: 'snow' as const,
      label: '128-EEA1 · SNOW 3G',
      sourceLabel: '3GPP TS 33.401 V13.1.0 Annex C.3 · test set 1',
      sourceUrl: 'https://www.etsi.org/deliver/etsi_ts/133400_133499/133401/',
      expected: snowExpected,
      actual: 'error' in snow ? snow.error : bytesToHex(snow.bytes),
    },
    {
      id: 'aes' as const,
      label: '128-EEA2 · AES-CTR',
      sourceLabel: '3GPP TS 33.401 V13.1.0 Annex C.1 · test set 1',
      sourceUrl: 'https://www.etsi.org/deliver/etsi_ts/133400_133499/133401/',
      expected: aesExpected,
      actual: 'error' in aes ? aes.error : bytesToHex(aes.bytes),
    },
    {
      id: 'zuc' as const,
      label: '128-EEA3 · ZUC',
      sourceLabel: 'ETSI/SAGE Document 3 v1.1 · test set 1',
      sourceUrl: 'https://www.gsma.com/aboutus/wp-content/uploads/2014/12/eea3eia3testdatav11.pdf',
      expected: zucExpected,
      actual: 'error' in zuc ? zuc.error : bytesToHex(zuc.bytes),
    },
  ]

  return rows.map((row) => ({ ...row, pass: row.actual === row.expected }))
}

function padMessage(message: Uint8Array, length: number): Uint8Array {
  const padded = new Uint8Array(length)
  padded.set(message)
  return padded
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  return left.map((byte, index) => byte ^ right[index])
}

export async function runTwoTimePad(
  family: FamilyId,
  inputs: Omit<CellularInputs, 'byteLength'>,
  messageA: string,
  messageB: string,
): Promise<TwoTimePadResult | { error: string }> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const encodedA = encoder.encode(messageA)
  const encodedB = encoder.encode(messageB)
  const length = Math.max(encodedA.length, encodedB.length)
  if (length < 1) return { error: 'Enter at least one message.' }

  const output = await generateFamily(family, { ...inputs, byteLength: length })
  if (typeof output === 'string') return { error: output }

  const plaintextA = padMessage(encodedA, length)
  const plaintextB = padMessage(encodedB, length)
  const ciphertextA = xor(plaintextA, output.bytes)
  const ciphertextB = xor(plaintextB, output.bytes)
  const ciphertextXor = xor(ciphertextA, ciphertextB)
  const recoveredB = xor(ciphertextXor, plaintextA)
  let recoveredText = ''
  try {
    recoveredText = decoder.decode(recoveredB).replaceAll('\0', '')
  } catch {
    return { error: 'Recovered bytes are not valid UTF-8.' }
  }

  return {
    family,
    plaintextA,
    plaintextB,
    ciphertextA,
    ciphertextB,
    ciphertextXor,
    recoveredB,
    recoveredText,
    recovered: recoveredB.every((byte, index) => byte === plaintextB[index]),
  }
}