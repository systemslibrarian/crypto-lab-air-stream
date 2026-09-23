import { ZUC as ReferenceZuc } from '@li0ard/zuc'
import { describe, expect, it } from 'vitest'
import { bytesToHex, hexToBytes } from '../core/bytes'
import { MAX_DEMO_KEYSTREAM_BYTES } from '../core/cellular'
import {
  buildEea3Iv,
  encryptZucEea3,
  generateZucEea3Keystream,
  Zuc128,
} from './zuc'

describe('ZUC-128', () => {
  it('matches GSMA ZUC keystream test set 1 and @li0ard/zuc', () => {
    const key = new Uint8Array(16)
    const iv = new Uint8Array(16)
    const generator = new Zuc128(key, iv)
    const reference = new ReferenceZuc(key, iv)

    const actual = Uint32Array.of(generator.nextWord(), generator.nextWord())
    const independent = Uint32Array.of(reference.next_word(), reference.next_word())

    expect(actual).toEqual(Uint32Array.of(0x27bede74, 0x018082da))
    expect(actual).toEqual(independent)
  })

  it('matches 128-EEA3 implementors test data, test set 1', () => {
    const key = hexToBytes('173d14ba5003731d7a60049470f00a29')
    const plaintext = hexToBytes('6cf65340735552ab0c9752fa6f9025fe0bd675d9005875b200000000')
    const result = encryptZucEea3(key, 0x66035492, 0x0f, 0, plaintext, 193)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(bytesToHex(result.bytes)).toBe('a6c85fc66afb8533aafc2518dfe784940ee1e4b030238cc800')
    const recovered = encryptZucEea3(key, 0x66035492, 0x0f, 0, result.bytes, 193)
    expect(recovered.ok).toBe(true)
    if (recovered.ok) expect(recovered.bytes).toEqual(plaintext.subarray(0, Math.ceil(193 / 8)))
  })

  it('packs COUNT, bearer, and direction into the EEA3 IV', () => {
    expect(bytesToHex(buildEea3Iv(0x66035492, 0x0f, 1))).toBe(
      '660354927c000000660354927c000000',
    )
  })

  it('fails closed for zero and oversized requests', () => {
    const key = new Uint8Array(16)
    expect(generateZucEea3Keystream(key, 0, 0, 0, 0)).toEqual({
      ok: false,
      error: `Length must be between 1 and ${MAX_DEMO_KEYSTREAM_BYTES} bytes.`,
    })
    expect(generateZucEea3Keystream(key, 0, 0, 0, MAX_DEMO_KEYSTREAM_BYTES + 1).ok).toBe(false)
    expect(generateZucEea3Keystream(key, 0, 0, 0, MAX_DEMO_KEYSTREAM_BYTES).ok).toBe(true)
    expect(generateZucEea3Keystream(new Uint8Array(15), 0, 0, 0, 1).ok).toBe(false)
    expect(generateZucEea3Keystream(key, -1, 0, 0, 1).ok).toBe(false)
    expect(generateZucEea3Keystream(key, 0, 32, 0, 1).ok).toBe(false)
    expect(generateZucEea3Keystream(key, 0, 0, 2, 1).ok).toBe(false)
  })
})