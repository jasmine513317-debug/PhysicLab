import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('measures an orbit, compares Kepler periods, and exports samples',async({page})=>{
  await page.goto('/experiments')
  await page.getByRole('region',{name:'实验模板'}).getByRole('link',{name:'开普勒定律',exact:true}).click()
  await expect(page.getByLabel('轨道画布')).toBeVisible()
  await page.getByText('开普勒定律与轨道数据',{exact:true}).click()
  const law=page.getByRole('region',{name:'开普勒第三定律'})
  await law.getByRole('button',{name:'验证开普勒第三定律'}).click()
  await expect(law.getByRole('row')).toHaveCount(4)
  const period=page.getByRole('row',{name:/周期（年）/}).getByRole('cell').last()
  await expect(period).toHaveText('—')
  await page.getByLabel('轨道播放速度').selectOption('8')
  await page.getByRole('button',{name:'运行轨道'}).click()
  await expect(period).not.toHaveText('—',{timeout:12000})
  await page.getByRole('button',{name:'暂停轨道'}).click()
  const area=page.getByRole('region',{name:'等时扫过面积'}).locator('dd')
  await expect(area.first()).toHaveText(/^0\.\d+ AU²$/)
  await expect(area.nth(1)).toHaveText(/^0\.\d+ AU²$/)
  const waitDownload=page.waitForEvent('download')
  await page.getByRole('button',{name:'导出轨道 CSV'}).click()
  const download=await waitDownload
  const csv=await readFile(await download.path(),'utf8')
  expect(csv).toContain('relative_vx_AU_per_yr,relative_vy_AU_per_yr,energy_Msun_AU2_per_yr2')
  expect(csv.trim().split('\r\n').length).toBeGreaterThan(100)
  const time=page.getByLabel('轨道模拟时间'), stoppedAt=await time.innerText()
  await page.getByText('绘图图层',{exact:true}).click()
  await page.getByRole('checkbox',{name:'运行轨迹'}).uncheck()
  await expect(time).toHaveText(stoppedAt)
  await page.setViewportSize({width:375,height:812})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(375)
  await expect(page.getByLabel('轨道画布')).toBeVisible()
})

test('creates, saves and imports a custom dual-body scene',async({page})=>{
  await page.goto('/lab?domain=astrophysics&new=1')
  await expect(page.getByRole('button',{name:'运行轨道'})).toBeDisabled()
  await page.getByRole('button',{name:'添加恒星'}).click()
  await page.getByRole('button',{name:'添加行星'}).click()
  const mass=page.getByRole('spinbutton',{name:'质量 地球质量 M⊕'})
  await mass.fill('0.002')
  await mass.press('Enter')
  const title=page.getByLabel('天体实验名称')
  await title.fill('自定义双体')
  await title.press('Enter')
  await page.getByRole('button',{name:'单步推进'}).click()
  await expect(page.getByLabel('轨道模拟时间')).not.toHaveText('0 年')
  await page.getByRole('button',{name:'保存实验',exact:true}).click()
  await expect(page.getByRole('button',{name:'已保存',exact:true})).toBeVisible()
  await page.reload()
  await expect(title).toHaveValue('自定义双体')
  await expect(mass).toHaveValue('0.002')
  const waiting=page.waitForEvent('download')
  await page.getByRole('button',{name:'导出场景 JSON'}).click()
  const download=await waiting
  await page.goto('/experiments')
  await page.getByLabel('导入实验 JSON').setInputFiles(await download.path())
  const copies=page.getByRole('link',{name:'预览：自定义双体'})
  await expect(copies).toHaveCount(2)
  await copies.first().click()
  await expect(mass).toHaveValue('0.002')
})


test('adds multiple real bodies in a blank experiment and retains them after reload',async({page})=>{
  await page.goto('/lab?domain=astrophysics&new=1')
  const coordinates=page.getByRole('spinbutton',{name:'初始 X AU'})
  await page.getByRole('button',{name:'添加恒星',exact:true}).click()
  await expect(page.getByRole('spinbutton',{name:'质量 太阳质量 M☉'})).toHaveValue('1')
  await page.getByRole('button',{name:'添加行星',exact:true}).click()
  await page.getByRole('button',{name:'添加行星',exact:true}).click()
  await expect(page.getByRole('region',{name:'多体系统'})).toBeVisible()
  await expect(coordinates).not.toBeVisible()
  await page.getByText('精确位置与速度',{exact:true}).click()
  await expect(coordinates).toBeVisible()
  await page.getByRole('button',{name:'运行轨道',exact:true}).click()
  await expect(page.getByLabel('轨道模拟时间')).not.toHaveText('0 年')
  await page.getByRole('button',{name:'暂停轨道',exact:true}).click()
  await page.getByRole('button',{name:'保存实验',exact:true}).click()
  await expect(page.getByRole('button',{name:'已保存',exact:true})).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox',{name:'选择天体'}).locator('option')).toHaveCount(4)
  await expect(page.getByRole('region',{name:'多体系统'})).toBeVisible()
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
})

test('keeps the dragged planet under the pointer and avoids view jumps on release',async({page})=>{
  await page.addInitScript(()=>{
    const samples:any[]=[]
    ;(window as any).astroFrames=samples
    const fill=CanvasRenderingContext2D.prototype.fillRect
    const arc=CanvasRenderingContext2D.prototype.arc
    CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
      if(this.canvas.getAttribute('aria-label')==='轨道画布'&&w>200&&h>200){samples.push({time:performance.now(),bodies:[]});if(samples.length>300)samples.shift()}
      return fill.call(this,x,y,w,h)
    }
    CanvasRenderingContext2D.prototype.arc=function(x,y,r,a,b,anticlockwise){
      if(this.canvas.getAttribute('aria-label')==='轨道画布'&&(r===8||r===5))samples.at(-1)?.bodies.push({x,y,r})
      return arc.call(this,x,y,r,a,b,anticlockwise)
    }
  })
  await page.goto('/lab?domain=astrophysics&preset=ellipse')
  const canvas=page.getByLabel('轨道画布')
  const positions=()=>page.evaluate(()=>(window as any).astroFrames.filter((f:any)=>f.bodies.length===2).at(-1)?.bodies)
  await expect.poll(async()=>Boolean(await positions())).toBe(true)
  const start=await positions(),bounds=(await canvas.boundingBox())!
  const earth=start[1],sun=start[0]
  await page.mouse.move(bounds.x+earth.x,bounds.y+earth.y)
  await page.mouse.down()
  await page.mouse.move(bounds.x+earth.x-90,bounds.y+earth.y+70,{steps:14})
  await expect.poll(async()=>Math.abs((await positions())[1].x-(earth.x-90))).toBeLessThan(1)
  const before=await positions()
  expect(Math.hypot(before[0].x-sun.x,before[0].y-sun.y)).toBeGreaterThan(3)
  await page.mouse.up()
  await page.getByText('精确位置与速度',{exact:true}).click()
  expect(Math.abs(Number(await page.getByRole('spinbutton',{name:'初始 Y AU'}).inputValue()))).toBeGreaterThan(.01)
  const after=await positions()
  for(let i=0;i<2;i++)expect(Math.hypot(before[i].x-after[i].x,before[i].y-after[i].y)).toBeLessThan(1.5)
  await page.screenshot({path:'../../work/astronomy-preview.png',fullPage:true})
})
