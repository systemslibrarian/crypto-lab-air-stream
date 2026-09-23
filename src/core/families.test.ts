import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUTS, runFamilies, runKnownAnswerTests, runTwoTimePad } from './families'

describe('three-family execution', () => {
  it('runs and passes all three pinned KATs independently', async () => {
    const results = await runKnownAnswerTests()
    expect(results).toHaveLength(3)
    expect(results.map((result) => [result.id, result.pass])).toEqual([
      ['snow', true],
      ['aes', true],
      ['zuc', true],
    ])
  })

  it('produces three different streams from the same cellular tuple', async () => {
    const result = await runFamilies(DEFAULT_INPUTS)
    expect(result.ok).toBe(true)
    expect(result.allDifferent).toBe(true)
    expect(result.outputs.map((output) => output.bytes.length)).toEqual([32, 32, 32])
  })

  it.each(['snow', 'aes', 'zuc'] as const)(
    'recovers the second plaintext after %s keystream reuse',
    async (family) => {
      const result = await runTwoTimePad(
        family,
        DEFAULT_INPUTS,
        'MEET AT THE EAST GATE',
        'DELAY LAUNCH BY 2 HRS',
      )
      expect('error' in result).toBe(false)
      if ('error' in result) return
      expect(result.recovered).toBe(true)
      expect(result.recoveredText).toBe('DELAY LAUNCH BY 2 HRS')
    },
  )
})