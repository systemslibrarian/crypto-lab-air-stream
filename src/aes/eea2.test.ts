import { describe, expect, it } from 'vitest'
import { bytesToHex, hexToBytes } from '../core/bytes'
import { MAX_DEMO_KEYSTREAM_BYTES } from '../core/cellular'
import {
  buildEea2Counter,
  encryptAesEea2,
  generateAesEea2Keystream,
  incrementEea2Counter,
} from './eea2'

describe('128-EEA2', () => {
  it('matches 3GPP TS 33.401 Annex C.1, test set 1', async () => {
    const key = hexToBytes('d3c5d592327fb11c4035c6680af8c6d1')
    const plaintext = hexToBytes('981ba6824c1bfb1ab485472029b71d808ce33e2cc3c0b5fc1f3de8a6dc66b1f0')
    const result = await encryptAesEea2(key, 0x398a59b4, 0x15, 1, plaintext, 253)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(bytesToHex(result.bytes)).toBe('e9fed8a63d155304d71df20bf3e82214b20ed7dad2f233dc3c22d7bdeeed8e78')
    const recovered = await encryptAesEea2(key, 0x398a59b4, 0x15, 1, result.bytes, 253)
    expect(recovered.ok).toBe(true)
    if (recovered.ok) expect(recovered.bytes).toEqual(plaintext)
  })

  it('matches WebCrypto AES-CTR through an independent mode path', async () => {
    const keyBytes = hexToBytes('00112233445566778899aabbccddeeff')
    const counter = buildEea2Counter(0x10203040, 7, 1)
    const manual = await generateAesEea2Keystream(keyBytes, 0x10203040, 7, 1, 48)
    const key = await crypto.subtle.importKey('raw', new Uint8Array(keyBytes).buffer, 'AES-CTR', false, ['encrypt'])
    const native = await crypto.subtle.encrypt(
      { name: 'AES-CTR', counter: new Uint8Array(counter).buffer, length: 64 },
      key,
      new Uint8Array(48),
    )

    expect(manual.ok).toBe(true)
    if (!manual.ok) return
    expect(manual.bytes).toEqual(new Uint8Array(native))
    expect(bytesToHex(manual.trace.nextCounter)).toBe('102030403c0000000000000000000001')
  })

  it('increments only the low 64 bits of the counter', () => {
    const counter = hexToBytes('398a59b4ac000000ffffffffffffffff')
    incrementEea2Counter(counter)
    expect(bytesToHex(counter)).toBe('398a59b4ac0000000000000000000000')
  })

  it('fails closed for zero and oversized requests', async () => {
    const key = new Uint8Array(16)
    expect(await generateAesEea2Keystream(key, 0, 0, 0, 0)).toEqual({
      ok: false,
      error: `Length must be between 1 and ${MAX_DEMO_KEYSTREAM_BYTES} bytes.`,
    })
    expect((await generateAesEea2Keystream(key, 0, 0, 0, MAX_DEMO_KEYSTREAM_BYTES + 1)).ok).toBe(false)
    expect((await generateAesEea2Keystream(key, 0, 0, 0, MAX_DEMO_KEYSTREAM_BYTES)).ok).toBe(true)
    expect((await generateAesEea2Keystream(new Uint8Array(15), 0, 0, 0, 1)).ok).toBe(false)
    expect((await generateAesEea2Keystream(key, -1, 0, 0, 1)).ok).toBe(false)
    expect((await generateAesEea2Keystream(key, 0, 32, 0, 1)).ok).toBe(false)
    expect((await generateAesEea2Keystream(key, 0, 0, 2, 1)).ok).toBe(false)
  })
})