import { expect, test } from '@playwright/test'
import { body, emptyExperiment } from '../src/model'
import { openImportedScene, openProperties, pixelOf } from './helpers'

test('uses selection for dragging, panning, animated context selection, and deletion',async({page})=>{
  const scene={...emptyExperiment(),title:'选择测试',camera:{x:0,y:2.2,scale:80},bodies:[body('测试圆',{kind:'circle',radius:.35},0,2.2,{restitution:0})]}
  const canvas=await openImportedScene(page,scene)
  const tools=page.getByRole('complementary',{name:'场景工具'})
  const menu=page.getByRole('group',{name:'目标操作'})
  const bounds=(await canvas.boundingBox())!
  const center=pixelOf(bounds,scene.camera,{x:0,y:2.2})
  const at=(dx:number,dy:number)=>({x:center.x-bounds.x+dx,y:center.y-bounds.y+dy})
  const p=at(0,0)
  await expect(tools.getByRole('button',{name:'平移',exact:true})).toHaveCount(0)
  await expect(tools.getByRole('button',{name:'删除',exact:true})).toHaveCount(0)
  const first=await canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())
  await canvas.click({position:p,button:'right'})
  await expect(menu.getByRole('button',{name:'变换物体'})).toBeVisible()
  await expect.poll(()=>canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())).not.toBe(first)
  await openProperties(page)
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('测试圆')
  const x=page.getByRole('spinbutton',{name:'X 坐标'})
  const y=page.getByRole('spinbutton',{name:'Y 坐标'})
  const oldX=Number(await x.inputValue()),oldY=Number(await y.inputValue())
  async function drag(from:{x:number;y:number},dx:number,dy:number) {
    await page.mouse.move(bounds.x+from.x,bounds.y+from.y)
    await page.mouse.down()
    await page.mouse.move(bounds.x+from.x+dx,bounds.y+from.y+dy,{steps:6})
    await page.mouse.up()
  }
  await drag(p,80,-40)
  await expect(menu).toHaveCount(0)
  await expect.poll(async()=>Number(await x.inputValue())).toBeCloseTo(oldX+1,4)
  await expect.poll(async()=>Number(await y.inputValue())).toBeCloseTo(oldY+.5,4)

  const blank=at(180,20)
  await canvas.click({position:blank,button:'right'})
  await expect(menu).toHaveCount(0)
  await drag(blank,60,38)
  const moved=at(140,-2)
  await canvas.click({position:moved,button:'right'})
  await expect(menu.getByRole('button',{name:'变换物体'})).toBeVisible()
  expect(Number(await x.inputValue())).toBeCloseTo(oldX+1,4)
  expect(Number(await y.inputValue())).toBeCloseTo(oldY+.5,4)

  await canvas.press('Delete')
  await expect(menu).toHaveCount(0)
  await expect(page.getByText('当前场景为空')).toBeVisible()
})

test('opens and dismisses target actions with the keyboard',async({page})=>{
  await page.goto('/lab?template=projectile')
  const canvas=page.getByLabel('物理场景')
  await canvas.press('Shift+F10')
  const action=page.getByRole('button',{name:'变换物体'})
  await expect(action).toBeFocused()
  await action.press('Escape')
  await expect(action).toHaveCount(0)
  await expect(canvas).toBeFocused()
})

test('moves both spring endpoints and deletes only the selected spring',async({page})=>{
  await page.goto('/lab?template=spring')
  const canvas=page.getByLabel('物理场景')
  const bounds=(await canvas.boundingBox())!
  const point={x:bounds.width/2-80,y:bounds.height/2+16}
  await page.mouse.move(bounds.x+point.x,bounds.y+point.y)
  await page.mouse.down()
  await page.mouse.move(bounds.x+point.x+40,bounds.y+point.y,{steps:6})
  await page.mouse.up()
  await openProperties(page)
  const object=page.getByRole('combobox',{name:'当前物体'})
  await expect(page.getByRole('spinbutton',{name:'初始位移'})).toHaveValue('1')
  await object.selectOption({label:'固定点'})
  await expect(page.getByRole('spinbutton',{name:'X 坐标'})).toHaveValue('-2.5')
  await canvas.click({button:'right',position:{x:point.x+40,y:point.y}})
  await page.getByRole('button',{name:'删除 弹簧 1'}).click()
  await expect(object.locator('option',{hasText:/^弹簧 1$/})).toHaveCount(0)
  await expect(object.locator('option',{hasText:/^固定点$/})).toHaveCount(1)
  await expect(object.locator('option',{hasText:/^振动物体$/})).toHaveCount(1)
})
