import {expect,test,type Page} from '@playwright/test'

async function observeFrames(page:Page) {
  await page.addInitScript(()=>{
    const frames:{bodies:{x:number;y:number}[]}[]=[]
    ;(window as any).orbitFrames=frames
    const fill=CanvasRenderingContext2D.prototype.fillRect,arc=CanvasRenderingContext2D.prototype.arc
    CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h) {
      if(this.canvas.getAttribute('aria-label')==='轨道画布'&&w>200&&h>200) {
        frames.push({bodies:[]});if(frames.length>100)frames.shift()
      }
      return fill.call(this,x,y,w,h)
    }
    CanvasRenderingContext2D.prototype.arc=function(x,y,r,start,end,ccw) {
      if(this.canvas.getAttribute('aria-label')==='轨道画布'&&(r===5||r===8||r===25))frames.at(-1)?.bodies.push({x,y})
      return arc.call(this,x,y,r,start,end,ccw)
    }
  })
}
const positions=(page:Page,count:number)=>page.evaluate(n=>(window as any).orbitFrames.filter((f:any)=>f.bodies.length===n).at(-1)?.bodies,count) as Promise<{x:number;y:number}[]|undefined>
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y)

for(const [preset,count] of [['ellipse',2],['kepler',2],['escape',2],['earth-moon',3],['solar-system',9]] as const) {
  test(`${preset}: renders moving bodies, pauses, and resets to the initial state`,async({page})=>{
    await observeFrames(page)
    await page.goto('/lab?domain=astrophysics&preset='+preset)
    await expect.poll(async()=>Boolean(await positions(page,count))).toBe(true)
    const initial=(await positions(page,count))!
    await page.getByLabel('轨道播放速度').selectOption('8')
    await page.getByRole('button',{name:'运行轨道',exact:true}).click()
    await expect(page.getByLabel('轨道模拟时间')).not.toHaveText('0 年')
    await expect.poll(async()=>Math.max(...(await positions(page,count))!.map((p,i)=>distance(p,initial[i])))).toBeGreaterThan(5)
    await page.getByRole('button',{name:'暂停轨道',exact:true}).click()
    const pausedTime=await page.getByLabel('轨道模拟时间').innerText()
    await page.getByRole('button',{name:'放大轨道视图',exact:true}).click()
    await expect(page.getByLabel('轨道模拟时间')).toHaveText(pausedTime)
    await page.getByRole('button',{name:'重置轨道',exact:true}).click()
    await expect(page.getByLabel('轨道模拟时间')).toHaveText('0 年')
    await expect.poll(async()=>Math.max(...(await positions(page,count))!.map((p,i)=>distance(p,initial[i])))).toBeLessThan(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
}

test('zooms and fits the view and follows the star throughout a drag',async({page})=>{
  await observeFrames(page)
  await page.goto('/lab?domain=astrophysics&preset=ellipse')
  await expect.poll(async()=>Boolean(await positions(page,2))).toBe(true)
  const initial=(await positions(page,2))!
  const separation=(p:{x:number;y:number}[])=>distance(p[0],p[1])
  const initialDistance=separation(initial)
  await page.getByRole('button',{name:'放大轨道视图',exact:true}).click()
  await expect.poll(async()=>separation((await positions(page,2))!)/initialDistance).toBeGreaterThan(1.28)
  await page.getByRole('button',{name:'缩小轨道视图',exact:true}).click()
  await expect.poll(async()=>Math.abs(separation((await positions(page,2))!)/initialDistance-1)).toBeLessThan(.01)
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'放大轨道视图',exact:true}).click()
  await expect.poll(async()=>Math.abs(separation((await positions(page,2))!)/initialDistance-1.3**3)).toBeLessThan(.03)
  await page.getByRole('button',{name:'重置轨道视图',exact:true}).click()
  await expect.poll(async()=>distance((await positions(page,2))![0],initial[0])).toBeLessThan(1)
  const box=(await page.getByLabel('轨道画布').boundingBox())!
  const sun=(await positions(page,2))![0],earth=(await positions(page,2))![1]
  await page.mouse.move(box.x+sun.x,box.y+sun.y)
  await page.mouse.down()
  for(const [dx,dy] of [[30,-20],[60,-40],[90,-60]]) {
    await page.mouse.move(box.x+sun.x+dx,box.y+sun.y+dy,{steps:4})
    await expect.poll(async()=>distance((await positions(page,2))![0],{x:sun.x+dx,y:sun.y+dy})).toBeLessThan(1)
  }
  const before=(await positions(page,2))!
  expect(distance(before[1],earth)).toBeGreaterThan(3)
  await page.mouse.up()
  await expect.poll(async()=>Math.max(...(await positions(page,2))!.map((p,i)=>distance(p,before[i])))).toBeLessThan(1.5)
})

test('undoes and redoes edits to a template without going past its initial state',async({page})=>{
  await page.goto('/lab?domain=astrophysics&preset=ellipse')
  const undo=page.getByRole('button',{name:'撤销调整'}),redo=page.getByRole('button',{name:'重做调整'})
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  await page.getByText('精确位置与速度',{exact:true}).click()
  const y=page.getByRole('spinbutton',{name:'初始 Y AU'})
  await expect(y).toHaveValue('0')
  await y.fill('.2');await y.press('Enter')
  await undo.click();await expect(y).toHaveValue('0');await expect(undo).toBeDisabled()
  await redo.click();await expect(y).toHaveValue('0.2')
  await page.getByRole('button',{name:'添加行星',exact:true}).click()
  await expect(page.getByLabel('选择天体').locator('option')).toHaveCount(4)
  await undo.click()
  await expect(page.getByLabel('选择天体').locator('option')).toHaveCount(3)
  await redo.click()
  await expect(page.getByLabel('选择天体').locator('option')).toHaveCount(4)
  await undo.click()
  await y.fill('.3');await y.press('Enter')
  await expect(redo).toBeDisabled()
})

test('reveals real-scale Earth-Moon motion in a local view without resetting time',async({page})=>{
  await observeFrames(page)
  await page.goto('/lab?domain=astrophysics&preset=earth-moon')
  await expect.poll(async()=>Boolean(await positions(page,3))).toBe(true)
  const overview=(await positions(page,3))!
  expect(distance(overview[1],overview[2])).toBeLessThan(2)
  await page.getByRole('button',{name:'观察地月近景'}).click()
  await expect.poll(async()=>distance((await positions(page,3))![1],(await positions(page,3))![2])).toBeGreaterThan(100)
  await expect(page.getByText('月球 · 相对地球速率',{exact:true})).toBeVisible()
  await expect(page.getByRole('combobox',{name:'选择天体'})).toHaveValue(await page.getByRole('combobox',{name:'选择天体'}).locator('option',{hasText:'月球'}).getAttribute('value') as string)
  await page.getByRole('button',{name:'运行轨道'}).click()
  const bounds=(await page.getByLabel('轨道画布').boundingBox())!
  for(const day of [3,8,12]) {
    await expect.poll(async()=>Number.parseFloat(await page.getByLabel('轨道模拟天数').innerText())).toBeGreaterThan(day)
    await expect.poll(async()=>distance((await positions(page,3))![1],{x:bounds.width/2,y:bounds.height/2})).toBeLessThan(5)
    const moon=(await positions(page,3))![2]
    expect(moon.x).toBeGreaterThan(10);expect(moon.x).toBeLessThan(bounds.width-10)
    expect(moon.y).toBeGreaterThan(10);expect(moon.y).toBeLessThan(bounds.height-10)
  }
  await page.getByRole('button',{name:'暂停轨道'}).click()
  const time=await page.getByLabel('轨道模拟时间').innerText()
  const local=(await positions(page,3))!
  const angle=(p:{x:number;y:number}[])=>Math.atan2(p[2].y-p[1].y,p[2].x-p[1].x)
  expect(Math.abs(angle(local)-angle(overview))).toBeGreaterThan(.4)
  await page.screenshot({path:'../../work/astronomy-ux-near.png',fullPage:true})
  await page.getByRole('button',{name:'重置轨道视图',exact:true}).click()
  await expect(page.getByLabel('轨道模拟时间')).toHaveText(time)
  await expect(page.getByLabel('观察视角')).toHaveValue('overview')
  await expect.poll(async()=>distance((await positions(page,3))![1],(await positions(page,3))![2])).toBeLessThan(2)
  await page.screenshot({path:'../../work/astronomy-ux-overview.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
  await expect(page.getByRole('complementary',{name:'实验导航'})).toBeHidden()
  await page.screenshot({path:'../../work/astronomy-ux-mobile.png',fullPage:true})
})

for(const extension of ['three-body','gravity-assist']) {
  test(`${extension}: runs and resets its astronomy canvas`,async({page})=>{
    await page.goto('/lab?domain=astrophysics&extension='+extension)
    const canvas=page.getByLabel('扩展实验画布')
    await expect(canvas).toBeVisible()
    await page.evaluate(()=>document.fonts.ready)
    const initial=await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())
    await page.getByRole('button',{name:'运行',exact:true}).click()
    await expect(page.getByLabel('扩展实验时间')).not.toHaveText('0 年')
    await expect.poll(async()=>await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())!==initial).toBe(true)
    await page.getByRole('button',{name:'暂停',exact:true}).click()
    await page.getByRole('button',{name:'重置实验',exact:true}).click()
    await expect(page.getByLabel('扩展实验时间')).toHaveText('0 年')
    await expect.poll(async()=>await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())===initial).toBe(true)
  })
}
