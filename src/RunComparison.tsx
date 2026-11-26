import { useMemo } from 'react'
import type { Sample } from './analysis'
import { DEFAULT_WORLD_BOUNDS, type Experiment } from './model'

// Compare actual measurements only, including the final sample of a timed run.
export function latestCommonSample(current: readonly Sample[], baseline: readonly Sample[]) {
  let i = current.length - 1
  let j = baseline.length - 1
  while (i >= 0 && j >= 0) {
    const a = current[i], b = baseline[j]
    if (a.time === b.time) return { current: a, baseline: b }
    if (a.time > b.time) i--
    else j--
  }
}

type Parameter = {label: string; value: string}
const format = (value: number) => String(Number(value.toPrecision(8)))
const point = (p: {x: number; y: number}, unit: string) => '(' + format(p.x) + ', ' + format(p.y) + ') ' + unit

function parameters(scene: Experiment) {
  const values = new Map<string, Parameter>()
  function add(key: string, label: string, value: string) { values.set(key, {label, value}) }
  const env = scene.environment
  add('gravity', '重力加速度', format(env.gravity) + ' m/s²')
  add('collisions', '物体碰撞', env.collisions ? '开' : '关')
  add('boundaries', '场景边界', env.boundaries ? '开' : '关')
  if (env.boundaries) {
    const b = env.worldBounds ?? DEFAULT_WORLD_BOUNDS
    add('boundsX', '水平边界', format(b.minX) + ' 至 ' + format(b.maxX) + ' m')
    add('boundsY', '竖直边界', format(b.minY) + ' 至 ' + format(b.maxY) + ' m')
  }
  for (const body of scene.bodies) {
    function field(label: string, value: string) { add('body/' + body.id + '/' + label, body.name + ' · ' + label, value) }
    field('类型', body.type === 'dynamic' ? '动态' : '静态')
    field('质量', format(body.mass) + ' kg')
    field('摩擦系数', format(body.friction))
    field('恢复系数', format(body.restitution))
    field('初始位置', point(body.position, 'm'))
    field('初速度', point(body.velocity, 'm/s'))
    field('旋转角', format(body.angle * 180 / Math.PI) + '°')
    field('角速度', format(body.angularVelocity) + ' rad/s')
    const g = body.geometry
    if (g.kind === 'circle') field('半径', format(g.radius) + ' m')
    else if (g.kind === 'ellipse') field('轴半径', format(g.radiusX) + ' × ' + format(g.radiusY) + ' m')
    else if (g.kind === 'polygon' || g.kind === 'track' || g.kind === 'freeform') field('顶点', g.vertices.map(p => point(p, 'm')).join('、'))
    else field('尺寸', format(g.width) + ' × ' + format(g.height) + ' m')
  }
  scene.joints.forEach((spring, i) => {
    function field(label: string, value: string) { add('spring/' + spring.id + '/' + label, '弹簧 ' + (i + 1) + ' · ' + label, value) }
    field('刚度', format(spring.stiffness) + ' N/m')
    field('阻尼比', format(spring.damping))
    field('原长', format(spring.restLength) + ' m')
    field('连接点 A', point(spring.anchorA, 'm'))
    field('连接点 B', point(spring.anchorB, 'm'))
  })
  return values
}

function changedParameters(base: Experiment, current: Experiment) {
  const first = parameters(base), second = parameters(current)
  return [...new Set([...first.keys(), ...second.keys()])].flatMap(key => {
    const before = first.get(key), after = second.get(key)
    return before?.value === after?.value ? [] : [{ key, label: (after ?? before)!.label, before: before?.value ?? '无', after: after?.value ?? '无' }]
  })
}

export function RunComparison({scene, samples, bodyName, baseline}: {
  scene: Experiment; samples: Sample[]; bodyName: string
  baseline: {scene: Experiment; body: {name: string}; samples: Sample[]}
}) {
  const changes = useMemo(() => changedParameters(baseline.scene, scene), [baseline.scene, scene])
  const aligned = latestCommonSample(samples, baseline.samples)
  return <section className="aligned-comparison" aria-label="同一时刻对比">
    {aligned && aligned.current.time > 0 ? <>
      <strong>{aligned.current.time.toFixed(3)} s · 同时刻速率</strong>
      <div className="aligned-values">
        <span>基准 · {baseline.body.name} <b>{aligned.baseline.speed.toFixed(3)} m/s</b></span>
        <span>本次 · {bodyName} <b>{aligned.current.speed.toFixed(3)} m/s</b></span>
        <span>本次减基准 <b>{(aligned.current.speed - aligned.baseline.speed).toFixed(3)} m/s</b></span>
      </div>
    </> : <p>运行本次实验，取得共同采样时刻后即可对比速率。</p>}
    {changes.length > 0 ? <div className="parameter-differences"><strong>初始条件变化（基准 → 本次）</strong>
      <ul>{changes.map(c => <li key={c.key}>{c.label}　{c.before} → {c.after}</li>)}</ul></div>
      : <small>两次实验的初始物理参数一致。</small>}
  </section>
}
