import { expect,test } from '@playwright/test'
import { dragMouse } from './helpers'

test('follows a falling body and updates its measured position without resetting playback',async({page})=>{
  await page.goto('/lab?template=fall')
  const track=page.getByRole('button',{name:'坐标跟随物体'})
  await track.click()
  await expect(track).toHaveAttribute('aria-pressed','true')
  const state=page.getByLabel('跟随状态')
  const initial=await state.textContent()
  await page.getByRole('button',{name:'单步运行',exact:true}).click()
  await expect(page.getByLabel('模拟时间',{exact:true})).toHaveText('0.017 s')
  await expect(state).not.toHaveText(initial??'')
  await page.getByRole('button',{name:'移动坐标原点'}).click()
  await expect(track).toHaveAttribute('aria-pressed','false')
  await expect(page.getByLabel('模拟时间',{exact:true})).toHaveText('0.017 s')
})

const modules=[
  ['静电','/lab?domain=electromagnetism','电场坐标参考','电场画布'],
  ['二维天体','/lab?domain=astrophysics','轨道坐标参考','轨道画布'],
  ['带电粒子','/lab?domain=electromagnetism&extension=particle','扩展实验坐标参考','扩展实验画布'],
  ['三维天体','/lab?new=1&space=astronomy','三维坐标参考','三维实验画布'],
] as const

for(const [name,url,control,canvasName] of modules)test(name+' supports a draggable viewing origin',async({page})=>{
  await page.goto(url)
  const canvas=page.getByLabel(canvasName,{exact:true})
  if(name==='静电')await page.getByRole('button',{name:'拖动坐标原点'}).click()
  else await page.getByLabel(control).selectOption('manual')
  const box=(await canvas.boundingBox())!
  const image=()=>canvas.evaluate((element:HTMLCanvasElement)=>element.toDataURL())
  const before=await image()
  const point={x:box.x+box.width*.45,y:box.y+box.height*.55}
  await dragMouse(page,point,{x:point.x+55,y:point.y+31})
  await expect.poll(image).not.toBe(before)
})
