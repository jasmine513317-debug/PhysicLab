import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('compares the double pendulum trajectories and clears the run on editing',async({page})=>{
  await page.goto('/lab?extension=double-pendulum')
  await expect(page.getByRole('heading',{name:'初值敏感性与步长误差'})).toBeVisible()
  await page.getByLabel('扩展实验播放速度').selectOption('8')
  await page.getByRole('button',{name:'运行',exact:true}).click()
  await expect(page.getByLabel('扩展实验时间')).not.toHaveText('0 s')
  const perturbation=page.getByRole('spinbutton',{name:/对照组第二摆角扰动/})
  await perturbation.fill('0')
  await perturbation.press('Enter')
  await expect(page.getByLabel('扩展实验时间')).toHaveText('0 s')
  await expect(page.getByRole('region',{name:'测量读数'}).locator('dd').first()).toHaveText('0 m')
  await expect(page.getByRole('button',{name:'运行',exact:true})).toBeEnabled()
})

test('keeps induced voltage when the loop is opened and exports the field data',async({page})=>{
  await page.goto('/lab?domain=electromagnetism')
  await page.getByRole('navigation',{name:'静电实验模板'}).getByRole('link',{name:'电磁感应',exact:true}).click()
  const rows=page.getByRole('region',{name:'测量读数'}).locator('dd')
  await expect(rows.nth(2)).toHaveText('-0.0866 V')
  await expect(rows.nth(3)).toHaveText('-0.0433 A')
  await page.getByLabel('回路状态').selectOption('open')
  await page.getByRole('button',{name:'单步推进'}).click()
  await expect(rows.nth(2)).toHaveText('-0.0866 V')
  await expect(rows.nth(3)).toHaveText('0 A')
  const waiting=page.waitForEvent('download')
  await page.getByRole('button',{name:'导出数据 CSV'}).click()
  expect(await readFile(await (await waiting).path(),'utf8')).toContain('field_T,flux_Wb,emf_V,current_A')
})

test('edits a three-body initial condition and reopens it from the shared library',async({page})=>{
  await page.goto('/lab?domain=astrophysics')
  await page.locator('#app-content').getByRole('link',{name:'三体引力',exact:true}).click()
  const body=page.getByRole('group',{name:'天体 3'})
  await body.getByRole('spinbutton',{name:/位置 X/}).fill('.015')
  await body.getByRole('spinbutton',{name:/位置 X/}).press('Enter')
  await page.getByRole('button',{name:'单步推进'}).click()
  await expect(page.getByLabel('扩展实验时间')).not.toHaveText('0 年')
  await expect(page.getByRole('region',{name:'测量读数'})).toContainText('总角动量漂移')
  await page.getByRole('button',{name:'保存实验'}).click()
  await expect(page.getByRole('button',{name:'已保存'})).toBeVisible()
  await page.goto('/experiments')
  await page.getByRole('link',{name:'预览：三体引力'}).click()
  await expect(page.getByRole('group',{name:'天体 3'}).getByRole('spinbutton',{name:/位置 X/})).toHaveValue('0.015')
})

test('reports incoming and outgoing flyby measurements in both frames on mobile',async({page})=>{
  await page.setViewportSize({width:375,height:812})
  await page.goto('/lab?extension=gravity-assist')
  await expect(page.getByRole('heading',{name:'引力弹弓',exact:true})).toBeVisible()
  await page.getByLabel('画布参考系').selectOption('star')
  await page.getByLabel('扩展实验播放速度').selectOption('8')
  await page.getByRole('button',{name:'运行',exact:true}).click()
  const measurements=page.getByRole('region',{name:'飞掠测量'})
  await expect(measurements).toContainText('已记录进入和离开测量半径的读数。')
  for(const [name,min,max] of [['恒星系速度',7,10],['行星系速度',-.03,.03]] as const) {
    const delta=Number(await measurements.getByRole('row',{name:new RegExp(name)}).getByRole('cell').last().innerText())
    expect(delta).toBeGreaterThan(min)
    expect(delta).toBeLessThan(max)
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(375)
})
