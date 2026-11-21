import { expect, test } from '@playwright/test'

test('uses selection for dragging, panning, animated context selection, and deletion',async({page})=>{
  await page.goto('/lab?new=1')
  const canvas=page.getByLabel('物理场景')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  const menu=page.getByRole('group',{name:'目标操作'})
  const bounds=(await canvas.boundingBox())!
  const p={x:196,y:172}
  await expect(tools.getByRole('button',{name:'平移',exact:true})).toHaveCount(0)
  await expect(tools.getByRole('button',{name:'删除',exact:true})).toHaveCount(0)
  await tools.getByRole('button',{name:'圆形',exact:true}).click()
  await canvas.click({position:p})
  await tools.getByRole('button',{name:'选择',exact:true}).click()
  await canvas.click({position:p,button:'right'})
  await expect(menu.getByRole('button',{name:'删除 圆形'})).toBeVisible()
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('圆形')
  const first=await canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())
  await expect.poll(()=>canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())).not.toBe(first)
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
  expect(Number(await x.inputValue())).toBeCloseTo(oldX+1,4)
  expect(Number(await y.inputValue())).toBeCloseTo(oldY+.5,4)

  const blank={x:465,y:185}
  await canvas.click({position:blank,button:'right'})
  await expect(menu).toHaveCount(0)
  await drag(blank,60,38)
  const moved={x:p.x+140,y:p.y-2}
  await canvas.click({position:moved,button:'right'})
  await expect(menu.getByRole('button',{name:'删除 圆形'})).toBeVisible()
  expect(Number(await x.inputValue())).toBeCloseTo(oldX+1,4)
  expect(Number(await y.inputValue())).toBeCloseTo(oldY+.5,4)

  await menu.getByRole('button',{name:'删除 圆形'}).click()
  await expect(menu).toHaveCount(0)
  await expect(page.getByText('当前场景为空')).toBeVisible()
})

test('opens and dismisses target actions with the keyboard',async({page})=>{
  await page.goto('/lab?template=projectile')
  const canvas=page.getByLabel('物理场景')
  await canvas.press('Shift+F10')
  const action=page.getByRole('button',{name:'删除 抛射体'})
  await expect(action).toBeFocused()
  await action.press('Escape')
  await expect(action).toHaveCount(0)
  await expect(canvas).toBeFocused()
})

test.describe('touch selection',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true})
  test('long press exposes the same contextual delete action',async({page,browserName})=>{
    test.skip(browserName!=='chromium','Native long-press events are dispatched by the Chromium debugging protocol.')
    await page.goto('/lab?template=spring')
    const canvas=page.getByLabel('物理场景')
    const bounds=(await canvas.boundingBox())!
    const cdp=await page.context().newCDPSession(page)
    try {
      // The template's fixed anchor starts at world x = -3 m, y = 2 m.
      const scale=Math.min(80,(390-80)/10.6)
      const x=Math.round(bounds.x+bounds.width/2-3*scale)
      const y=Math.round(bounds.y+bounds.height/2+.2*scale)
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
      const action=page.getByRole('button',{name:'删除 固定点'})
      await expect(action).toBeVisible()
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      await action.tap()
      await expect(action).toHaveCount(0)
      await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option',{hasText:'固定点'})).toHaveCount(0)
    } finally {await cdp.detach()}
  })
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
