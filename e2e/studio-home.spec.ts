import { expect, test } from '@playwright/test'
import { emptyExperiment } from '../src/model'
test('keeps the cinematic scene as the home page after initialization',async({page})=>{
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'让想法，成为实验。',exact:true})).toBeVisible()
  await expect(page.getByText('PhysicLab',{exact:true})).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('link',{name:'创建实验',exact:true})).toHaveCount(1)
  await expect(page.locator('.launch-atmosphere')).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.locator('.home-domains,.home-tools')).toHaveCount(0)
})
test('chooses mechanics inside the workbench before creating a blank scene', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '创建实验', exact: true }).click()

  await expect(page.getByRole('heading',{name:'选择实验方向'})).toBeVisible()
  await page.getByRole('link',{name:'力学',exact:true}).click()
  await expect(page).toHaveURL(/\/lab\?new=1&domain=mechanics$/)
  await expect(page.getByLabel('实验标题')).toHaveValue(emptyExperiment().title)
  await expect(page.getByLabel('物理场景')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('opens a blank electric bench and builds a three-dimensional celestial scene',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/lab?new=1&choose=1')
  await page.getByRole('link',{name:'电磁学',exact:true}).click()
  await expect(page.getByLabel('电场画布')).toBeVisible()
  await expect(page.getByRole('group',{name:'静电工具'})).toBeVisible()
  await page.goBack()
  await page.getByRole('link',{name:'三维天体物理',exact:true}).click()
  await expect(page.getByLabel('三维实验画布')).toBeVisible()
  const units=page.getByLabel('添加天体模型')
  await units.selectOption('star')
  await units.selectOption('planet')
  await expect(page.getByLabel('三维对象').locator('option',{hasText:'恒星'})).toHaveCount(1)
  await expect(page.getByLabel('三维对象').locator('option',{hasText:'行星'})).toHaveCount(1)
  await page.getByRole('button',{name:'三维单步'}).click()
  await expect(page.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await page.getByRole('button',{name:'保存三维实验'}).click()
  await expect(page).toHaveURL(/spatial=/)
  await page.reload()
  await expect(page.getByLabel('三维模拟时间')).toHaveText('0.017 s')
  await expect(page.getByLabel('添加天体模型')).toBeVisible()
})

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`fits the home screen at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', {level:1})).toBeVisible()
    await expect(page.locator('#app-sidebar, .sidebar-scrim, .mobile-topbar')).toHaveCount(0)

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      contentWidth: document.querySelector('main')?.getBoundingClientRect().width,
    }))
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth)
    expect(dimensions.contentWidth).toBe(dimensions.viewportWidth)
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight + 1)
    await expect(page.getByRole('link', { name: '创建实验', exact: true })).toBeInViewport()
    await expect(page.locator('.launch-brand')).toBeVisible()
  })
}
