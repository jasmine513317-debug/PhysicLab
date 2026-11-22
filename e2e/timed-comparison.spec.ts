import { expect, test } from '@playwright/test'

test('compares friction runs using the exact final sample and reports changed parameters', async ({page}) => {
  await page.goto('/lab?template=friction')
  const friction = page.getByRole('spinbutton', {name:'摩擦系数', exact:true})
  const target = page.getByRole('spinbutton', {name:'目标模拟时间（秒）'})
  const runToTarget = async () => {
    if (!(await target.isVisible())) await page.getByRole('button', {name:'定时运行', exact:true}).click()
    await target.fill('0.70')
    await page.getByRole('button', {name:'开始定时运行', exact:true}).click()
    await expect(page.getByLabel('模拟时间', {exact:true})).toHaveText('0.700 s')
    await expect(page.getByRole('button', {name:'运行', exact:true})).toBeVisible()
  }
  await friction.fill('0.1')
  await friction.press('Enter')
  await runToTarget()
  await page.getByRole('button', {name:'设为基准'}).click()
  await friction.fill('0.9')
  await friction.press('Enter')
  await runToTarget()
  const aligned = page.getByRole('region', {name:'同一时刻对比'})
  await expect(aligned).toContainText('0.700 s · 同时刻速率')
  await expect(aligned).toContainText('滑块 · 摩擦系数　0.1 → 0.9')
  const speeds = await aligned.locator('.aligned-values b').allTextContents()
  expect(parseFloat(speeds[0])).toBeGreaterThan(parseFloat(speeds[1]))
  expect(parseFloat(speeds[2])).toBeLessThan(0)
})
