import { expect, type Locator, type Page } from '@playwright/test'
import type { Camera, Experiment, Point } from '../src/model'

export async function openImportedScene(page: Page, scene: Experiment) {
  await page.goto('/experiments')
  await page.getByLabel('导入实验 JSON').setInputFiles({
    name: scene.title + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)),
  })
  const article = page.getByRole('article').filter({has: page.getByRole('heading', {name: scene.title, exact: true})})
  await article.getByRole('link', {name: '打开', exact: true}).click()
  const canvas = page.getByLabel('物理场景')
  await expect(canvas).toBeVisible()
  return canvas
}

export async function openWorkbenchPanel(page: Page, name: '属性' | '环境' | '分析') {
  const more = page.locator('.mobile-more')
  if (await more.isVisible() && await more.getAttribute('aria-expanded') !== 'true') await more.click()
  await page.locator('.lab-top, .workbench-more').getByRole('button', { name, exact: true }).click()
}

export async function openProperties(page: Page, tab: 'object' | 'world' = 'object') {
  await openWorkbenchPanel(page, tab === 'world' ? '环境' : '属性')
}

export async function openAnalysis(page: Page) {
  await openWorkbenchPanel(page, '分析')
}

export function pixelOf(box: {x: number; y: number; width: number; height: number}, camera: Camera, point: Point): Point {
  return {x: box.x + box.width / 2 + (point.x - camera.x) * camera.scale, y: box.y + box.height / 2 - (point.y - camera.y) * camera.scale}
}

export async function drawStroke(page: Page, points: readonly Point[], holdMs = 0) {
  await page.mouse.move(points[0].x, points[0].y)
  await page.mouse.down({button: 'left'})
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, {steps: 4})
  if (holdMs) await page.waitForTimeout(holdMs)
  await page.mouse.up({button: 'left'})
}

export function circlePixels(cx: number, cy: number, radius: number, count = 32): Point[] {
  return Array.from({length: count}, (_, i) => {
    const angle = i * 2 * Math.PI / count
    return {x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle)}
  })
}

export async function dragMouse(page: Page, from: Point, to: Point, button: 'left' | 'right' = 'left', steps = 6) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({button})
  await page.mouse.move(to.x, to.y, {steps})
  await page.mouse.up({button})
}

export async function touchStroke(page: Page, points: readonly Point[], holdMs = 0) {
  if(page.context().browser()?.browserType().name()!=='chromium') {
    const canvas=page.getByLabel('物理场景')
    // These engines expose native tap through Playwright but have no CDP touch-move API.
    await canvas.evaluate(async (element,{points,holdMs})=>{
      const node=element as HTMLCanvasElement
      const id=200
      const capture=node.setPointerCapture
      node.setPointerCapture=function(pointerId){if(pointerId!==id)capture.call(this,pointerId)}
      function send(type:string,point:Point) {
        node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',
          isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:point.x,clientY:point.y}))
      }
      try {
        send('pointerdown',points[0])
        for(const point of points.slice(1))send('pointermove',point)
        if(holdMs)await new Promise(resolve=>setTimeout(resolve,holdMs))
        send('pointerup',points.at(-1)!)
      } finally {delete (node as Partial<HTMLCanvasElement>).setPointerCapture}
    },{points,holdMs})
    return
  }
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: points[0].x, y: points[0].y}]})
    for (const point of points.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: point.x, y: point.y}]})
    }
    if (holdMs) await page.waitForTimeout(holdMs)
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  } finally {
    await cdp.detach()
  }
}

export async function pinchOut(page:Page,canvas:Locator) {
  const box=(await canvas.boundingBox())!
  const x=box.x+box.width/2,y=box.y+box.height*.55
  const start=[{id:201,x:x-30,y},{id:202,x:x+30,y}]
  const end=[{...start[0],x:x-55},{...start[1],x:x+55}]
  if(page.context().browser()?.browserType().name()==='chromium') {
    const cdp=await page.context().newCDPSession(page)
    try {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:start})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:end})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    } finally {await cdp.detach()}
    return
  }
  await canvas.evaluate((element,{start,end})=>{
    const node=element as HTMLCanvasElement
    const capture=node.setPointerCapture
    node.setPointerCapture=function(pointerId){if(!start.some(point=>point.id===pointerId))capture.call(this,pointerId)}
    function send(type:string,points:typeof start) {
      for(const point of points)node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:point.id,
        pointerType:'touch',isPrimary:point.id===start[0].id,button:0,buttons:type==='pointerup'?0:1,clientX:point.x,clientY:point.y}))
    }
    try {send('pointerdown',start);send('pointermove',end);send('pointerup',end)}
    finally {delete (node as Partial<HTMLCanvasElement>).setPointerCapture}
  },{start,end})
}
