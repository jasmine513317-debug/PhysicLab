import { expect, test } from '@playwright/test'
import { body, emptyExperiment } from '../src/model'
import { openImportedScene, openProperties, pixelOf } from './helpers'

function rectangleScene(title:string) {
  return {...emptyExperiment(),title,camera:{x:0,y:2.2,scale:80},
    bodies:[body(title,{kind:'rectangle',width:.8,height:.6},0,2.2,{restitution:0})]}
}

test('opens transform from the target menu, drags a block edge and interior, and undoes each drag',async({page})=>{
  const scene=rectangleScene('缩放方块')
  const canvas=await openImportedScene(page,scene)
  const tools=page.getByRole('complementary',{name:'场景工具'})
  const bounds=(await canvas.boundingBox())!
  const center=pixelOf(bounds,scene.camera,{x:0,y:2.2})
  const local=(x:number,y:number)=>({x:center.x-bounds.x+x,y:center.y-bounds.y+y})
  await expect(page.getByRole('complementary',{name:'参数面板'})).toHaveCount(0)
  await canvas.click({position:local(0,0),button:'right'})
  await page.getByRole('button',{name:'变换物体',exact:true}).click()
  const hint=page.getByText('拖内部移动 · 拖边缘缩放 · 拖圆形手柄旋转')
  await expect(hint).toBeVisible()
  await expect(tools.getByRole('button',{name:'选择',exact:true})).toHaveAttribute('aria-pressed','true')
  await openProperties(page)
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option',{hasText:'缩放方块'})).toHaveCount(1)
  const move=(x:number,y:number)=>page.mouse.move(bounds.x+center.x-bounds.x+x,bounds.y+center.y-bounds.y+y,{steps:6})
  const width=page.getByRole('spinbutton',{name:'宽度',exact:true})
  const height=page.getByRole('spinbutton',{name:'高度',exact:true})
  const x=page.getByRole('spinbutton',{name:'X 坐标'})
  const y=page.getByRole('spinbutton',{name:'Y 坐标'})
  const startX=Number(await x.inputValue()),startY=Number(await y.inputValue())
  await move(32,0)
  await page.mouse.down()
  await move(72,0)
  await page.mouse.up()
  await expect(width).toHaveValue('1.3')
  await expect(height).toHaveValue('0.6')
  expect(Number(await x.inputValue())).toBeCloseTo(startX+.25)
  await move(20,0)
  await page.mouse.down()
  await move(60,-16)
  await page.mouse.up()
  await expect.poll(async()=>Number(await x.inputValue())).toBeCloseTo(startX+.75)
  await expect.poll(async()=>Number(await y.inputValue())).toBeCloseTo(startY+.2)
  await canvas.press('Control+z')
  await expect(x).toHaveValue(String(+(startX+.25).toFixed(5)))
  await canvas.press('Control+z')
  await expect(width).toHaveValue('0.8')
  await expect(hint).toBeVisible()
  await move(32,0)
  await page.mouse.down()
  await move(78,0)
  await canvas.press('Escape')
  await page.mouse.up()
  await expect(width).toHaveValue('0.8')
  await expect(hint).toHaveCount(0)
})

test.describe('touch editing',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}})
  test('tap exposes transform handles and double-tap opens properties without a delete menu',async({page})=>{
    const scene=rectangleScene('触控方块')
    const canvas=await openImportedScene(page,scene)
    const bounds=(await canvas.boundingBox())!
    const p=pixelOf(bounds,scene.camera,{x:0,y:2.2})
    const position={x:p.x-bounds.x,y:p.y-bounds.y}
    await canvas.tap({position})
    await expect(page.getByText('拖内部移动 · 拖边缘缩放 · 拖圆形手柄旋转')).toBeVisible()
    await canvas.tap({position})
    await expect(page.getByRole('complementary',{name:'参数面板'})).toBeVisible()
    await openProperties(page)
    await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('触控方块')
    await expect(page.getByRole('group',{name:'目标操作'})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'删除目标'})).toHaveCount(0)
  })
})

test('rotates around the block center with the round handle and supports undo',async({page})=>{
  const scene=rectangleScene('旋转方块')
  const canvas=await openImportedScene(page,scene)
  const bounds=(await canvas.boundingBox())!
  const center=pixelOf(bounds,scene.camera,{x:0,y:2.2})
  await canvas.click({position:{x:center.x-bounds.x,y:center.y-bounds.y},button:'right'})
  await page.getByRole('button',{name:'变换物体',exact:true}).click()
  await openProperties(page)
  const x=page.getByRole('spinbutton',{name:'X 坐标'})
  const y=page.getByRole('spinbutton',{name:'Y 坐标'})
  const angle=page.getByRole('spinbutton',{name:'旋转角'})
  const [startX,startY]=await Promise.all([x.inputValue(),y.inputValue()])
  const radius=49 // Half the block height at 80 px/m, plus the handle gap.
  const move=(a:number)=>page.mouse.move(center.x+radius*Math.cos(a),center.y-radius*Math.sin(a))
  await move(Math.PI/2)
  await expect(canvas).toHaveCSS('cursor','grab')
  await page.mouse.down()
  for(let i=1;i<=6;i++)await move(Math.PI/2-i*Math.PI/12)
  await expect(angle).toHaveValue('0')
  await page.mouse.up()
  // Pointer coordinates may be rounded to device pixels by the browser.
  await expect.poll(async()=>Math.abs(Number(await angle.inputValue())+90)).toBeLessThan(1.7)
  const finalAngle=await angle.inputValue()
  await expect(x).toHaveValue(startX)
  await expect(y).toHaveValue(startY)
  await expect(page.getByRole('spinbutton',{name:'宽度'})).toHaveValue('0.8')
  await canvas.press('Control+z')
  await expect(angle).toHaveValue('0')
  await canvas.press('Control+y')
  await expect(angle).toHaveValue(finalAngle)
})
