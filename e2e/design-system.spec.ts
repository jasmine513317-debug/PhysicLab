import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { emptyExperiment } from '../src/model'
import { openAnalysis, openImportedScene, openProperties } from './helpers'

async function selectedColors(locator:Locator) {
  await expect(locator).toBeVisible()
  return locator.evaluate(element=>{
    const style=getComputedStyle(element)
    return {background:style.backgroundColor,color:style.color,border:style.borderColor}
  })
}

async function expectNumericStyle(locator:Locator) {
  const style = await locator.evaluate(element=>{
    const computed=getComputedStyle(element)
    const token=getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
    const probe=document.createElement('span')
    probe.style.fontFamily=token
    document.body.append(probe)
    const tokenFamily=getComputedStyle(probe).fontFamily
    probe.remove()
    return {fontFamily:computed.fontFamily,tokenFamily,fontVariantNumeric:computed.fontVariantNumeric}
  })
  expect(style.fontVariantNumeric).toBe('tabular-nums')
  expect(style.fontFamily).toBe(style.tokenFamily)
}

test('uses shared visual tokens and control geometry', async ({ page }) => {
  await openImportedScene(page, emptyExperiment())
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return ['--space-2','--radius-md','--control-height','--icon-size','--selected-bg','--disabled-opacity']
      .map(name => [name, style.getPropertyValue(name).trim()])
  })
  for (const [name,value] of tokens) expect(value, name).not.toBe('')

  const run = page.getByRole('button', { name: '运行', exact: true })
  const step = page.getByRole('button', { name: '单步运行' })
  expect(await run.evaluate(element => getComputedStyle(element).height)).toBe('35px')
  expect(await step.evaluate(element => getComputedStyle(element).height)).toBe('34px')
})

test('keeps disabled, tooltip and focus states consistent', async ({ page }) => {
  await openImportedScene(page, emptyExperiment())
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  await expect(undo).toBeDisabled()
  const before = await undo.evaluate(element => getComputedStyle(element).backgroundColor)
  const box = await undo.boundingBox()
  if (!box) throw new Error('undo button has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  expect(await undo.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(before)

  const icons = page.locator('.lab-top .icon:visible')
  for (let i = 0; i < await icons.count(); i++) {
    await expect(icons.nth(i)).toHaveAttribute('title', /.+/)
  }
  const environment = page.getByRole('button', { name: '环境', exact: true })
  await environment.focus()
  expect(await environment.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
})

test('keeps selected colors stable across domain tools on hover', async ({ page }) => {
  const selectedTools = [
    { path: '/lab?new=1', selector: '.tool.active[aria-pressed=true]' },
    { path: '/lab?domain=electromagnetism', selector: '.electric-toolbar [aria-pressed=true]' },
    { path: '/lab?domain=electromagnetism&extension=rc', selector: '.extended-lab button[aria-pressed=true]' },
    { path: '/geometry', selector: '.geometry-tool[aria-pressed=true]' },
  ]
  let expected: Awaited<ReturnType<typeof selectedColors>> | undefined
  for (const selected of selectedTools) {
    await test.step(selected.path, async () => {
      await page.goto(selected.path)
      const tool = page.locator(selected.selector).first()
      const resting = await selectedColors(tool)
      expected ??= resting
      expect(resting).toEqual(expected)
      await tool.hover()
      expect(await selectedColors(tool)).toEqual(resting)
    })
  }
})

test('uses shared numeric typography across input domains', async ({ page }) => {
  await openImportedScene(page, emptyExperiment())
  await openProperties(page, 'world')
  await expectNumericStyle(page.getByRole('spinbutton', { name: '重力加速度' }))

  await page.goto('/geometry')
  await expectNumericStyle(page.getByRole('spinbutton', { name: '位置 X (m)', exact: true }))

  await page.goto('/lab?domain=astrophysics')
  await expect(page.getByLabel('轨道画布')).toBeVisible()
  await expectNumericStyle(page.getByRole('spinbutton', { name: '质量 M☉' }))
})

test('formats edited values without silently rewriting stored precision', async ({ page }) => {
  const scene = emptyExperiment()
  scene.title = '数值格式精度测试'
  scene.environment.gravity = 12.3456789
  await openImportedScene(page, scene)
  await openProperties(page, 'world')
  const gravity = page.getByRole('spinbutton', { name: '重力加速度' })
  await expect(gravity).toHaveValue('12.3457')
  await gravity.press('Enter')
  await page.getByRole('button', { name: '保存实验', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存实验', exact: true })).toHaveAttribute('title', '实验已保存')

  await page.getByRole('button', { name: '打开实验菜单' }).click()
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出场景 JSON' }).click()
  const download = await waiting
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.environment.gravity).toBe(12.3456789)

  await gravity.fill('23.456789')
  await gravity.press('Enter')
  await expect(gravity).toHaveValue('23.4568')
  await page.getByRole('button', { name: '保存实验', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存实验', exact: true })).toHaveAttribute('title', '实验已保存')
})

const scientificNotationInputs = [
  { path: '/geometry', name: '位置 X (m)' },
  { path: '/lab?domain=astrophysics', name: '质量 M☉' },
  { path: '/lab?domain=electromagnetism', name: '电荷量 nC' },
  { path: '/lab?domain=electromagnetism&extension=particle', name: '粒子质量 kg' },
]

for (const input of scientificNotationInputs) {
  test(`preserves scientific notation in ${input.name}`, async ({ page }) => {
    await page.goto(input.path)
    const field = page.getByRole('spinbutton', { name: input.name, exact: true })
    await field.fill('0.00000123')
    await field.press('Enter')
    await expect(field).toHaveValue('1.230e-6')
  })
}

const domainCameras = [
  { path: '/lab?domain=astrophysics', names: ['缩小轨道视图', '放大轨道视图', '重置轨道视图'] },
  { path: '/lab?domain=electromagnetism', names: ['缩小电场视图', '放大电场视图', '重置电场视图'] },
  { path: '/geometry', names: ['缩小视图', '放大视图'] },
  { path: '/geometry', mode: '三维曲面', names: ['缩小曲面', '放大曲面', '重置三维视图'] },
]

for (const camera of domainCameras) {
  test(`provides native tooltips for ${camera.path}${camera.mode ? ' ' + camera.mode : ''} camera controls`, async ({ page }) => {
    await page.goto(camera.path)
    if (camera.mode) await page.getByRole('button', { name: camera.mode, exact: true }).click()
    for (const name of camera.names) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('title', /.+/)
    }
  })
}

async function expectNoHorizontalOverflow(page:Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }))
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
}

const viewports = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]

for (const viewport of viewports) {
  test(`keeps workspaces and core controls accessible at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const routes = [
      { path: '/', ready: page.getByRole('heading', { level: 1, name: '让想法，成为实验。' }) },
      { path: '/lab?new=1', ready: page.getByLabel('物理场景') },
      { path: '/experiments', ready: page.getByRole('link', { name: '创建实验', exact: true }) },
      { path: '/geometry', ready: page.getByLabel('二维几何画布') },
      { path: '/lab?domain=electromagnetism&new=1', ready: page.getByLabel('电场画布') },
      { path: '/lab?domain=astrophysics&new=1', ready: page.getByLabel('轨道画布') },
    ]
    for (const route of routes) {
      await test.step(route.path, async () => {
        await page.goto(route.path)
        await expect(route.ready).toBeVisible()
        await expectNoHorizontalOverflow(page)
      })
    }

    await test.step('工作台关键控件', async () => {
      await page.goto('/lab?new=1')
      await expect(page.getByLabel('物理场景')).toBeVisible()
      for (const name of ['运行', '单步运行', '重置模拟', '保存实验']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeInViewport()
      }
      const tools = page.getByRole('complementary', { name: '场景工具' })
      for (const name of ['绘制', '连接工具箱']) {
        const tool = tools.getByRole('button', { name, exact: true })
        await expect(tool).toBeInViewport()
        await tool.click()
        await expect(tool).toHaveAttribute('aria-pressed', 'true')
      }
      await openProperties(page)
      await expect(page.getByRole('complementary', { name: '参数面板' })).toBeVisible()
      await expect(page.getByRole('combobox', { name: '当前物体' })).toBeVisible()
      await page.getByRole('button', { name: '关闭参数面板' }).click()
      await openAnalysis(page)
      await expect(page.getByRole('region', { name: '数据分析' })).toBeVisible()
      await page.getByRole('button', { name: '关闭分析面板' }).click()
      await expectNoHorizontalOverflow(page)
    })
  })
}

test('captures the production visual review matrix', async ({ page }) => {
  const shots = [
    { name: 'home-390x844', path: '/', viewport: viewports[0], ready: page.getByRole('heading', { level: 1, name: '让想法，成为实验。' }) },
    { name: 'workbench-844x390', path: '/lab?new=1', viewport: viewports[1], ready: page.getByLabel('物理场景') },
    { name: 'properties-768x1024', path: '/lab?new=1', viewport: viewports[2], ready: page.getByLabel('物理场景'), panel: 'properties' as const },
    { name: 'analysis-1366x768', path: '/lab?new=1', viewport: viewports[3], ready: page.getByLabel('物理场景'), panel: 'analysis' as const },
    { name: 'geometry-1920x1080', path: '/geometry', viewport: viewports[4], ready: page.getByLabel('二维几何画布') },
    { name: 'electrostatic-390x844', path: '/lab?domain=electromagnetism&new=1', viewport: viewports[0], ready: page.getByLabel('电场画布') },
    { name: 'astronomy-1366x768', path: '/lab?domain=astrophysics&new=1', viewport: viewports[3], ready: page.getByLabel('轨道画布') },
  ]
  for (const shot of shots) {
    await page.setViewportSize(shot.viewport)
    await page.goto(shot.path)
    await expect(shot.ready).toBeVisible()
    if (shot.panel === 'properties') await openProperties(page, 'world')
    if (shot.panel === 'analysis') await openAnalysis(page)
    await page.screenshot({ path: `test-results/visual-review/${shot.name}.png` })
  }
})

test.describe('high DPI', () => {
  test.use({ deviceScaleFactor: 2 })

  test('keeps canvas CSS size and drawing buffer in sync', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    const canvases = [
      { path: '/lab?new=1', name: '物理场景' },
      { path: '/geometry', name: '二维几何画布' },
      { path: '/lab?domain=electromagnetism&new=1', name: '电场画布' },
      { path: '/lab?domain=astrophysics&new=1', name: '轨道画布' },
    ]
    for (const canvas of canvases) {
      await test.step(canvas.name, async () => {
        await page.goto(canvas.path)
        const locator = page.getByLabel(canvas.name)
        await expect(locator).toBeVisible()
        await expect.poll(() => locator.evaluate((element:HTMLCanvasElement) => ({
          expectedWidth: Math.round(element.clientWidth * 2),
          expectedHeight: Math.round(element.clientHeight * 2),
          bufferWidth: element.width,
          bufferHeight: element.height,
        }))).toEqual(await locator.evaluate((element:HTMLCanvasElement) => ({
          expectedWidth: Math.round(element.clientWidth * 2),
          expectedHeight: Math.round(element.clientHeight * 2),
          bufferWidth: Math.round(element.clientWidth * 2),
          bufferHeight: Math.round(element.clientHeight * 2),
        })))
      })
    }
  })

  test('captures a DPR 2 production screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('/lab?domain=astrophysics&new=1')
    await expect(page.getByLabel('轨道画布')).toBeVisible()
    await page.screenshot({ path: 'test-results/visual-review/astronomy-1366x768-dpr2.png' })
  })
})
