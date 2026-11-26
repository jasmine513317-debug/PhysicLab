import { expect, test } from '@playwright/test'
import { openAnalysis } from './helpers'

test('measures vertical acceleration using the plotted samples and keyboard time inputs',async({page})=>{
  await page.goto('/lab?template=fall')
  await openAnalysis(page)
  await page.getByRole('button',{name:'速度',exact:true}).click()
  const toggle=page.getByRole('button',{name:'A/B 测量'})
  await expect(toggle).toBeDisabled()
  for(let i=0;i<24;i++)await page.getByRole('button',{name:'单步运行'}).click()
  const chart=page.locator('.chart-wrap .recharts-surface')
  const chartBounds=(await chart.boundingBox())!
  await chart.hover({position:{x:chartBounds.width*.6,y:chartBounds.height*.4}})
  const tooltip=page.locator('.recharts-default-tooltip')
  await expect(tooltip).toBeVisible()
  const tooltipStyle=await tooltip.evaluate(element=>{
    const probe=document.createElement('span')
    document.body.append(probe)
    const resolve=(name:string)=>{
      probe.style.color=`var(${name})`
      return getComputedStyle(probe).color
    }
    const result={
      background:getComputedStyle(element).backgroundColor,
      color:getComputedStyle(element).color,
      raised:resolve('--raised'),
      text:resolve('--text'),
    }
    probe.remove()
    return result
  })
  expect(tooltipStyle.background).toBe(tooltipStyle.raised)
  expect(tooltipStyle.color).toBe(tooltipStyle.text)
  await page.screenshot({path:'test-results/visual-review/chart-tooltip-1366x768.png'})
  await toggle.click()
  await expect(page.getByLabel('测量曲线')).toHaveValue('vy')
  const plot=page.locator('.chart-wrap rect[style*="crosshair"]')
  const bounds=(await plot.boundingBox())!
  const a=page.getByRole('spinbutton',{name:'A 点时间（秒）'})
  const b=page.getByRole('spinbutton',{name:'B 点时间（秒）'})
  await plot.click({position:{x:bounds.width*.08,y:bounds.height*.45}})
  await plot.click({position:{x:bounds.width*.32,y:bounds.height*.45}})
  await expect(a).not.toHaveValue('')
  await expect(b).not.toHaveValue('')
  const result=page.locator('.chart-ruler-readout')
  await expect(result).toContainText('-9.81 m/s²')
  await a.fill('0.2')
  await a.press('Enter')
  await b.fill('0.2')
  await b.press('Enter')
  await expect(result).toContainText('两点同一时刻')
  await page.getByRole('button',{name:'重置模拟'}).click()
  await expect(toggle).toBeDisabled()
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'单步运行'}).click()
  await expect(a).toHaveValue('')
  await expect(b).toHaveValue('')
})
