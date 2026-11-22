import { expect, it } from 'vitest'
import { Physics } from '../src/physics'
import { instantiate } from '../src/templates'

it.each([42, 44])('stops at tick %i and records exactly one final sample, even at 4× speed', target => {
  const scene = instantiate('fall')
  const engine = new Physics(scene)
  const reference = new Physics(scene)
  for (let i = 0; i < target; i++) reference.step()
  for (let i = 0; i < 20; i++) engine.advance(0.15, 4, target)
  const time = target * scene.environment.timeStep
  expect(engine.time).toBe(time)
  const track = engine.samples.get(scene.bodies[0].id)!
  expect(track.filter(s => s.time === time)).toHaveLength(1)
  expect(track.at(-1)?.vy).toBe(reference.bodies.get(scene.bodies[0].id)!.getLinearVelocity().y)
  expect(engine.captureReplay(scene)?.tracks[0][1].at(-1)?.time).toBe(time)
  expect(engine.advance(0, 1)).toBe(0)
  engine.advance(scene.environment.timeStep, 1)
  expect(engine.time).toBe((target+1)*scene.environment.timeStep)
})
