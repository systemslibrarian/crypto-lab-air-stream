import { createCipheriv } from 'node:crypto'
import { ZUC as ReferenceZuc } from '@li0ard/zuc'
import { expect, test, type Page } from '@playwright/test'

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  return left.map((byte, index) => byte ^ right[index])
}

function defaultCounter(): Uint8Array {
  return fromHex('398a59b4ac0000000000000000000000')
}

function incrementLow64(counter: Uint8Array): void {
  for (let index = 15; index >= 8; index -= 1) {
    counter[index] = (counter[index] + 1) & 0xff
    if (counter[index] !== 0) return
  }
}

function aesCtrReference(key: Uint8Array, length: number): Uint8Array {
  const output = new Uint8Array(length)
  const counter = defaultCounter()
  for (let offset = 0; offset < length; offset += 16) {
    const cipher = createCipheriv('aes-128-ecb', key, null).setAutoPadding(false)
    const block = new Uint8Array(cipher.update(counter))
    output.set(block.subarray(0, Math.min(16, length - offset)), offset)
    incrementLow64(counter)
  }
  return output
}

async function stream(page: Page, family: 'snow' | 'aes' | 'zuc'): Promise<string> {
  return (await page.locator(`[data-testid="stream-${family}"]`).textContent())?.trim() ?? ''
}

test.beforeEach(async ({ page }) => {
  await page.goto('.')
  await expect(page.locator('#family-summary')).toContainText('EXECUTED')
})

test('all three KAT verdicts are live and the same tuple yields distinct streams', async ({ page }) => {
  const badges = page.locator('[data-testid^="kat-"]')
  await expect(badges).toHaveCount(3)
  await expect(badges).toHaveText(['KAT MATCH', 'KAT MATCH', 'KAT MATCH'])

  const values = await Promise.all(
    (['snow', 'aes', 'zuc'] as const).map((family) => stream(page, family)),
  )
  expect(values.every((value) => /^[0-9a-f]{64}$/.test(value))).toBe(true)
  expect(new Set(values).size).toBe(3)
})

test('AES output equals independently encrypted counter blocks', async ({ page }) => {
  const expected = aesCtrReference(fromHex('d3c5d592327fb11c4035c6680af8c6d1'), 32)
  expect(await stream(page, 'aes')).toBe(toHex(expected))
})

test('ZUC output equals the independent @li0ard/zuc implementation', async ({ page }) => {
  const iv = defaultCounter()
  iv.set(iv.subarray(0, 8), 8)
  const expected = new ReferenceZuc(
    fromHex('d3c5d592327fb11c4035c6680af8c6d1'),
    iv,
  ).crypt(new Uint8Array(32))
  expect(await stream(page, 'zuc')).toBe(toHex(expected))
})

test('SNOW output agrees with the Annex C.3 fixture on every defined bit', async ({ page }) => {
  const plaintext = fromHex('981ba6824c1bfb1ab485472029b71d808ce33e2cc3c0b5fc1f3de8a6dc66b1f0')
  const ciphertext = fromHex('5d5bfe75eb04f68ce0a12377ea00b37d47c6a0ba06309155086a859c4341b378')
  const fixtureStream = xor(plaintext, ciphertext)
  const actual = fromHex(await stream(page, 'snow'))
  expect(actual.subarray(0, 31)).toEqual(fixtureStream.subarray(0, 31))
  expect(actual[31] & 0xf8).toBe(fixtureStream[31] & 0xf8)
})

test('changing an input retires stale output; re-entering the same value does not', async ({ page }) => {
  const original = await stream(page, 'aes')
  await page.locator('#count-input').fill('398a59b4')
  await expect(page.locator('#family-summary')).toContainText('EXECUTED')
  await expect(page.locator('[data-testid^="stream-"]')).toHaveCount(3)

  await page.locator('#count-input').fill('00000001')
  await expect(page.locator('#family-summary')).toContainText('RETIRED')
  await expect(page.locator('[data-testid^="stream-"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.locator('#family-summary')).toContainText('EXECUTED')
  expect(await stream(page, 'aes')).not.toBe(original)
})

test('malformed input fails closed and leaves no stale verdict', async ({ page }) => {
  const alert = page.locator('#input-error')
  await expect(alert).toBeHidden()
  expect(await alert.evaluate((element) => element.checkVisibility())).toBe(false)

  await page.locator('#key-input').fill('zz')
  await expect(page.locator('#family-summary')).toContainText('RETIRED')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(alert).toContainText('Hex must contain complete bytes')
  await expect(alert).toBeVisible()
  await expect(page.locator('[data-testid^="stream-"]')).toHaveCount(0)
})

test('the mechanism controls reach each real final-state trace', async ({ page }) => {
  for (const [family, id] of [['SNOW 3G', 'snow'], ['AES-CTR', 'aes'], ['ZUC', 'zuc']] as const) {
    await page.locator(`[data-mechanism="${id}"]`).click()
    await page.locator('#step-forward').click()
    await page.locator('#step-forward').click()
    await expect(page.locator('#step-label')).toContainText('Stage 3 of 3')
    await expect(page.locator(`[data-testid="mechanism-${id}"]`)).toBeVisible()
  }
})

for (const family of ['SNOW', 'AES', 'ZUC'] as const) {
  test(`${family} reuse recovers message B while every KAT remains green`, async ({ page }) => {
    await page.locator(`[data-attack-family="${family.toLowerCase()}"]`).click()
    const cipherA = fromHex((await page.locator('#cipher-a').textContent())?.trim() ?? '')
    const cipherB = fromHex((await page.locator('#cipher-b').textContent())?.trim() ?? '')
    const printedXor = fromHex((await page.locator('#cipher-xor').textContent())?.trim() ?? '')
    expect(xor(cipherA, cipherB)).toEqual(printedXor)
    const knownA = new TextEncoder().encode('MEET AT THE EAST GATE')
    const recovered = new TextDecoder().decode(xor(printedXor, knownA))
    expect(recovered).toBe('DELAY LAUNCH BY 2 HRS')
    await expect(page.locator('#recovery-verdict')).toHaveAttribute('data-recovered', 'true')
    await expect(page.locator('#recovered-text')).toContainText('DELAY LAUNCH BY 2 HRS')
    await expect(page.locator('[data-testid^="kat-"]')).toHaveText(['KAT MATCH', 'KAT MATCH', 'KAT MATCH'])
    await expect(page.locator('#negative-claim')).toBeVisible()
    await expect(page.locator('#negative-claim')).toContainText('confidentiality does not survive')
  })
}

test('the 256-bit material is visibly fenced and produces no claimed output', async ({ page }) => {
  const panel = page.locator('.forward-panel')
  await expect(panel.getByText('NOT KAT-VERIFIED HERE')).toBeVisible()
  await expect(panel).toContainText('does not generate 256-bit output')
  await expect(panel.locator('.stream-output')).toHaveCount(0)
  await expect(panel).toContainText('Illustrative only')
})

test('the page carries one banner, one heading, a dark pin, and the final scripture footer', async ({ page }) => {
  await expect(page.getByRole('banner')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
  await expect(page.locator('[data-theme-toggle], #theme-toggle, #cl-theme-toggle')).toHaveCount(0)
  const footer = page.locator('.scripture-footer')
  await expect(footer).toContainText('1 Corinthians 10:31')
  expect(await footer.evaluate((element) => element.parentElement?.lastElementChild === element)).toBe(true)
})

test('the rendered page does not overflow horizontally', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
})