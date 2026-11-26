import { expect,test } from '@playwright/test'
import { emptySpatialScene,spatialObject,type Vec3 } from '../src/spatialPhysics'
import { pinchOut } from './helpers'

test('runs a spatial experiment, changes observation, and preserves both workspaces',async({page},info)=>{
  await page.setViewportSize({width:1280,height:720})
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await expect(workbench.getByLabel('三维实验画布')).toBeVisible()
  await workbench.getByLabel('加载三维模板').selectOption('helix')
  await workbench.getByRole('button',{name:'三维单步'}).click()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await workbench.getByLabel('三维观察方式').selectOption('xy')
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await workbench.getByLabel('三维轨迹').selectOption('both')
  await workbench.getByRole('button',{name:'返回 2D'}).click()
  await expect(page.getByRole('region',{name:'三维实验工作台'})).toHaveCount(0)
  await expect(page.getByLabel('模拟时间',{exact:true})).toHaveText('0.000 s')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await workbench.getByRole('button',{name:'保存三维实验'}).click()
  await expect(page).toHaveURL(/spatial=/)
  await page.reload()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await expect(workbench.getByLabel('三维观察方式')).toHaveValue('xy')
  await workbench.getByLabel('三维观察方式').selectOption('orbit')
  await page.screenshot({path:info.outputPath('spatial-desktop.png')})
})

test('models a rigid object, steps through Rapier and analyzes real solver output',async({page})=>{
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await workbench.getByRole('button',{name:'建模',exact:true}).click()
  await workbench.getByRole('button',{name:'创建模型'}).click()
  await expect(workbench.getByLabel('三维对象').locator(':checked')).toHaveText('拉伸体')
  await workbench.getByRole('button',{name:'三维单步'}).click()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await workbench.getByRole('button',{name:'分析',exact:true}).click()
  const panel=workbench.getByRole('region',{name:'统一变量分析'})
  await expect(panel).toBeVisible()
  await panel.getByLabel('纵轴').selectOption('y')
  await expect(panel.getByRole('button',{name:'导出选区 CSV'})).toBeEnabled()
  await workbench.getByRole('button',{name:'保存三维实验'}).click()
  await page.reload()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await workbench.getByRole('button',{name:'三维单步'}).click()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.033 s')
})

test('a unified save restores independent elapsed time on both branches',async({page})=>{
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'单步运行',exact:true}).click()
  await expect(page.getByLabel('模拟时间',{exact:true})).toHaveText('0.017 s')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await workbench.getByLabel('加载三维模板').selectOption('rigid')
  await workbench.getByRole('button',{name:'三维单步'}).click()
  await workbench.getByRole('button',{name:'三维单步'}).click()
  await workbench.getByRole('button',{name:'保存三维实验'}).click()
  await page.reload()
  await expect(workbench.getByLabel('三维模拟时间')).toHaveText('0.033 s')
  await workbench.getByRole('button',{name:'返回 2D'}).click()
  await expect(page.getByLabel('模拟时间',{exact:true})).toHaveText('0.017 s')
})

test('edits orbital inclination and saves a visual radius independently of the physical radius',async({page})=>{
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await workbench.getByLabel('加载三维模板').selectOption('orbit')
  await workbench.getByRole('button',{name:'环境',exact:true}).click()
  const inclination=workbench.getByLabel('初始轨道倾角 (°)')
  await inclination.fill('45')
  await inclination.press('Enter')
  await expect(workbench.getByLabel('初始轨道倾角 (°)')).toHaveValue('45')
  await workbench.getByRole('button',{name:'属性',exact:true}).click()
  await workbench.getByLabel('三维对象').selectOption({label:'主星'})
  const radius=workbench.getByLabel('显示半径 (m)',{exact:true})
  await radius.fill('0.7')
  await radius.press('Enter')
  await workbench.getByRole('button',{name:'保存三维实验'}).click()
  await expect(page).toHaveURL(/spatial=/)
  await page.reload()
  await workbench.getByRole('button',{name:'环境',exact:true}).click()
  await expect(workbench.getByLabel('初始轨道倾角 (°)')).toHaveValue('45')
  await workbench.getByRole('button',{name:'属性',exact:true}).click()
  await workbench.getByLabel('三维对象').selectOption({label:'主星'})
  await expect(workbench.getByLabel('显示半径 (m)',{exact:true})).toHaveValue('0.7')
  await expect(workbench.getByLabel('半径 (m)',{exact:true})).toHaveValue('0.02')
})

test('draws a spatial track on an explicit work plane',async({page})=>{
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await workbench.getByLabel('三维观察方式').selectOption('xy')
  await workbench.getByRole('button',{name:'建模',exact:true}).click()
  await workbench.getByLabel('手绘工作平面').selectOption('xy')
  await workbench.getByRole('button',{name:'手绘空间路径'}).click()
  const bounds=(await workbench.getByLabel('三维实验画布').boundingBox())!
  await page.mouse.move(bounds.x+bounds.width*.28,bounds.y+bounds.height*.56)
  await page.mouse.down()
  await page.mouse.move(bounds.x+bounds.width*.44,bounds.y+bounds.height*.50,{steps:12})
  await page.mouse.up()
  await expect(workbench.getByLabel('三维对象').locator(':checked')).toHaveText('手绘空间轨道')
})

test('first-person movement and zoom change camera state only',async({page})=>{
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await workbench.getByLabel('加载三维模板').selectOption('fall')
  await workbench.getByLabel('三维观察方式').selectOption('first')
  const save=workbench.getByRole('button',{name:'保存三维实验'})
  await save.click()
  await expect(page).toHaveURL(/spatial=/)
  const state=()=>page.evaluate(()=>{
    const id=new URLSearchParams(location.search).get('spatial')
    return JSON.parse(localStorage.getItem('physiclab-spatial-v1:'+id)!)
  })
  const before=await state()
  await workbench.getByRole('button',{name:'右移',exact:true}).click()
  await workbench.getByRole('button',{name:'放近三维视角'}).click()
  await save.click()
  const after=await state()
  expect(after.view.camera.focus).not.toEqual(before.view.camera.focus)
  expect(after.view.camera.distance).toBeCloseTo(before.view.camera.distance*.8,8)
  expect(after.spatial).toEqual(before.spatial)
})

test('maintains browser responsiveness while simulating ten spatial rigid bodies',async({page,browserName})=>{
  await page.goto('/lab?new=1')
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  const scene={...emptySpatialScene('十物体性能场景'),ground:true,bodies:Array.from({length:10},(_,i)=>({
    ...spatialObject('盒体 '+i),position:[(i%5-2)*1.1,3+Math.floor(i/5),i<5?0:1.2] as Vec3,
    angularVelocity:[.2,.3,0] as Vec3,geometry:{kind:'box' as const,size:[.65,.7,.6] as Vec3},
  }))}
  await workbench.locator('input[type=file]').setInputFiles({name:'spatial-performance.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scene))})
  await expect(workbench.getByText('十物体性能场景',{exact:true})).toBeVisible()
  await workbench.getByRole('button',{name:'运行',exact:true}).click()
  const p90=await page.evaluate(()=>new Promise<number>(resolve=>{
    const intervals:number[]=[]
    let start:number|undefined,previous:number|undefined
    function frame(now:number) {
      start??=now
      if(previous!==undefined)intervals.push(now-previous)
      previous=now
      if(now-start<1300){requestAnimationFrame(frame);return}
      intervals.sort((a,b)=>a-b)
      resolve(intervals[Math.floor(.9*(intervals.length-1))]??Infinity)
    }
    requestAnimationFrame(frame)
  }))
  await workbench.getByRole('button',{name:'暂停',exact:true}).click()
  await expect(workbench.getByLabel('三维模拟时间')).not.toHaveText('0.000 s')
  console.info(`${browserName} · 10 spatial rigid bodies · frame interval p90 ${p90.toFixed(1)} ms`)
  expect(p90).toBeLessThan(85)
})

test('opens the spatial workbench on a narrow touch viewport',async({page},info)=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/lab?new=1')
  await page.locator('.lab-top').getByRole('button',{name:'更多',exact:true}).click()
  await page.getByRole('button',{name:'切换到三维工作台'}).click()
  const workbench=page.getByRole('region',{name:'三维实验工作台'})
  await workbench.getByLabel('加载三维模板').selectOption('throw')
  await expect(workbench.getByRole('button',{name:'运行',exact:true})).toBeInViewport()
  await expect(workbench.getByLabel('三维实验画布')).toBeVisible()
  await page.screenshot({path:info.outputPath('spatial-phone.png')})
})

test.describe('mobile spatial gestures',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}})
  test('pinches the camera without moving or advancing the experiment',async({page})=>{
    await page.goto('/lab?new=1')
    await page.locator('.lab-top').getByRole('button',{name:'更多',exact:true}).click()
    await page.getByRole('button',{name:'切换到三维工作台'}).click()
    const workbench=page.getByRole('region',{name:'三维实验工作台'})
    await workbench.getByLabel('加载三维模板').selectOption('fall')
    const save=workbench.getByRole('button',{name:'保存三维实验'})
    const snapshot=async()=>{
      await save.click()
      return page.evaluate(()=>{
        const id=new URLSearchParams(location.search).get('spatial')
        return JSON.parse(localStorage.getItem('physiclab-spatial-v1:'+id)!)
      })
    }
    const before=await snapshot()
    await pinchOut(page,workbench.getByLabel('三维实验画布'))
    const after=await snapshot()
    expect(after.view.camera.distance).toBeLessThan(before.view.camera.distance*.75)
    expect(after.spatial).toEqual(before.spatial)
  })
})
