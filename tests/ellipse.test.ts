import { expect, it } from 'vitest'
import { containsPoint, outlinePoints } from '../src/freeform'
import { body, emptyExperiment } from '../src/model'
import { Physics } from '../src/physics'

it('hit-tests rotated ellipses and exposes their transformed outline',()=>{
  const ellipse=body('椭圆',{kind:'ellipse',radiusX:2,radiusY:1},1,2,{angle:Math.PI/2})
  expect(containsPoint(ellipse,{x:1,y:2})).toBe(true)
  expect(containsPoint(ellipse,{x:1,y:4})).toBe(true)
  expect(containsPoint(ellipse,{x:2,y:3})).toBe(false)
  const points=outlinePoints(ellipse)
  expect(points).toHaveLength(64)
  expect(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))).toBeCloseTo(4,2)
  expect(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))).toBeCloseTo(2,2)
})

it('simulates an ellipse as a close convex collision polygon and preserves its configured mass',()=>{
  const ellipse=body('椭圆',{kind:'ellipse',radiusX:1,radiusY:.5},0,2,{mass:3,restitution:0,role:'body'})
  const floor=body('地面',{kind:'surface',width:4,height:.2},0,0,{type:'static',restitution:0})
  const lab=new Physics({...emptyExperiment(),version:3,bodies:[ellipse,floor]})
  const simulated=lab.bodies.get(ellipse.id)!
  expect(simulated.getMass()).toBeCloseTo(3,6)
  for(let i=0;i<180;i++)lab.step()
  expect(simulated.getPosition().y).toBeGreaterThan(.5)
  expect(simulated.getPosition().y).toBeLessThan(.9)
})
