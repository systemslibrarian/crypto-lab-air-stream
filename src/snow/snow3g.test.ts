import { describe, expect, it } from 'vitest'
import { bytesToHex, hexToBytes } from '../core/bytes'
import { MAX_DEMO_KEYSTREAM_BYTES } from '../core/cellular'
import {
  buildEea1Initialization,
  encryptSnowEea1,
  generateSnowEea1Keystream,
  Snow3g,
} from './snow3g'

describe('SNOW 3G / 128-EEA1', () => {
  it('matches ETSI/SAGE SNOW 3G primitive test set 1', () => {
    const generator = new Snow3g(
      hexToBytes('2bd6459f82c5b300952c49104881ff48'),
      hexToBytes('ea024714ad5c4d84df1f9b251c0bf45f'),
    )
    expect(bytesToHex(generator.keystream(8))).toBe('abee97047ac31373')
  })

  it('matches 3GPP TS 33.401 Annex C.3, test set 1', () => {
    const key = hexToBytes('d3c5d592327fb11c4035c6680af8c6d1')
    const plaintext = hexToBytes('981ba6824c1bfb1ab485472029b71d808ce33e2cc3c0b5fc1f3de8a6dc66b1f0')
    const result = encryptSnowEea1(key, 0x398a59b4, 0x15, 1, plaintext, 253)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(bytesToHex(result.bytes)).toBe('5d5bfe75eb04f68ce0a12377ea00b37d47c6a0ba06309155086a859c4341b378')
    const recovered = encryptSnowEea1(key, 0x398a59b4, 0x15, 1, result.bytes, 253)
    expect(recovered.ok).toBe(true)
    if (recovered.ok) expect(recovered.bytes).toEqual(plaintext)
  })

  it('makes the EEA1 key reversal and IV word order explicit', () => {
    const initialization = buildEea1Initialization(
      hexToBytes('d3c5d592327fb11c4035c6680af8c6d1'),
      0x398a59b4,
      0x15,
      1,
    )
    expect(bytesToHex(initialization.key)).toBe('0af8c6d14035c668327fb11cd3c5d592')
    expect(bytesToHex(initialization.iv)).toBe('ac000000398a59b4ac000000398a59b4')
  })

  it('produces F from s15, R1 and R2 exactly as the specification clocks the FSM', () => {
    // ETSI/SAGE "Specification of the 3GPP Confidentiality and Integrity
    // Algorithms UEA2 & UIA2, Document 2: SNOW 3G Specification" v1.1, 3.4.6:
    // the FSM has two input words s15 and s5, three registers R1/R2/R3, and
    //   F = (s15 + R1) XOR R2          (+ is addition modulo 2^32)
    //   r = R2 + (R3 XOR s5),  R3 = S2(R2),  R2 = S1(R1),  R1 = r
    // and 4.2 STEP 2: z_t = F XOR s0. The mechanism diagram prints F and
    // z_t from this trace, so it must be these equations and not "R1 + R2".
    const generator = new Snow3g(
      hexToBytes('2bd6459f82c5b300952c49104881ff48'),
      hexToBytes('ea024714ad5c4d84df1f9b251c0bf45f'),
    )
    const trace = generator.nextWordWithTrace()
    const [r1, r2, r3] = trace.fsmBefore

    expect(trace.fOutput).toBe((((trace.lfsrBefore[15] + r1) >>> 0) ^ r2) >>> 0)
    expect(trace.fOutput).not.toBe(((r1 + r2) >>> 0))
    expect(trace.keystreamWord).toBe((trace.fOutput ^ trace.lfsrBefore[0]) >>> 0)

    // R3 is a real part of the state: it is carried, and it drives the R1 update.
    expect(trace.fsmBefore).toHaveLength(3)
    expect(trace.fsmAfter[0]).toBe((r2 + ((r3 ^ trace.lfsrBefore[5]) >>> 0)) >>> 0)
  })

  it('fails closed for zero and oversized requests', () => {
    const key = new Uint8Array(16)
    expect(generateSnowEea1Keystream(key, 0, 0, 0, 0)).toEqual({
      ok: false,
      error: `Length must be between 1 and ${MAX_DEMO_KEYSTREAM_BYTES} bytes.`,
    })
    expect(generateSnowEea1Keystream(key, 0, 0, 0, MAX_DEMO_KEYSTREAM_BYTES + 1).ok).toBe(false)
    expect(generateSnowEea1Keystream(key, 0, 0, 0, MAX_DEMO_KEYSTREAM_BYTES).ok).toBe(true)
    expect(generateSnowEea1Keystream(new Uint8Array(15), 0, 0, 0, 1).ok).toBe(false)
    expect(generateSnowEea1Keystream(key, -1, 0, 0, 1).ok).toBe(false)
    expect(generateSnowEea1Keystream(key, 0, 32, 0, 1).ok).toBe(false)
    expect(generateSnowEea1Keystream(key, 0, 0, 2, 1).ok).toBe(false)
  })
})