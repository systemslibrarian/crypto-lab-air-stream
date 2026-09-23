import { expect, test } from '@playwright/test'
import { boot, driveAllStates, NARROW, watchPageErrors } from './gate'

test('no WCAG 2.1 A/AA violations across the desktop workflow', async ({ page }) => {
  test.setTimeout(1_800_000)
  const errors = watchPageErrors(page)
  await boot(page)
  await driveAllStates(page, 'desktop')
  expect(errors, errors.join('\n')).toEqual([])
})

test('no WCAG 2.1 A/AA violations across the 380px workflow', async ({ page }) => {
  test.setTimeout(1_800_000)
  const errors = watchPageErrors(page)
  await page.setViewportSize(NARROW)
  await boot(page)
  await driveAllStates(page, '380px')
  expect(errors, errors.join('\n')).toEqual([])
})