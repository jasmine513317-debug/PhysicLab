import { expect, test } from '@playwright/test'
import { circlePixels, drawStroke } from './helpers'

test('opens a pen palette with red, blue, white and custom colors but no black',async({page})=>{
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  const palette=page.getByRole('group',{name:'画笔颜色'})
  await expect(palette).toBeVisible()
  await expect(palette.getByRole('button',{name:'画笔颜色 红色'})).toBeVisible()
  await expect(palette.getByRole('button',{name:'画笔颜色 蓝色'})).toBeVisible()
  await expect(palette.getByRole('button',{name:'画笔颜色 白色'})).toBeVisible()
  await expect(palette.getByRole('button',{name:'画笔颜色 黑色'})).toHaveCount(0)
  await palette.getByRole('button',{name:'画笔颜色 白色'}).click()
  await expect(palette.getByRole('button',{name:'画笔颜色 白色'})).toHaveAttribute('aria-pressed','true')

  const picker=palette.getByLabel('自定义画笔颜色')
  await picker.evaluate((el:HTMLInputElement)=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!
    setter.call(el,'#12ab34')
    el.dispatchEvent(new Event('input',{bubbles:true}))
    el.dispatchEvent(new Event('change',{bubbles:true}))
  })
  const custom=palette.getByRole('button',{name:'自定义画笔颜色 1'})
  await expect(custom).toBeVisible()
  await expect(custom).toHaveAttribute('aria-pressed','true')
  await expect(custom).toHaveCSS('background-color','rgb(18, 171, 52)')
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('physiclab.ink-prefs.v1')??'{}')))
    .toMatchObject({color:'#12ab34',customInks:['#12ab34']})
})

test('keeps drawing properties visible and persists color, width and regularization mode',async({page})=>{
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  const objects=page.getByRole('combobox',{name:'当前物体'})
  const canvas=page.getByLabel('物理场景')
  const bounds=(await canvas.boundingBox())!
  const px=(x:number,y:number)=>({x:bounds.x+x,y:bounds.y+y})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()

  await expect(tools.getByRole('group',{name:'快捷颜色'})).toBeVisible()
  await expect(tools.getByRole('group',{name:'画笔粗细'})).toBeVisible()
  await expect(tools.getByRole('group',{name:'自动规整'})).toBeVisible()
  await tools.getByRole('button',{name:'快捷颜色 蓝色'}).click()
  await tools.getByRole('button',{name:'画笔粗细 粗'}).click()
  await tools.getByRole('button',{name:'自动规整 立即'}).click()
  await expect(tools.getByRole('button',{name:'快捷颜色 蓝色'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'画笔粗细 粗'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'自动规整 立即'})).toHaveAttribute('aria-pressed','true')
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('physiclab.ink-prefs.v1')??'{}')))
    .toMatchObject({color:'#5b8dff',width:3.6,mode:'immediate'})

  await drawStroke(page,[px(150,180),px(240,184),px(330,180),px(450,183)])
  await expect(objects.locator('option:checked')).toHaveText('手绘直线')

  await page.reload()
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await expect(tools.getByRole('button',{name:'快捷颜色 蓝色'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'画笔粗细 粗'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'自动规整 立即'})).toHaveAttribute('aria-pressed','true')

  await tools.getByRole('button',{name:'自动规整 关闭'}).click()
  await drawStroke(page,[px(150,240),px(240,244),px(330,240),px(450,243)])
  await expect(objects.locator('option:checked')).toHaveText('手绘曲线')

  await tools.getByRole('button',{name:'自动规整 停留'}).click()
  await drawStroke(page,[px(150,300),px(240,304),px(330,300),px(450,303)],1650)
  await expect(objects.locator('option:checked')).toHaveText('手绘直线')
})

test('offers eraser mode, size and auto-return that survive reload',async({page})=>{
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  const objects=page.getByRole('combobox',{name:'当前物体'})
  const canvas=page.getByLabel('物理场景')
  const bounds=(await canvas.boundingBox())!
  const px=(x:number,y:number)=>({x:bounds.x+x,y:bounds.y+y})

  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await expect(tools.getByRole('group',{name:'橡皮方式'})).toBeVisible()
  await expect(tools.getByRole('group',{name:'橡皮大小'})).toBeVisible()
  await tools.getByRole('button',{name:'按拖动'}).click()
  await tools.getByRole('button',{name:'橡皮大小 大'}).click()
  await tools.getByRole('button',{name:'擦完回绘制'}).click()
  await expect(tools.getByRole('button',{name:'擦完回绘制'})).toHaveAttribute('aria-pressed','true')
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('physiclab.ink-prefs.v1')??'{}')))
    .toMatchObject({eraserMode:'drag',eraserSize:'large',eraserReturn:true})

  await page.reload()
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await drawStroke(page,[px(150,210),px(250,195),px(350,215),px(450,200)])
  await expect(objects.locator('option:checked')).toHaveText('手绘曲线')
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await expect(tools.getByRole('button',{name:'按拖动'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'橡皮大小 大'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'擦完回绘制'})).toHaveAttribute('aria-pressed','true')

  await page.mouse.move(bounds.x+300,bounds.y+180)
  await page.mouse.down()
  await page.mouse.move(bounds.x+300,bounds.y+235,{steps:6})
  await page.mouse.up()
  await expect(objects.locator('option',{hasText:/^手绘曲线$/})).toHaveCount(2)
  await expect(tools.getByRole('button',{name:'绘制',exact:true})).toHaveAttribute('aria-pressed','true')
})

test('wraps the drawing context into a second row on a phone viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  const context=tools.locator('.tool-context')
  const strip=tools.locator('.tool-strip').first()
  await expect(context).toBeVisible()
  const contextBox=(await context.boundingBox())!
  const stripBox=(await strip.boundingBox())!
  expect(contextBox.y).toBeGreaterThanOrEqual(stripBox.y+stripBox.height-2)
  for(const name of ['快捷颜色','画笔粗细','自动规整']) {
    const box=(await tools.getByRole('group',{name}).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x+box.width).toBeLessThanOrEqual(390)
  }
})

test('stroke eraser removes whole curves while drag eraser cuts them and removes bodies',async({page})=>{
  await page.goto('/lab?new=1')
  const canvas=page.getByLabel('物理场景')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  const objects=page.getByRole('combobox',{name:'当前物体'})
  const bounds=(await canvas.boundingBox())!
  const px=(x:number,y:number)=>({x:bounds.x+x,y:bounds.y+y})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await drawStroke(page,[px(150,200),px(240,190),px(330,205),px(450,195)])
  await expect(objects.locator('option:checked')).toHaveText('手绘曲线')

  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  const menu=page.getByRole('group',{name:'橡皮模式'})
  await menu.getByRole('button',{name:'按拖动擦除'}).click()
  await expect(page.getByText('拖动擦除可切断曲线')).toBeVisible()
  await page.mouse.move(bounds.x+300,bounds.y+175)
  await page.mouse.down()
  await page.mouse.move(bounds.x+300,bounds.y+225,{steps:6})
  await page.mouse.up()
  await expect(objects.locator('option',{hasText:/^手绘曲线$/})).toHaveCount(2)

  await menu.getByRole('button',{name:'按笔画擦除'}).click()
  await expect(page.getByText('整笔删除')).toBeVisible()
  await page.mouse.move(bounds.x+210,bounds.y+175)
  await page.mouse.down()
  await page.mouse.move(bounds.x+210,bounds.y+225,{steps:6})
  await page.mouse.up()
  await expect(objects.locator('option',{hasText:/^手绘曲线$/})).toHaveCount(1)

  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  const center=px(250,320)
  await drawStroke(page,circlePixels(center.x,center.y,40,24))
  await expect(objects.locator('option:checked')).toHaveText('手绘物块')
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await page.getByRole('group',{name:'橡皮模式'}).getByRole('button',{name:'按拖动擦除'}).click()
  await page.mouse.move(bounds.x+250,bounds.y+300)
  await page.mouse.down()
  await page.mouse.move(bounds.x+250,bounds.y+345,{steps:6})
  await page.mouse.up()
  await expect(objects.locator('option',{hasText:/^手绘物块$/})).toHaveCount(0)
})