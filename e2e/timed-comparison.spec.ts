import { expect, test } from '@playwright/test'
import { openAnalysis, openProperties } from './helpers'

test('compares friction runs using the exact final sample and reports changed parameters', async ({page}) => {
  await page.goto('/lab?template=friction')
  await openAnalysis(page)
  await openProperties(page)
  const friction = page.getByRole('spinbutton', {name:'摩擦系数', exact:true})
  const clock = page.getByLabel('模拟时间', {exact:true})
  const runToTarget = async () => {
    await page.locator('.lab-name .crumb').click()
    for(let i=0;i<40;i++) await page.keyboard.press('.')
    await expect(clock).toHaveText('0.667 s')
    await expect(page.getByRole('button', {name:'运行', exact:true})).toBeVisible()
  }
  await friction.fill('0.1')
  await friction.press('Enter')
  await page.getByRole('button', {name:'关闭参数面板'}).click()
  await runToTarget()
  await page.getByRole('button', {name:'设为基准'}).click()
  await openProperties(page)
  await friction.fill('0.9')
  await friction.press('Enter')
  await page.getByRole('button', {name:'关闭参数面板'}).click()
  await expect(clock).toHaveText('0.000 s')
  await runToTarget()
  const aligned = page.getByRole('region', {name:'同一时刻对比'})
  await expect(aligned).toContainText('0.667 s · 同时刻速率')
  await expect(aligned).toContainText('滑块 · 摩擦系数　0.1 → 0.9')
  const speeds = await aligned.locator('.aligned-values b').allTextContents()
  expect(parseFloat(speeds[0])).toBeGreaterThan(parseFloat(speeds[1]))
  expect(parseFloat(speeds[2])).toBeLessThan(0)
  const panel = await aligned.evaluate(element => {
    const probe=document.createElement('span')
    document.body.append(probe)
    const resolve=(name:string) => {
      probe.style.color=`var(${name})`
      return getComputedStyle(probe).color
    }
    const result={
      background: getComputedStyle(element).backgroundColor,
      valueColor: getComputedStyle(element.querySelector('.aligned-values b')!).color,
      raised: resolve('--raised'),
      text: resolve('--text'),
    }
    probe.remove()
    return result
  })
  expect(panel.background).toBe(panel.raised)
  expect(panel.valueColor).toBe(panel.text)
  await page.screenshot({ path: 'test-results/visual-review/comparison-1366x768.png' })
})
