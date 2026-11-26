import { expect, test } from '@playwright/test'
import { circlePixels, drawStroke, openProperties } from './helpers'

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
  await openProperties(page)
  await expect(objects.locator('option:checked')).toHaveText('手绘直线')
  await page.getByRole('button',{name:'关闭参数面板'}).click()

  await page.reload()
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await expect(tools.getByRole('button',{name:'快捷颜色 蓝色'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'画笔粗细 粗'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'自动规整 立即'})).toHaveAttribute('aria-pressed','true')

  await tools.getByRole('button',{name:'自动规整 关闭'}).click()
  await drawStroke(page,[px(150,240),px(240,244),px(330,240),px(450,243)])
  await openProperties(page)
  await expect(objects.locator('option:checked')).toHaveText('手绘曲线（静态斜面/碰撞曲线）')
  await page.getByRole('button',{name:'关闭参数面板'}).click()

  await tools.getByRole('button',{name:'自动规整 停留'}).click()
  await drawStroke(page,[px(150,300),px(240,304),px(330,300),px(450,303)],950)
  await openProperties(page)
  await expect(objects.locator('option:checked')).toHaveText('手绘直线')
})

test('previews the current ink color and width instead of mount-time settings',async({page})=>{
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await tools.getByRole('button',{name:'快捷颜色 蓝色'}).click()
  await tools.getByRole('button',{name:'画笔粗细 粗'}).click()
  await tools.getByRole('button',{name:'自动规整 关闭'}).click()
  const canvas=page.getByLabel('物理场景')
  const bounds=(await canvas.boundingBox())!
  const start={x:bounds.x+180,y:bounds.y+230},end={x:bounds.x+420,y:bounds.y+230}
  await page.mouse.move(start.x,start.y)
  await page.mouse.down()
  await page.mouse.move(end.x,end.y,{steps:8})
  const sample=()=>canvas.evaluate((node:HTMLCanvasElement,points)=>{
    const context=node.getContext('2d')!,dpr=node.width/node.clientWidth
    const x=(points.start.x+points.end.x)/2-points.bounds.x,y=(points.start.y+points.end.y)/2-points.bounds.y
    const pixels=context.getImageData(Math.round((x-5)*dpr),Math.round((y-5)*dpr),Math.round(10*dpr),Math.round(10*dpr)).data
    const rows=new Set<number>()
    for(let i=0;i<pixels.length;i+=4)if(pixels[i+2]>150&&pixels[i+2]>pixels[i]+60&&pixels[i+1]>pixels[i]+30)rows.add(Math.floor(i/4/Math.round(10*dpr)))
    return rows.size
  },{start,end,bounds})
  await expect.poll(sample).toBeGreaterThanOrEqual(4)
  await page.mouse.up()
})

test('recognizes after 0.9 seconds of stillness and cancels when movement resumes',async({page})=>{
  await page.goto('/lab?new=1')
  const canvas=page.getByLabel('物理场景')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await tools.getByRole('button',{name:'自动规整 停留'}).click()
  const bounds=(await canvas.boundingBox())!
  const start={x:bounds.x+180,y:bounds.y+230}
  const end={x:bounds.x+420,y:bounds.y+234}
  await page.mouse.move(start.x,start.y)
  await page.mouse.down()
  await page.mouse.move(end.x,end.y,{steps:8})
  await expect(page.getByRole('status')).toContainText('按住不动 0.9 秒',{timeout:300})
  await expect(page.getByRole('status')).toContainText('已停留 0.9 秒',{timeout:1200})
  await page.mouse.move(end.x+80,end.y+60,{steps:4})
  await expect(page.getByRole('status')).not.toContainText('已停留 0.9 秒')
  await page.mouse.up()
  await openProperties(page)
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText('手绘曲线（静态斜面/碰撞曲线）')
})

test('draws the selected semantic role and supports undoing regularization',async({page})=>{
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await expect(tools.getByRole('group',{name:'绘制用途'})).toBeVisible()
  await tools.getByRole('button',{name:'绘制用途 视觉标记'}).click()
  await tools.getByRole('button',{name:'自动规整 立即'}).click()
  const bounds=(await page.getByLabel('物理场景').boundingBox())!
  await drawStroke(page,[
    {x:bounds.x+220,y:bounds.y+250},{x:bounds.x+280,y:bounds.y+250},
    {x:bounds.x+310,y:bounds.y+210},{x:bounds.x+340,y:bounds.y+250},
    {x:bounds.x+400,y:bounds.y+250},{x:bounds.x+280,y:bounds.y+250},
  ])
  await openProperties(page)
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option:checked')).toHaveText(/^手绘/)
  await expect(page.getByText('静态物体 · 视觉标记',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'关闭参数面板'}).click()
  await page.getByRole('button',{name:'撤销'}).click()
  await expect(page.getByRole('combobox',{name:'当前物体'}).locator('option')).toHaveCount(0)
})

test('edits semantic roles, charge and collision geometry with reversible changes',async({page})=>{
  await page.goto('/lab?new=1')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await tools.getByRole('button',{name:'绘制用途 视觉标记'}).click()
  const bounds=(await page.getByLabel('物理场景').boundingBox())!
  await drawStroke(page,[{x:bounds.x+180,y:bounds.y+240},{x:bounds.x+280,y:bounds.y+210},{x:bounds.x+380,y:bounds.y+240}])
  await openProperties(page)
  const role=page.getByLabel('物体角色')
  await expect(role).toHaveValue('marker')
  await expect(page.getByText('只显示，不参与碰撞',{exact:true})).toBeVisible()
  await expect(page.getByRole('spinbutton',{name:'质量'})).toHaveCount(0)
  await role.selectOption('field')
  await expect(page.getByRole('spinbutton',{name:'电荷量'})).toHaveValue('10')
  await expect(page.getByText('静态物体 · 场源',{exact:true})).toBeVisible()
  await page.getByRole('spinbutton',{name:'电荷量'}).fill('-25')
  await page.getByRole('spinbutton',{name:'电荷量'}).press('Enter')
  await role.selectOption('boundary')
  await expect(page.getByRole('spinbutton',{name:'摩擦系数'})).toBeVisible()
  await role.selectOption('track')
  await expect(page.getByText(/静态碰撞轨道 · [0-9]+ 个顶点/)).toBeVisible()
  await expect(page.getByText('静态物体 · 轨道',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(role).toHaveValue('boundary')
})

test('keeps selected open-path roles visually distinct and persists their properties',async({page})=>{
  await page.goto('/lab?new=1')
  await page.getByLabel('实验标题').fill('角色保存验收')
  const tools=page.getByRole('complementary',{name:'场景工具'})
  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  await tools.getByRole('button',{name:'绘制用途 视觉标记'}).click()
  const bounds=(await page.getByLabel('物理场景').boundingBox())!
  await drawStroke(page,[{x:bounds.x+180,y:bounds.y+240},{x:bounds.x+280,y:bounds.y+210},{x:bounds.x+380,y:bounds.y+240}])
  await openProperties(page)
  const canvas=page.getByLabel('物理场景'),role=page.getByLabel('物体角色')
  const pixels=()=>canvas.evaluate((node:HTMLCanvasElement)=>node.toDataURL())
  const marker=await pixels()
  await role.selectOption('boundary')
  const boundary=await pixels()
  await role.selectOption('track')
  const track=await pixels()
  expect(new Set([marker,boundary,track]).size).toBe(3)
  await role.selectOption('field')
  await page.getByRole('spinbutton',{name:'电荷量'}).fill('-25')
  await page.getByRole('spinbutton',{name:'电荷量'}).press('Enter')
  await page.getByRole('button',{name:'保存实验',exact:true}).click()
  await expect(page.locator('.lab-message')).toContainText('实验已保存')
  await page.reload()
  await openProperties(page)
  const objectId=await page.getByLabel('当前物体').locator('option').filter({hasText:/^手绘/}).getAttribute('value')
  await page.getByLabel('当前物体').selectOption(objectId!)
  await expect(page.getByLabel('物体角色')).toHaveValue('field')
  await expect(page.getByRole('spinbutton',{name:'电荷量'})).toHaveValue('-25')
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
  await openProperties(page)
  await expect(objects.locator('option:checked')).toHaveText('手绘曲线（静态斜面/碰撞曲线）')
  await page.getByRole('button',{name:'关闭参数面板'}).click()
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await expect(tools.getByRole('button',{name:'按拖动'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'橡皮大小 大'})).toHaveAttribute('aria-pressed','true')
  await expect(tools.getByRole('button',{name:'擦完回绘制'})).toHaveAttribute('aria-pressed','true')

  await page.mouse.move(bounds.x+300,bounds.y+180)
  await page.mouse.down()
  await page.mouse.move(bounds.x+300,bounds.y+235,{steps:6})
  await page.mouse.up()
  await openProperties(page)
  await expect(objects.locator('option',{hasText:/^手绘曲线（静态斜面\/碰撞曲线）$/})).toHaveCount(2)
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
  await openProperties(page)
  await expect(objects.locator('option:checked')).toHaveText('手绘曲线（静态斜面/碰撞曲线）')
  await page.getByRole('button',{name:'关闭参数面板'}).click()

  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  const menu=page.getByRole('group',{name:'橡皮模式'})
  await menu.getByRole('button',{name:'按拖动擦除'}).click()
  await expect(page.getByText('拖动擦除可切断曲线')).toBeVisible()
  await page.mouse.move(bounds.x+300,bounds.y+175)
  await page.mouse.down()
  await page.mouse.move(bounds.x+300,bounds.y+225,{steps:6})
  await page.mouse.up()
  await openProperties(page)
  await expect(objects.locator('option',{hasText:/^手绘曲线（静态斜面\/碰撞曲线）$/})).toHaveCount(2)
  await page.getByRole('button',{name:'关闭参数面板'}).click()

  await menu.getByRole('button',{name:'按笔画擦除'}).click()
  await expect(page.getByText('整笔删除')).toBeVisible()
  await page.mouse.move(bounds.x+210,bounds.y+175)
  await page.mouse.down()
  await page.mouse.move(bounds.x+210,bounds.y+225,{steps:6})
  await page.mouse.up()
  await openProperties(page)
  await expect(objects.locator('option',{hasText:/^手绘曲线（静态斜面\/碰撞曲线）$/})).toHaveCount(1)
  await page.getByRole('button',{name:'关闭参数面板'}).click()

  await tools.getByRole('button',{name:'绘制',exact:true}).click()
  const center=px(250,320)
  await drawStroke(page,circlePixels(center.x,center.y,40,24))
  await openProperties(page)
  await expect(objects.locator('option:checked')).toHaveText('手绘物块')
  await page.getByRole('button',{name:'关闭参数面板'}).click()
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await tools.getByRole('button',{name:'橡皮',exact:true}).click()
  await page.getByRole('group',{name:'橡皮模式'}).getByRole('button',{name:'按拖动擦除'}).click()
  await page.mouse.move(bounds.x+250,bounds.y+300)
  await page.mouse.down()
  await page.mouse.move(bounds.x+250,bounds.y+345,{steps:6})
  await page.mouse.up()
  await openProperties(page)
  await expect(objects.locator('option',{hasText:/^手绘物块$/})).toHaveCount(0)
})