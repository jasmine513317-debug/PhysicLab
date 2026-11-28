import { expect,it } from 'vitest'
import { appendCelestial,astronomyScene } from '../src/spatialTemplates'
import { add,length,multiply,SpatialPhysics,subtract } from '../src/spatialPhysics'

it('builds a free celestial pair with zero net momentum and a stable circular orbit',()=>{
  const star=appendCelestial(astronomyScene(),'star','')
  const pair=appendCelestial(star,'planet',star.bodies[0].id)
  expect(pair.gravity).toEqual([0,0,0])
  expect(pair.mutualGravity).toBe(true)
  const [a,b]=pair.bodies
  expect(length(add(multiply(a.velocity,a.mass),multiply(b.velocity,b.mass)))/(b.mass*length(b.velocity))).toBeLessThan(1e-12)
  const solver=new SpatialPhysics(pair)
  try {
    for(let i=0;i<240;i++)solver.step()
    expect(length(subtract(solver.bodies[0].position,solver.bodies[1].position))).toBeCloseTo(4,3)
  } finally {solver.dispose()}
})
