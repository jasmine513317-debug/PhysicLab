import { expect, test } from '@playwright/test'

const time = (page: import('@playwright/test').Page) => page.getByLabel('模拟时间', { exact: true })

test('fills gravity from a preset and restarts the simulation', async ({ page }) => {
  await page.goto('/lab?template=fall')
  await page.getByRole('button', { name: '环境', exact: true }).click()
  const gravity = page.getByLabel('重力加速度')
  await expect(gravity).toHaveValue('9.81')

  await page.getByRole('button', { name: '单步运行' }).click()
  await expect(time(page)).toHaveText('0.017 s')

  const moon = page.getByRole('button', { name: '月球 1.62', exact: true })
  await moon.click()
  await expect(moon).toHaveAttribute('aria-pressed', 'true')
  await expect(gravity).toHaveValue('1.62')
  await expect(time(page)).toHaveText('0.000 s')
  await expect(page.getByText('参数已更新，模拟已回到初始状态。')).toBeVisible()

  await page.getByRole('button', { name: '失重 0', exact: true }).click()
  await expect(gravity).toHaveValue('0')
  await expect(moon).toHaveAttribute('aria-pressed', 'false')
})

test('plays, pauses, steps and resets from the keyboard', async ({ page }) => {
  await page.goto('/lab?template=fall')
  await page.locator('canvas').first().click({ position: { x: 40, y: 40 } })

  await page.keyboard.press('p')
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page.keyboard.press('p')
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeVisible()

  await page.keyboard.press('Shift+R')
  await expect(time(page)).toHaveText('0.000 s')
  await page.keyboard.press('.')
  await expect(time(page)).toHaveText('0.017 s')
  await page.keyboard.press('Shift+R')
  await expect(time(page)).toHaveText('0.000 s')
})

test('keeps native keyboard behaviour inside form controls', async ({ page }) => {
  await page.goto('/lab?template=fall')
  const title = page.getByLabel('实验标题')
  await title.click()
  await page.keyboard.press('p')
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeVisible()
})

test('leaves Space available for drag-to-pan', async ({ page }) => {
  await page.goto('/lab?template=fall')
  await page.locator('canvas').first().click({ position: { x: 40, y: 40 } })
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeVisible()
  await expect(time(page)).toHaveText('0.000 s')
})
