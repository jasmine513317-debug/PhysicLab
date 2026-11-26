import { expect, test } from '@playwright/test'
import { body, emptyExperiment } from '../src/model'
import { circlePixels, drawStroke, openAnalysis, openProperties, touchStroke } from './helpers'

test('records poses, scrubs history, and restores the saved recording after reload',async({page})=>{
  await page.goto('/lab?template=collision')
  const canvas=page.getByLabel('物理场景')
  const pixels=()=>canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())
  for(let i=0;i<6;i++)await page.getByRole('button',{name:'单步运行'}).click()
  // Reset clears the world while retaining the finished take for replay.
  await page.getByRole('button',{name:'重置模拟'}).click()
  await page.getByRole('button',{name:'历史回放'}).click()
  const timeline=page.getByRole('slider',{name:'回放时间轴'})
  const replay=page.getByRole('region',{name:'历史回放'})
  await expect(replay.getByLabel('回放时间',{exact:true})).toHaveText('0.000 s')
  const first=await pixels()
  await timeline.press('End')
  await expect(replay.getByLabel('回放时间',{exact:true})).toHaveText('0.100 s')
  await expect.poll(pixels).not.toBe(first)
  await timeline.press('Home')
  await expect(replay.getByLabel('回放时间',{exact:true})).toHaveText('0.000 s')
  await replay.getByRole('button',{name:'播放回放'}).click()
  await expect(replay.getByLabel('回放时间',{exact:true})).toHaveText('0.100 s')
  await replay.getByRole('button',{name:'保存回放'}).click()
  await expect(page.getByText('回放已保存。',{exact:true})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'历史回放'}).click()
  await page.getByRole('slider',{name:'回放时间轴'}).press('End')
  await expect(page.getByRole('region',{name:'历史回放'}).getByLabel('回放时间',{exact:true})).toHaveText('0.100 s')
  await page.getByRole('button',{name:'退出回放'}).click()
  await expect(page.getByRole('button',{name:'运行',exact:true})).toBeEnabled()
})

test('classifies a quick open stroke as a static curve and a closed stroke as a body',async({page})=>{
  await page.goto('/lab?new=1')
  await openProperties(page)
  const canvas=page.getByLabel('物理场景')
  const bounds=(await canvas.boundingBox())!
  await page.getByRole('button',{name:'绘制',exact:true}).click()
  await drawStroke(page,[
    {x:bounds.x+140,y:bounds.y+150},{x:bounds.x+220,y:bounds.y+185},
    {x:bounds.x+320,y:bounds.y+140},{x:bounds.x+430,y:bounds.y+175},
  ])
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('手绘曲线（静态斜面/碰撞曲线）')
  await expect(page.getByText(/手绘曲线（静态斜面\/碰撞曲线） · \d+ 个点/)).toBeVisible()
  await drawStroke(page,circlePixels(bounds.x+250,bounds.y+300,45))
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('手绘物块')
  await expect(page.getByText(/手绘物块 · \d+ 个点/)).toBeVisible()
  await page.getByRole('button',{name:'运行',exact:true}).click()
  await openAnalysis(page)
  await expect(page.getByRole('button',{name:'设为基准'})).toBeEnabled()
  await page.getByRole('button',{name:'暂停',exact:true}).click()
})

test('edits the initial spring displacement and shows vector velocity in comparisons',async({page})=>{
  await page.goto('/lab?template=spring')
  await openProperties(page)
  await page.getByRole('combobox',{name:'当前物体'}).selectOption({label:'弹簧 1'})
  const displacement=page.getByRole('spinbutton',{name:'初始位移'})
  await expect(displacement).toHaveValue('1')
  await displacement.fill('-0.5')
  await displacement.press('Enter')
  await expect(displacement).toHaveValue('-0.5')
  await expect(page.getByRole('spinbutton',{name:'原长'})).toHaveValue('3')
  await page.getByRole('button',{name:'关闭参数面板'}).click()
  await page.getByRole('button',{name:'运行',exact:true}).click()
  await openAnalysis(page)
  await expect(page.getByRole('button',{name:'设为基准'})).toBeEnabled()
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  await page.getByRole('button',{name:'设为基准'}).click()
  await expect(page.getByRole('rowheader',{name:'末速度 X'})).toBeVisible()
  await expect(page.getByRole('rowheader',{name:'末速度 Y'})).toBeVisible()
})

test('runs and edits a 50-body scene while recording data and rendering charts',async({page,browserName})=>{
  const scene=emptyExperiment()
  scene.title='50 物体压力测试'
  scene.bodies=Array.from({length:50},(_,i)=>body('圆盘 '+i,{kind:'circle',radius:.33},i%10*.9-4.1,.7+Math.floor(i/10)*.85))
  scene.bodies.push(body('地面',{kind:'surface',width:20,height:.18},0,0))
  scene.joints=Array.from({length:5},(_,i)=>({id:'joint-'+i,a:scene.bodies[i*2].id,b:scene.bodies[i*2+1].id,
    anchorA:{x:0,y:0},anchorB:{x:0,y:0},stiffness:35,damping:.2,restLength:.9}))
  await page.goto('/experiments')
  await page.getByLabel('导入实验 JSON').setInputFiles({name:'load.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scene))})
  await page.getByRole('article').getByRole('link',{name:'打开',exact:true}).click()
  await page.getByRole('button',{name:'运行',exact:true}).click()
  await expect.poll(async()=>parseFloat((await page.getByLabel('模拟时间',{exact:true}).textContent())??'0')).toBeGreaterThan(0.35)
  const intervals=await page.evaluate(()=>new Promise<number[]>(resolve=>{
    const frames:number[]=[]
    let prev:number|undefined
    function frame(now:number) {
      if(prev!==undefined)frames.push(now-prev)
      prev=now
      if(frames.length<45)requestAnimationFrame(frame)
      else resolve(frames)
    }
    requestAnimationFrame(frame)
  }))
  const p90=intervals.sort((a,b)=>a-b)[Math.floor(intervals.length*.9)]
  console.log(browserName+' · 50 bodies · frame interval p90 '+p90.toFixed(1)+' ms')
  expect(p90).toBeLessThan(100)
  await expect.poll(async()=>parseFloat((await page.getByLabel('模拟时间',{exact:true}).textContent())??'0')).toBeGreaterThan(0.5)
  await openAnalysis(page)
  await page.getByRole('button',{name:'速度',exact:true}).click()
  await expect(page.getByLabel('速度随模拟时间变化')).toBeVisible()
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  await expect(page.getByRole('button',{name:'导出 CSV'})).toBeEnabled()
})

test.describe('mobile touch emulation',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true})
  test('draws and simulates a body using touch',async({page})=>{
    await page.goto('/lab?new=1')
    await page.getByRole('button',{name:'绘制',exact:true}).tap()
    const canvas=page.getByLabel('物理场景')
    const bounds=(await canvas.boundingBox())!
    await touchStroke(page,circlePixels(bounds.x+bounds.width/2,bounds.y+bounds.height/2,45,28))
    await page.getByRole('button',{name:'选择',exact:true}).click()
    await openProperties(page)
    await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('手绘物块')
    // A raw CDP touch stroke leaves Chromium's gesture state so the next synthesized tap emits no click.
    await page.getByRole('button',{name:'运行',exact:true}).click()
    await openAnalysis(page)
    await expect(page.getByRole('button',{name:'设为基准'})).toBeEnabled()
    await page.getByRole('button',{name:'暂停',exact:true}).click()
  })
})

test('edits boundaries and resizes the data panel with the keyboard',async({page})=>{
  await page.goto('/lab?template=fall')
  await openProperties(page)
  await page.getByRole('combobox',{name:'当前物体'}).selectOption('')
  await page.getByRole('button',{name:'关闭参数面板'}).click()
  await openProperties(page,'world')
  await page.getByRole('checkbox',{name:'启用场景边界'}).check()
  const limit=page.getByRole('spinbutton',{name:'右边界 X'})
  await limit.fill('4')
  await limit.press('Enter')
  await expect(limit).toHaveValue('4')
  await limit.fill('-12')
  await limit.press('Enter')
  await expect(page.getByRole('alert')).toContainText('最大值必须比最小值至少大')
  await page.getByRole('button',{name:'关闭参数面板'}).click()
  await openAnalysis(page)
  const handle=page.getByRole('separator',{name:'调整分析面板高度'})
  const panel=page.getByRole('region',{name:'数据分析'})
  const before=(await panel.boundingBox())!.height
  await handle.press('ArrowUp')
  await expect.poll(async()=>(await panel.boundingBox())!.height).toBeGreaterThan(before)
})
