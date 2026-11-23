import { expect, test } from '@playwright/test'
import { body, emptyExperiment } from '../src/model'
import { openImportedScene, pixelOf } from './helpers'

for(const surface of ['地面','斜面'] as const) {
  test('previews and commits block contact with '+surface+' as one undoable drag',async({page})=>{
    const angle=surface==='斜面'?Math.atan(.25):0
    const scene={...emptyExperiment(),title:'贴合测试'+surface,camera:{x:0,y:2.2,scale:80},bodies:[
      body('滑块',{kind:'rectangle',width:.8,height:.6},0,2.2,{restitution:0,friction:.2}),
      body(surface,{kind:'surface',width:6,height:.2},0,1,{angle,restitution:0}),
    ]}
    const canvas=await openImportedScene(page,scene)
    const viewport=page.getByRole('region',{name:'模拟视图'})
    const hint=viewport.getByRole('status')
    const bounds=(await canvas.boundingBox())!
    const start=pixelOf(bounds,scene.camera,{x:0,y:2.2})
    const surfaceCenter=pixelOf(bounds,scene.camera,{x:0,y:1})
    const move=(x:number,y:number)=>page.mouse.move(x,y,{steps:10})
    const x=page.getByRole('spinbutton',{name:'X 坐标'})
    const y=page.getByRole('spinbutton',{name:'Y 坐标'})
    const rotation=page.getByRole('spinbutton',{name:'旋转角'})
    const initialY=await y.inputValue()
    const normalDistance=async()=>-Math.sin(angle)*(Number(await x.inputValue()))+Math.cos(angle)*(Number(await y.inputValue())-1)

    await move(start.x,start.y)
    await page.mouse.down()
    await move(start.x,start.y+56)
    await expect(hint).toHaveText('松手贴合 '+surface+'上表面')
    await expect(y).toHaveValue(initialY)
    await page.mouse.up()
    await expect(hint).toHaveCount(0)
    expect(await normalDistance()).toBeCloseTo(.4,3)
    expect(Number(await rotation.inputValue())).toBeCloseTo(angle*180/Math.PI,4)
    await page.getByRole('button',{name:'撤销',exact:true}).click()
    await expect(y).toHaveValue(initialY)
    await expect(rotation).toHaveValue('0')

    await move(start.x,start.y)
    await page.mouse.down()
    await move(start.x,start.y+56)
    await expect(hint).toBeVisible()
    await page.keyboard.down('Alt')
    await expect(hint).toHaveCount(0)
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await expect(rotation).toHaveValue('0')
    expect(Number(await y.inputValue())).toBeCloseTo(2.2-56/80,4)
    const bypassY=Number(await y.inputValue())
    const bypass=pixelOf(bounds,scene.camera,{x:Number(await x.inputValue()),y:bypassY})

    // Cross the surface centerline in one drag: a preview on each side, one commit.
    await move(bypass.x,bypass.y)
    await page.mouse.down()
    await move(surfaceCenter.x,surfaceCenter.y-4)
    await expect(hint).toHaveText('松手贴合 '+surface+'上表面')
    await move(surfaceCenter.x,surfaceCenter.y+5)
    await expect(hint).toHaveText('松手贴合 '+surface+'下表面')
    await page.mouse.up()
    expect(await normalDistance()).toBeCloseTo(-.4,3)
    await page.getByRole('button',{name:'撤销',exact:true}).click()
    expect(Number(await y.inputValue())).toBeCloseTo(bypassY,4)
  })
}