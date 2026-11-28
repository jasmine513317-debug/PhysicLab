import { expect,test,type Locator,type Page } from '@playwright/test'

async function dragBlank(page:Page,canvas:Locator) {
  const box=(await canvas.boundingBox())!
  const x=box.x+box.width*.18,y=box.y+box.height*.66
  await page.mouse.move(x,y)
  await page.mouse.down()
  await page.mouse.move(x+65,y-38,{steps:8})
  await page.mouse.up()
}

test('pans the 3D sky by default and rotates in the chosen mode without advancing physics',async({page})=>{
  await page.goto('/lab?new=1&space=astronomy&spaceModel=solar')
  const canvas=page.getByLabel('三维实验画布'),mode=page.getByLabel('三维画布拖动方式')
  await expect(mode).toHaveValue('pan')
  const save=page.getByRole('button',{name:'保存三维实验'})
  const snapshot=async()=>{
    await save.click()
    return page.evaluate(()=>{
      const value=JSON.parse(localStorage.getItem('physiclab-spatial-v1:'+new URL(location.href).searchParams.get('spatial'))!)
      return {camera:value.view.camera,physical:value.spatial}
    })
  }
  const original=await snapshot()
  await dragBlank(page,canvas)
  const panned=await snapshot()
  expect(panned.camera.focus).not.toEqual(original.camera.focus)
  expect(panned.camera.yaw).toBe(original.camera.yaw)
  expect(panned.physical).toEqual(original.physical)
  await mode.selectOption('rotate')
  await dragBlank(page,canvas)
  const rotated=await snapshot()
  expect(rotated.camera.yaw).not.toBe(panned.camera.yaw)
  expect(rotated.camera.focus).toEqual(panned.camera.focus)
  expect(rotated.physical).toEqual(panned.physical)
})

for(const [route,name] of [
  ['/lab?new=1&domain=electromagnetism','电场画布'],
  ['/lab?domain=astrophysics&preset=ellipse','轨道画布'],
  ['/lab?domain=mechanics&extension=pendulum','扩展实验画布'],
] as const)test('pans the '+name+' by dragging empty space',async({page})=>{
  await page.goto(route)
  const canvas=page.getByLabel(name)
  await expect(canvas).toBeVisible()
  await expect.poll(()=>canvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBeGreaterThan(300)
  const pixels=()=>canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())
  const before=await pixels()
  await dragBlank(page,canvas)
  await expect.poll(pixels).not.toBe(before)
})

test.describe('single-finger canvas panning',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}})
  test('moves the 3D scene without using a keyboard or tool switch',async({page})=>{
    await page.goto('/lab?new=1&space=astronomy&spaceModel=solar')
    const canvas=page.getByLabel('三维实验画布')
    await expect(canvas).toBeVisible()
    const pixels=()=>canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())
    await expect.poll(()=>canvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBeGreaterThan(300)
    const before=await pixels()
    const bounds=(await canvas.boundingBox())!
    const x=Math.round(bounds.x+bounds.width*.2),y=Math.round(bounds.y+bounds.height*.66)
    const cdp=await page.context().newCDPSession(page)
    try {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+54,y:y-31}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    } finally {await cdp.detach()}
    await expect.poll(pixels).not.toBe(before)
    await expect(page.getByLabel('三维模拟时间')).toHaveText('0.000 s')
  })
})
