import { expect, test } from '@playwright/test'
import { emptyExperiment } from '../src/model'
import { openImportedScene, pixelOf } from './helpers'

test('uses the three-region workbench with optional panels closed', async ({ page }) => {
  await openImportedScene(page, emptyExperiment())
  await expect(page.locator('.lab-top')).toBeVisible()
  await expect(page.getByLabel('物理场景')).toBeVisible()
  await expect(page.locator('.workbench > .work-center > .tools')).toBeVisible()
  await expect(page.getByRole('navigation', { name: '实验领域' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '定时运行' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: '参数面板' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '数据分析' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '分析', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '环境', exact: true })).toBeVisible()
})

test('opens environment and analysis without stopping the simulation', async ({ page }) => {
  await openImportedScene(page, emptyExperiment())
  const topbar = page.locator('.lab-top')
  await topbar.getByRole('button', { name: '环境', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '重力加速度' })).toHaveValue('9.81')
  await topbar.getByRole('button', { name: '属性', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '当前物体' })).toBeVisible()
  await topbar.getByRole('button', { name: '环境', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '重力加速度' })).toHaveValue('9.81')
  await page.getByRole('button', { name: '关闭参数面板' }).click()
  await expect(page.getByRole('complementary', { name: '参数面板' })).toHaveCount(0)

  await page.getByRole('button', { name: '分析', exact: true }).click()
  await expect(page.getByRole('region', { name: '数据分析' })).toBeVisible()
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭分析面板' }).click()
  await expect(page.getByRole('region', { name: '数据分析' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
})

test('keeps drawing tools usable when analysis opens on short desktops', async ({ page }) => {
  for (const viewport of [{ width: 1366, height: 600 }, { width: 1366, height: 568 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(viewport)
    const scene = emptyExperiment()
    scene.title = `短桌面实验 ${viewport.width}x${viewport.height}`
    await openImportedScene(page, scene)
    await page.locator('.lab-top').getByRole('button', { name: '分析', exact: true }).click()
    await expect(page.getByRole('region', { name: '数据分析' })).toBeVisible()
    const tools = page.getByRole('complementary', { name: '场景工具' })
    const box = await tools.boundingBox()
    if (!box) throw new Error('tools have no box')
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    for (const name of ['绘制', '橡皮', '弹簧']) {
      const tool = tools.getByRole('button', { name, exact: true })
      await tool.click()
      await expect(tool).toHaveAttribute('aria-pressed', 'true')
    }
  }
})

test('double click opens properties without removing transform handles', async ({ page }) => {
  const scene = emptyExperiment()
  scene.bodies = [{ id: 'ball', name: '测试球', type: 'dynamic', position: { x: 0, y: 2 },
    angle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0, mass: 1, friction: 0.3,
    restitution: 0.5, geometry: { kind: 'circle', radius: 0.4 }, color: 'mint' }]
  const canvas = await openImportedScene(page, scene)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no box')
  const point = pixelOf(box, scene.camera, scene.bodies[0].position)
  await expect(page.getByRole('complementary', { name: '参数面板' })).toHaveCount(0)
  await page.mouse.dblclick(point.x, point.y)
  await expect(page.getByRole('complementary', { name: '参数面板' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '质量' })).toHaveValue('1')
  await page.getByRole('button', { name: '关闭参数面板' }).click()
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(page.getByRole('button', { name: '变换物体' })).toBeVisible()
})

test('immersion hides tools without resetting the camera or physics', async ({ page }) => {
  await openImportedScene(page, emptyExperiment())
  const time = page.getByLabel('模拟时间', { exact: true })
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(time).not.toHaveText('0.000 s')
  const before = await time.textContent()
  await page.getByRole('button', { name: '进入沉浸模式' }).click()
  await expect(page.locator('.workbench')).toHaveClass(/immersive/)
  await expect(page.getByLabel('物理场景')).toBeVisible()
  await expect(page.getByRole('button', { name: '退出沉浸模式' })).toBeVisible()
  await expect(time).not.toHaveText(before ?? '')
  await page.getByRole('button', { name: '退出沉浸模式' }).click()
  await expect(page.locator('.workbench')).not.toHaveClass(/immersive/)
})

test('keeps core playback and save controls available on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openImportedScene(page, emptyExperiment())
  for (const name of ['运行', '单步运行', '重置模拟', '保存实验', '更多']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
