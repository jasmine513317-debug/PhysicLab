import { expect, test } from '@playwright/test'

test('shows the approved editorial home content', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /先搭一个世界/ })).toBeVisible()
  await expect(page.locator('.hp-row')).toHaveCount(3)
  for (const name of ['经典力学', '电磁学', '天体物理']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: '打开斜抛运动实验' })).toBeVisible()
  await expect(
    page.locator('.hero-simulation, .domain-card, .home-metrics, .home-footer, .capability-flow, .hp-page canvas')
  ).toHaveCount(0)
})

test('opens the mechanics workbench from the home domain row without a template dialog', async ({ page }) => {
  await page.goto('/')
  await page.locator('.hp-row').filter({ hasText: '经典力学' }).click()

  await expect(page).toHaveURL(/\/lab(?:\?|$)/)
  await expect(page.getByLabel('实验标题')).not.toHaveValue('')
  await expect(page.getByLabel('物理场景')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`adapts the home layout at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    await expect(page.getByRole('heading', { level: 1, name: /先搭一个世界/ })).toBeInViewport()
    await page.locator('.hp-row').first().scrollIntoViewIfNeeded()
    await expect(page.locator('.hp-row')).toHaveCount(3)
    await expect(page.locator('.hp-row').first()).toBeInViewport()
  })
}