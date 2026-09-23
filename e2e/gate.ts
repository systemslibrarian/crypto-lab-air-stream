import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { auditContrast, formatContrastFailures } from './contrast'
import { auditNonText, formatNonTextFailures } from './nontext'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
export const NARROW = { width: 380, height: 800 }

export function watchPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })
  return errors
}

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const timing = animation.effect?.getComputedTiming()
      return animation.playState !== 'running' || timing?.iterations === Infinity
    }),
  )
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.scrollWidth, `horizontal overflow in ${label}`).toBeLessThanOrEqual(dimensions.clientWidth)
}

async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const focusable = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
      .filter((element) => {
        const style = getComputedStyle(element)
        return ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY)
      })
      .filter((element) => element.tabIndex < 0 && !element.querySelector(focusable))
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
  })
  expect(unreachable, `scrolling regions without a keyboard route in ${label}`).toEqual([])
}

async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const selector = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => element.tabIndex >= 0 && element.checkVisibility({ checkVisibilityCSS: true }))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        let opacity = 1
        for (let node: Element | null = element; node; node = node.parentElement) {
          opacity *= Number.parseFloat(getComputedStyle(node).opacity)
        }
        return opacity === 0 || rect.width === 0 || rect.height === 0
      })
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`)
  })
  expect(invisible, `invisible focus targets in ${label}`).toEqual([])
}

export async function boot(page: Page): Promise<void> {
  page.setDefaultTimeout(20_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('.')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('banner')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app')
  await expect(page.locator('[data-testid^="kat-"]')).toHaveCount(3)
  await expect(page.locator('#family-summary')).toContainText('EXECUTED')
  await expect(page.locator('details[open]')).toHaveCount(0)
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page)
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze()

  const violations = [...wcag.violations, ...landmarks.violations].map((violation) => ({
    state: label,
    id: violation.id,
    nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 8),
  }))
  expect(violations, `axe violations in ${label}`).toEqual([])

  const incomplete = [...wcag.incomplete, ...landmarks.incomplete]
    .filter((result) => result.id !== 'color-contrast')
    .map((result) => ({ state: label, id: result.id, nodes: result.nodes.map((node) => node.target.join(' ')).slice(0, 8) }))
  expect(incomplete, `unresolved axe results in ${label}`).toEqual([])

  expect(
    Array.from(new Set(formatContrastFailures(await auditContrast(page)))),
    `measured contrast failures in ${label}`,
  ).toEqual([])
  expect(
    Array.from(new Set(formatContrastFailures(await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)))),
    `aria-hidden painted contrast failures in ${label}`,
  ).toEqual([])
  expect(formatNonTextFailures(await auditNonText(page)), `non-text contrast failures in ${label}`).toEqual([])
  await expectScrollersReachable(page, label)
  await expectNoInvisibleFocusTargets(page, label)
  await expectNoHorizontalOverflow(page, label)
}

export async function driveAllStates(page: Page, prefix: string): Promise<void> {
  await scan(page, `${prefix}: first paint`)

  await page.locator('.cl-skip-link').focus()
  await expect(page.locator('.cl-skip-link')).toBeFocused()
  await scan(page, `${prefix}: skip link focused`)

  for (const [family, id] of [['SNOW 3G', 'snow'], ['AES-CTR', 'aes'], ['ZUC', 'zuc']] as const) {
    await page.locator(`[data-mechanism="${id}"]`).click()
    await page.locator('#step-forward').click()
    await page.locator('#step-forward').click()
    await expect(page.locator('#step-label')).toContainText('Stage 3 of 3')
    await scan(page, `${prefix}: ${family} final mechanism stage`)
  }

  for (const family of ['snow', 'aes', 'zuc'] as const) {
    await page.locator(`[data-attack-family="${family}"]`).click()
    await expect(page.locator('#recovery-verdict')).toHaveAttribute('data-recovered', 'true')
    await scan(page, `${prefix}: ${family} reuse recovery`)
  }

  for (const summary of await page.locator('details > summary').all()) {
    await summary.click()
    await scan(page, `${prefix}: disclosure open`)
  }

  await page.locator('#count-input').fill('00000001')
  await expect(page.locator('#family-summary')).toContainText('RETIRED')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.locator('#family-summary')).toContainText('EXECUTED')
  await scan(page, `${prefix}: changed tuple`)

  await page.locator('#key-input').fill('not-hex')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.locator('#input-error')).toBeVisible()
  await scan(page, `${prefix}: rejected malformed key`)
}