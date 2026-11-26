import { expect, test } from '@playwright/test'

const widths = [320, 390, 768, 1024, 1440] as const

test('home layout stays within the viewport at every target width', async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await expect(page.locator('.hp-row')).toHaveCount(3)
    await expect(page.locator('.hp-title-line')).toHaveCount(2)
    await expect(page.locator('.hp-waves path')).toHaveCount(3)
    await expect(page.locator('.hp-motes span')).toHaveCount(9)
    await expect(page.getByRole('heading', { name: /先搭一个世界/ })).toBeVisible()
  }
})

test('reduced-motion visitors still see all three domains', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.hp-formula.is-flow').first()).toBeHidden()
  await expect(page.locator('.hp-waves')).toBeHidden()
  await expect(page.locator('.hp-motes')).toBeHidden()
  await expect(page.getByRole('heading', { name: /先搭一个世界/ })).toBeVisible()
  await page.evaluate(() => document.querySelector('.hp-domains')?.scrollIntoView())
  await expect(page.getByRole('heading', { name: '经典力学', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '电磁学', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '天体物理', exact: true })).toBeVisible()
})
