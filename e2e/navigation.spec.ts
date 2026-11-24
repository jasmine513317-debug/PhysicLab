import { expect, test } from '@playwright/test'

test('opens templates and recent experiments from the sidebar', async ({ page }) => {
  await page.goto('/lab?template=fall')
  await page.getByRole('button', { name: '保存实验' }).click()
  await expect(page.getByRole('button', { name: '已保存', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('region', { name: '最近实验' }).getByRole('link', { name: /自由落体/ })).toBeVisible()
  await page.getByRole('region', { name: '实验模板' }).getByRole('link', { name: /弹簧振子/ }).click()
  await expect(page.getByLabel('实验标题')).toHaveValue('弹簧振子')
})

test('opens the mobile sidebar drawer and navigates without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('#app-sidebar')).not.toBeVisible()
  await page.getByRole('button', { name: '打开侧边栏' }).click()
  await expect(page.locator('#app-sidebar')).toBeVisible()
  await expect(page.getByRole('region', { name: '实验模板' })).toBeVisible()
  await page.getByRole('region', { name: '实验模板' }).getByRole('link', { name: /自由落体/ }).click()
  await expect(page.getByLabel('实验标题')).toHaveValue('自由落体')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
