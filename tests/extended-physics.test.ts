import { expect, it } from 'vitest'
import { createExtendedExperiment, extendedSchema } from '../src/extended-experiments'
import { ExtendedSimulation, extendedCsv, pendulumPeriods } from '../src/extended-physics'
import { createAstronomyExperiment } from '../src/astronomy'
import { escapeThreshold, TwoBodyOrbit, withEscapeSpeed } from '../src/orbital-physics'
import { instantiate } from '../src/templates'
import { springPeriodReference } from '../src/analysis'

it('measures the finite-amplitude pendulum period and conserves mechanical energy',()=>{
  const scene=extendedSchema.parse(createExtendedExperiment('pendulum'))
  if(scene.extension!=='pendulum')throw new Error('Wrong template')
  scene.settings.angle=65
  const expected=pendulumPeriods(scene.settings)
  expect(expected.finiteAmplitude).toBeGreaterThan(expected.smallAngle!)
  const simulation=new ExtendedSimulation(scene),energy=simulation.current.energy
  let error=0
  for(let i=0;i<Math.ceil(12/simulation.dt);i++) {
    simulation.step()
    error=Math.max(error,Math.abs(simulation.current.energy/energy-1))
  }
  expect(Math.abs(simulation.measuredPeriod!/expected.finiteAmplitude!-1)).toBeLessThan(.0002)
  expect(error).toBeLessThan(.0001)
  expect(pendulumPeriods({...scene.settings,angularSpeed:20}).finiteAmplitude).toBeUndefined()
})

it('provides the spring reference for a centered underdamped oscillator',()=>{
  const scene=instantiate('spring')
  expect(springPeriodReference(scene,scene.bodies[0])).toBeCloseTo(Math.PI/5,12)
  scene.joints[0].damping=.4
  expect(springPeriodReference(scene,scene.bodies[0])).toBeCloseTo(Math.PI/(5*Math.sqrt(.84)),12)
  scene.joints[0].damping=1
  expect(springPeriodReference(scene,scene.bodies[0])).toBeUndefined()
})

it('conserves kinetic energy in a magnetic field and matches uniform electric acceleration',()=>{
  const scene=createExtendedExperiment('particle')
  if(scene.extension!=='particle')throw new Error('Wrong template')
  const magnetic=new ExtendedSimulation(scene)
  for(let i=0;i<1000;i++)magnetic.step()
  const time=magnetic.current.time
  expect(magnetic.current.energy).toBeCloseTo(4.5,12)
  expect(magnetic.current.vx).toBeCloseTo(3*Math.cos(2*time),3)
  expect(magnetic.current.vy).toBeCloseTo(-3*Math.sin(2*time),3)
  expect(Math.hypot(magnetic.current.x,magnetic.current.y+1.5)).toBeCloseTo(1.5,10)
  const electric=new ExtendedSimulation({...scene,settings:{...scene.settings,bz:0,ex:2,ey:-1}})
  for(let i=0;i<240;i++)electric.step()
  expect(electric.current.time).toBe(1)
  expect(electric.current.vx).toBeCloseTo(5,11)
  expect(electric.current.vy).toBeCloseTo(-1,11)
  expect(electric.current.x).toBeCloseTo(4,11)
  expect(electric.current.y).toBeCloseTo(-.5,11)
  const fast=new ExtendedSimulation({...scene,settings:{...scene.settings,mass:1e-13,bz:0,ex:100,vx:1e7}})
  for(let i=0;i<100&&!fast.stopped;i++)fast.step()
  expect(fast.stopped).toContain('0.1c')
  expect(fast.current.vx).toBeLessThan(29_979_245.8)
})

it('matches RC exponentials on both sides of a switch and retains voltage continuity',()=>{
  const scene=createExtendedExperiment('rc')
  if(scene.extension!=='rc')throw new Error('Wrong template')
  const simulation=new ExtendedSimulation(scene)
  for(let i=0;i<150;i++)simulation.step()
  const charged=5*(1-1/Math.E)
  expect(simulation.current.voltage).toBeCloseTo(charged,11)
  expect(simulation.rcTauVoltage).toBeCloseTo(charged,11)
  simulation.switchCircuit('discharge')
  expect(simulation.current.voltage).toBeCloseTo(charged,11)
  expect(simulation.current.current).toBeCloseTo(-charged/1000,12)
  for(let i=0;i<150;i++)simulation.step()
  expect(simulation.rcTauVoltage).toBeCloseTo(charged/Math.E,11)
  expect(extendedCsv(simulation)).toContain('capacitor_V,current_A,source_V,energy_J')
})

it('sets the escape threshold at zero specific energy and preserves the barycenter velocity',()=>{
  const {bodies}=createAstronomyExperiment('escape')
  const base=new TwoBodyOrbit([bodies[0],bodies[1]])
  expect(escapeThreshold(base)).toBeCloseTo(Math.sqrt(2*base.mu),11)
  const critical=new TwoBodyOrbit(withEscapeSpeed(base,1))
  const bound=new TwoBodyOrbit(withEscapeSpeed(base,.8))
  const unbound=new TwoBodyOrbit(withEscapeSpeed(base,1.2))
  expect(critical.elements?.specificEnergy).toBeCloseTo(0,11)
  expect(critical.elements?.period).toBeUndefined()
  expect(bound.initial.energy).toBeLessThan(0)
  expect(unbound.initial.energy).toBeGreaterThan(0)
  const [a,b]=unbound.bodies
  expect(a.velocity.y*a.mass+b.velocity.y*b.mass).toBeCloseTo(0,12)
  for(let i=0;i<4500;i++)unbound.step()
  expect(unbound.maximumDistance).toBeGreaterThan(2)
  expect(unbound.current.energy/unbound.initial.energy).toBeCloseTo(1,5)
})
