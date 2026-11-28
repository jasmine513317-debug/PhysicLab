import { expect,test } from '@playwright/test'

test('keeps the orbit and nebula moving on the ready home page',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.setViewportSize({width:390,height:844})
  await page.goto('/')
  const enter=page.getByRole('link',{name:'创建实验'})
  await expect(enter).toBeVisible()
  const canvas=page.locator('.launch-canvas')
  const wisp=page.locator('.launch-wisp-left')
  const firstFrame=await canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())
  const initialTransform=await wisp.evaluate(el=>getComputedStyle(el).transform)
  const brand=await page.locator('.launch-brand').boundingBox()
  await expect.poll(()=>canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())).not.toBe(firstFrame)
  await expect.poll(()=>wisp.evaluate(el=>getComputedStyle(el).transform)).not.toBe(initialTransform)
  expect(await page.locator('.launch-brand').boundingBox()).toEqual(brand)
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect.poll(()=>wisp.evaluate(el=>getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)')
  await expect(enter).toBeVisible()
})

test('reports completed startup tasks before revealing the application and skips the intro on reload',async({page})=>{
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  let unblock=()=>{}
  const blocked=new Promise<void>(resolve=>{unblock=resolve})
  await page.route(/\/assets\/App-[^/]+\.js$/,async route=>{await blocked;await route.continue()})
  try {
    await page.goto('/',{waitUntil:'domcontentloaded'})
    const progress=page.getByRole('progressbar',{name:'启动进度'})
    await expect(progress).toHaveAttribute('aria-valuenow','2')
    await expect(page.getByText('让想法，成为实验。',{exact:true})).toBeVisible()
    await expect(page.getByRole('link',{name:'创建实验'})).toHaveCount(0)
    unblock()
    await expect(page.getByRole('link',{name:'创建实验'})).toBeVisible()
    await expect(progress).toHaveCount(0)
    expect(errors).toEqual([])
    await page.reload()
    await expect(progress).toHaveCount(0)
    await page.getByRole('link',{name:'创建实验'}).click()
    await page.getByRole('link',{name:'力学',exact:true}).click()
    await expect(page.getByLabel('物理场景')).toBeVisible()
    await expect(progress).toHaveCount(0)
  } finally {unblock()}
})

test('renders a still splash with reduced motion and tolerates a missing planet texture',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.setViewportSize({width:390,height:844})
  await page.route(/\/assets\/planet-[^/]+\.jpg$/,route=>route.abort())
  let unblock=()=>{}
  const blocked=new Promise<void>(resolve=>{unblock=resolve})
  await page.route(/\/assets\/App-[^/]+\.js$/,async route=>{await blocked;await route.continue()})
  try {
    await page.goto('/lab?new=1',{waitUntil:'domcontentloaded'})
    const canvas=page.locator('.launch-canvas')
    await expect(canvas).toBeVisible()
    await canvas.evaluate(()=>new Promise(requestAnimationFrame))
    const before=await canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())
    await canvas.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    expect(await canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL())).toBe(before)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
    unblock()
    await expect(page.getByLabel('物理场景')).toBeVisible()
    await expect(canvas).toHaveCount(0)
  } finally {unblock()}
})
