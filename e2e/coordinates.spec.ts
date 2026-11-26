import { expect, test, type Locator } from '@playwright/test'
import { body, emptyExperiment, type Camera, type Point } from '../src/model'
import { openImportedScene, openProperties, pixelOf } from './helpers'

function fixture() {
  return {...emptyExperiment(),title:'坐标系统验收',camera:{x:0,y:2.2,scale:50},environment:{...emptyExperiment().environment,gravity:0},
    bodies:[body('坐标球',{kind:'circle',radius:.35},0,2.2,{restitution:0})]}
}

async function centerColor(canvas:Locator,box:{x:number;y:number},camera:Camera,point:Point) {
  const pixel=pixelOf(box,camera,point)
  return canvas.evaluate((el:HTMLCanvasElement,p:{x:number;y:number})=>{
    const data=el.getContext('2d')!.getImageData(Math.round(p.x*el.width/el.clientWidth),Math.round(p.y*el.height/el.clientHeight),1,1).data
    return [...data]
  },{x:pixel.x-box.x,y:pixel.y-box.y})
}

test('switches coordinate modes and moves the origin without moving the physical body',async({page})=>{
  const scene=fixture(),canvas=await openImportedScene(page,scene),bounds=(await canvas.boundingBox())!
  // The polar origin and Cartesian axes may be drawn below the translucent body.
  const probe={x:scene.bodies[0].position.x+.13,y:scene.bodies[0].position.y+.09}
  await expect.poll(async()=>(await centerColor(canvas,bounds,scene.camera,probe))[3]).toBeGreaterThan(0)
  const before=await centerColor(canvas,bounds,scene.camera,probe)
  const mode=page.getByRole('combobox',{name:'坐标系'})
  await expect(mode).toHaveValue('cartesian')
  await mode.selectOption('polar')
  await expect(page.locator('.coordinates')).toContainText('θ')
  await page.mouse.move(bounds.x+bounds.width/2+50,bounds.y+bounds.height/2-50)
  await expect(page.locator('.coordinates')).toContainText('r')
  await expect.poll(async()=>{
    const after=await centerColor(canvas,(await canvas.boundingBox())!,scene.camera,probe)
    return after.every((channel,index)=>Math.abs(channel-before[index])<=4)
  }).toBe(true)

  await page.getByRole('button',{name:'移动坐标原点',exact:true}).click()
  const start={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}
  await page.mouse.move(start.x,start.y)
  await page.mouse.down()
  await page.mouse.move(start.x+50,start.y-50,{steps:6})
  await page.mouse.up()
  await openProperties(page,'world')
  await expect(page.getByRole('spinbutton',{name:'坐标原点 X'})).toHaveValue('1')
  await expect(page.getByRole('spinbutton',{name:'坐标原点 Y'})).toHaveValue('1')
  await openProperties(page)
  await expect(page.getByRole('spinbutton',{name:'世界 X',exact:true})).toHaveValue('0')
  await expect(page.getByRole('spinbutton',{name:'世界 Y',exact:true})).toHaveValue('2.2')

  await page.getByRole('button',{name:'保存实验',exact:true}).click()
  await expect(page.getByRole('button',{name:'保存实验',exact:true})).toContainText('已保存')
  await page.goto('/experiments')
  await page.getByRole('article').filter({has:page.getByRole('heading',{name:scene.title,exact:true})}).getByRole('link',{name:'打开',exact:true}).click()
  await expect(page.getByRole('combobox',{name:'坐标系'})).toHaveValue('polar')
  await openProperties(page,'world')
  await expect(page.getByRole('spinbutton',{name:'坐标原点 X'})).toHaveValue('1')
  await expect(page.getByRole('spinbutton',{name:'坐标原点 Y'})).toHaveValue('1')
})

test('commits the final origin position from a rapid pointer sequence',async({page})=>{
  const canvas=await openImportedScene(page,fixture())
  await page.getByRole('button',{name:'移动坐标原点',exact:true}).click()
  await canvas.evaluate(el=>{
    const rect=el.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2
    el.setPointerCapture=()=>{}
    const base={pointerId:7,pointerType:'mouse',button:0,bubbles:true,clientX:x,clientY:y}
    el.dispatchEvent(new PointerEvent('pointerdown',{...base,buttons:1}))
    el.dispatchEvent(new PointerEvent('pointermove',{...base,buttons:1,clientX:x+50,clientY:y-50}))
    el.dispatchEvent(new PointerEvent('pointerup',{...base,buttons:0,clientX:x+50,clientY:y-50}))
  })
  await openProperties(page,'world')
  await expect(page.getByRole('spinbutton',{name:'坐标原点 X'})).toHaveValue('1')
  await expect(page.getByRole('spinbutton',{name:'坐标原点 Y'})).toHaveValue('1')
})

test.describe('narrow touch viewport',()=>{
  test.use({viewport:{width:320,height:568},hasTouch:true,isMobile:true})

  test('keeps coordinate and zoom controls inside the canvas',async({page})=>{
    const scene={...fixture(),camera:{x:0,y:2.2,scale:5},coordinates:{mode:'polar' as const,origin:{x:-10000,y:0}}}
    const canvas=await openImportedScene(page,scene),bounds=(await canvas.boundingBox())!
    expect(bounds.width).toBe(320)
    const zoom=(await page.locator('.zoom').boundingBox())!
    expect(zoom.x).toBeGreaterThanOrEqual(bounds.x)
    expect(zoom.x+zoom.width).toBeLessThanOrEqual(bounds.x+bounds.width)
    await page.getByRole('button',{name:'放大',exact:true}).click()
    await expect(page.getByRole('button',{name:'放大',exact:true})).toBeVisible()
  })
})

test('none mode hides coordinate readouts and polar fields follow the display origin',async({page})=>{
  const scene=fixture(),canvas=await openImportedScene(page,scene)
  await page.getByRole('combobox',{name:'坐标系'}).selectOption('none')
  await expect(page.locator('.coordinates')).toHaveText('无坐标系')
  await expect(canvas).toBeVisible()
  await page.getByRole('combobox',{name:'坐标系'}).selectOption('polar')
  await openProperties(page)
  await expect(page.getByRole('spinbutton',{name:'极径 r'})).toHaveValue('2.2')
  await expect(page.getByRole('spinbutton',{name:'极角 θ'})).toHaveValue('90')
  await expect(page.getByRole('spinbutton',{name:'径向速度'})).toHaveValue('0')
  await expect(page.getByRole('spinbutton',{name:'切向速度'})).toHaveValue('0')
})
