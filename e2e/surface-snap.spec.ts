import { expect, test } from '@playwright/test'

for(const surface of ['地面','斜面'] as const) {
  test('previews and commits block contact with '+surface+' as one undoable drag',async({page})=>{
    await page.goto('/lab?new=1')
    const tools=page.getByRole('complementary',{name:'场景工具'})
    const canvas=page.getByLabel('物理场景')
    const viewport=page.getByRole('region',{name:'模拟视图'})
    const angle=surface==='斜面'?Math.atan(.25):0
    const bounds=(await canvas.boundingBox())!
    const move=(x:number,y:number)=>page.mouse.move(bounds.x+x,bounds.y+y,{steps:10})
    const centerX=bounds.width/2
    const surfaceY=245
    const startY=115
    const nearY=surfaceY-(surface==='斜面'?42:36)
    await tools.getByRole('button',{name:surface,exact:true}).click()
    await move(centerX-160,surfaceY+(angle?40:0))
    await page.mouse.down()
    await move(centerX+160,surfaceY-(angle?40:0))
    await page.mouse.up()
    const y=page.getByRole('spinbutton',{name:'Y 坐标'})
    const x=page.getByRole('spinbutton',{name:'X 坐标'})
    const rotation=page.getByRole('spinbutton',{name:'旋转角'})
    const floorX=Number(await x.inputValue())
    const floorY=Number(await y.inputValue())
    await tools.getByRole('button',{name:'矩形',exact:true}).click()
    await canvas.click({position:{x:centerX,y:startY}})
    const initialY=await y.inputValue()
    await tools.getByRole('button',{name:'选择',exact:true}).click()

    await move(centerX,startY)
    await page.mouse.down()
    await move(centerX,nearY)
    const hint=viewport.getByRole('status')
    await expect(hint).toHaveText('松手贴合 '+surface+'上表面')
    await expect(y).toHaveValue(initialY)
    await page.keyboard.down('Alt')
    await expect(hint).toHaveCount(0)
    await page.keyboard.up('Alt')
    await expect(hint).toHaveText('松手贴合 '+surface+'上表面')
    await page.mouse.up()
    await expect(hint).toHaveCount(0)
    const snapX=Number(await x.inputValue()), snapY=Number(await y.inputValue())
    expect(Number(await rotation.inputValue())).toBeCloseTo(angle*180/Math.PI,4)
    expect(-Math.sin(angle)*(snapX-floorX)+Math.cos(angle)*(snapY-floorY)).toBeCloseTo(.39,4)
    await page.getByRole('button',{name:'撤销',exact:true}).click()
    await expect(y).toHaveValue(initialY)
    await expect(rotation).toHaveValue('0')

    await move(centerX,startY)
    await page.mouse.down()
    await move(centerX,nearY)
    await expect(hint).toBeVisible()
    await page.keyboard.down('Alt')
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await expect(rotation).toHaveValue('0')
    expect(Number(await y.inputValue())).toBeCloseTo(Number(initialY)-(nearY-startY)/80,4)

    // Cross the surface centerline in one drag: a preview on each side, one commit.
    await move(centerX,nearY)
    await page.mouse.down()
    await move(centerX,surfaceY-4)
    await expect(hint).toHaveText('松手贴合 '+surface+'上表面')
    await move(centerX,surfaceY+5)
    await expect(hint).toHaveText('松手贴合 '+surface+'下表面')
    await page.mouse.up()
    const undersideDistance=-Math.sin(angle)*(Number(await x.inputValue())-floorX)+Math.cos(angle)*(Number(await y.inputValue())-floorY)
    expect(undersideDistance).toBeCloseTo(-.39,4)
    await page.getByRole('button',{name:'撤销',exact:true}).click()
    expect(Number(await y.inputValue())).toBeCloseTo(Number(initialY)-(nearY-startY)/80,4)
  })
}
