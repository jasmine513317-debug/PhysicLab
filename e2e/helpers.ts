import { expect, type Page } from '@playwright/test'
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

export function pixelOf(box: {x: number; y: number; width: number; height: number}, camera: Camera, point: Point): Point {
  return {x: box.x + box.width / 2 + (point.x - camera.x) * camera.scale, y: box.y + box.height / 2 - (point.y - camera.y) * camera.scale}
}

export async function rightStroke(page: Page, points: readonly Point[], holdMs = 0) {
  await page.mouse.move(points[0].x, points[0].y)
  await page.mouse.down({button: 'right'})
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, {steps: 4})
  if (holdMs) await page.waitForTimeout(holdMs)
  await page.mouse.up({button: 'right'})
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