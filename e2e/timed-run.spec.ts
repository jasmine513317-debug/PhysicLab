import { expect, test } from '@playwright/test'
import { openAnalysis, openProperties } from './helpers'

test('keeps playback controls and fixed-step timing without an independent timed-run module', async ({page}) => {
  await page.goto('/lab?template=friction')
  await expect(page.getByRole('button', {name:'定时运行', exact:true})).toHaveCount(0)
  await expect(page.locator('#timed-run-controls')).toHaveCount(0)
  await expect(page.getByRole('spinbutton', {name:'目标模拟时间（秒）'})).toHaveCount(0)
  await expect(page.getByRole('button', {name:'开始定时运行'})).toHaveCount(0)
  await expect(page.getByRole('button', {name:'从头定时运行'})).toHaveCount(0)

  const clock = page.getByLabel('模拟时间', {exact:true})
  await page.getByRole('combobox', {name:'播放速度'}).selectOption('4')
  await page.getByRole('button', {name:'运行', exact:true}).click()
  await expect.poll(async()=>parseFloat(await clock.innerText())).toBeGreaterThan(0.1)
  await page.getByRole('button', {name:'暂停', exact:true}).click()
  const pausedAt = parseFloat(await clock.innerText())
  await page.waitForTimeout(120)
  await expect(clock).toHaveText(pausedAt.toFixed(3)+' s')

  await page.getByRole('button', {name:'单步运行', exact:true}).click()
  expect(parseFloat(await clock.innerText())).toBeCloseTo(pausedAt+1/60,2)
  await page.getByRole('button', {name:'重置模拟', exact:true}).click()
  await expect(clock).toHaveText('0.000 s')

  // The former 0.707 s target rounds to 42 fixed 1/60 s steps: exactly 0.700 s.
  const target = 0.707
  const ticks = Math.round(target*60)
  const expected = (ticks/60).toFixed(3)+' s'
  const stepToTarget = async () => {
    await page.locator('.lab-name .crumb').click()
    for(let i=0;i<ticks;i++) await page.keyboard.press('.')
    await expect(clock).toHaveText(expected)
  }
  await stepToTarget()
  await openAnalysis(page)
  await page.getByRole('button', {name:'设为基准'}).click()
  await openProperties(page)
  const friction = page.getByRole('spinbutton', {name:'摩擦系数',exact:true})
  await friction.fill('0.9')
  await friction.press('Enter')
  await page.getByRole('button', {name:'关闭参数面板'}).click()
  await expect(clock).toHaveText('0.000 s')
  await stepToTarget()
})
