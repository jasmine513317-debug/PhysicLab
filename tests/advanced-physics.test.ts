import { describe, expect, it } from 'vitest'
import { DoublePendulum, inductionState, MIN_ORBIT_DISTANCE, ThreeBody } from '../src/advanced-physics'
import { SOLAR_GRAVITY } from '../src/astronomy'
import { createExtendedExperiment } from '../src/extended-experiments'
import { ExtendedSimulation, extendedCsv } from '../src/extended-physics'

describe('double pendulum',()=>{
  it('returns after a small-angle normal-mode period',()=>{
    const settings={length1:1,length2:1,mass1:1,mass2:1,gravity:9.81,angle1:.1,angle2:.1*Math.SQRT2,speed1:0,speed2:0,perturbation:0}
    const engine=new DoublePendulum(settings)
    const initial=engine.sample(),period=2*Math.PI/Math.sqrt((2-Math.SQRT2)*settings.gravity)
    for(let step=0;step<Math.round(period/engine.dt);step++)engine.step()
    const result=engine.sample()
    expect(result.angles[0]).toBeCloseTo(initial.angles[0],7)
    expect(result.angles[1]).toBeCloseTo(initial.angles[1],7)
    expect(result.divergence).toBe(0)
  })

  it('distinguishes divergence of the perturbed run from time-step error',()=>{
    const scene=createExtendedExperiment('double-pendulum')
    if(scene.extension!=='double-pendulum')throw new Error('Expected double pendulum')
    const engine=new DoublePendulum(scene.settings)
    for(let step=0;step<12/engine.dt;step++)engine.step()
    const sample=engine.sample()
    expect(sample.divergence).toBeGreaterThan(.015)
    expect(sample.resolutionError).toBeLessThan(sample.divergence/50)
    expect(sample.energyDrift).toBeLessThan(1e-5)
  })
})

describe('three-body gravity',()=>{
  it('reproduces the eight-shaped periodic solution and converges with smaller steps',()=>{
    const scene=createExtendedExperiment('three-body')
    if(scene.extension!=='three-body')throw new Error('Expected three-body experiment')
    scene.settings.perturbation=0
    const coarse=new ThreeBody(scene),fine=new ThreeBody(scene,2)
    const period=6.32591398/Math.sqrt(SOLAR_GRAVITY)
    const count=Math.round(period/coarse.dt)
    let peakEnergyDrift=0
    for(let step=1;step<=count;step++) {
      const sample=coarse.step(step*coarse.dt)
      fine.step((step*2-1)*fine.dt)
      fine.step(step*2*fine.dt)
      peakEnergyDrift=Math.max(peakEnergyDrift,sample.energyDrift)
    }
    expect(coarse.stopped).toBe('')
    expect(fine.stopped).toBe('')
    const coarseResult=coarse.sample(),fineResult=fine.sample()
    const positionError=(index:number)=>{
      const initial=scene.settings.bodies[index],last=fineResult.bodies[index]
      return Math.hypot(last.x-initial.x,last.y-initial.y)
    }
    expect(Math.max(...[0,1,2].map(positionError))).toBeLessThan(.004)
    expect(coarseResult.momentumDrift).toBeLessThan(1e-11)
    expect(coarseResult.angularMomentumDrift).toBeLessThan(1e-11)
    expect(peakEnergyDrift).toBeLessThan(5e-5)
    expect(fineResult.energyDrift).toBeLessThan(coarseResult.energyDrift)
  })

  it('perturbs only body 3 and pauses before a head-on singularity',()=>{
    const scene=createExtendedExperiment('three-body')
    if(scene.extension!=='three-body')throw new Error('Expected three-body experiment')
    const comparison=new ThreeBody(scene).sample()
    expect(comparison.divergence).toBeCloseTo(scene.settings.perturbation,12)
    expect(comparison.comparison?.slice(0,2)).toEqual(comparison.bodies.slice(0,2))
    scene.settings.perturbation=0
    scene.settings.bodies=[
      {mass:1,x:-.05,y:0,vx:3,vy:0},{mass:1,x:.05,y:0,vx:-3,vy:0},{mass:.01,x:1,y:0,vx:0,vy:0},
    ]
    const engine=new ExtendedSimulation(scene)
    for(let step=0;step<200&&!engine.stopped;step++)engine.step()
    expect(engine.stopped).toMatch(/近距离/)
    expect(engine.gravity!.minimumDistance).toBeGreaterThan(MIN_ORBIT_DISTANCE)
    expect(Number.isFinite(engine.current.gravity!.energy)).toBe(true)
  })

  it('measures a flyby gain in the star frame while conserving the full system',()=>{
    const engine=new ExtendedSimulation(createExtendedExperiment('gravity-assist'))
    for(let step=0;step<1500&&!engine.gravity?.outgoing;step++)engine.step()
    const {incoming,outgoing,minimumDistance}=engine.gravity!
    expect(incoming).toBeDefined()
    expect(outgoing).toBeDefined()
    expect(outgoing!.time).toBeGreaterThan(incoming!.time)
    expect(outgoing!.starSpeed-incoming!.starSpeed).toBeGreaterThan(7)
    expect(Math.abs(outgoing!.planetSpeed-incoming!.planetSpeed)).toBeLessThan(.03)
    expect(outgoing!.starEnergy).toBeGreaterThan(incoming!.starEnergy)
    expect(minimumDistance).toBeLessThan(.02)
    expect(engine.current.gravity!.energyDrift).toBeLessThan(1e-6)
    expect(engine.current.gravity!.momentumDrift).toBeLessThan(1e-12)
    expect(engine.current.gravity!.angularMomentumDrift).toBeLessThan(1e-12)
  })
})

it('uses the measured flux slope for Faraday’s law, including sign and open-circuit behavior',()=>{
  const scene=createExtendedExperiment('induction')
  if(scene.extension!=='induction')throw new Error('Expected induction')
  const settings=scene.settings
  const start=inductionState(settings,0),later=inductionState(settings,.25)
  expect(later.emf).toBeCloseTo(-(later.flux-start.flux)/.25,12)
  expect(later.current).toBeCloseTo(later.emf/settings.resistance,12)
  expect(later.emf).toBeLessThan(0)
  expect(inductionState({...settings,slope:-settings.slope},1).emf).toBeCloseTo(-later.emf,12)
  expect(inductionState({...settings,angle:90},1).current).toBeCloseTo(0,12)
  const open=inductionState({...settings,closed:false},1)
  expect(open.current).toBe(0)
  expect(open.emf).toBe(later.emf)
  const engine=new ExtendedSimulation(scene)
  for(let step=0;step<2500;step++)engine.step()
  expect(engine.current.time).toBe(10)
  expect(extendedCsv(engine)).toContain('field_T,flux_Wb,emf_V,current_A')
})
