import { describe,expect,it } from 'vitest'
import { astronomicalUniverse,phenomenonPreset,solarSystem,sourceOrbitScene } from '../src/celestialAssets'
import { mergerReplay,sxsMerger } from '../src/celestialMergerReplay'
import { circularInspiral,kerrDisk,kerrHorizon,lightDeflection,pointLens,pressurelessCollapse,weakFieldRay } from '../src/blackHolePhysics'
import { GRAVITATION as G,horizonRadius,invariants,orbitalState } from '../src/celestialPhysics'
import { SpatialPhysics,length,spatialObject,subtract } from '../src/spatialPhysics'

describe('天体积分与实验模型',()=>{
  for(const integrator of ['verlet','rk4'] as const)it(integrator+' reproduces a Kepler orbit and conserves closed-system quantities',()=>{
    const separation=2e7,m1=8e25,m2=2e25,total=m1+m2
    const speed=Math.sqrt(G*total*1.28/separation),period=2*Math.PI*Math.sqrt((separation/.72)**3/(G*total))
    const start=astronomicalUniverse()
    const engine=new SpatialPhysics({...start,celestial:{...start.celestial!,integrator,softening:.001,secondsPerTick:period/400,maxStep:period/800},
      bodies:[
        {...spatialObject(),mass:m1,position:[-.2*separation,0,0],velocity:[0,0,.2*speed]},
        {...spatialObject(),mass:m2,position:[.8*separation,0,0],velocity:[0,0,-.8*speed]},
      ]})
    const [a,b]=engine.bodies,initial=invariants(engine.bodies,.001)
    expect(a.acceleration[0]).toBeCloseTo(G*m2/separation**2,9)
    expect(b.acceleration[0]).toBeCloseTo(-G*m1/separation**2,9)
    expect(orbitalState(b,a)?.eccentricity).toBeCloseTo(.28,10)
    for(let i=0;i<200;i++)engine.step()
    expect(length(subtract(b.position,a.position))/separation).toBeCloseTo(1.28/.72,3)
    for(let i=0;i<1800;i++)engine.step()
    const end=invariants(engine.bodies,.001)
    expect(Math.abs(end.energy/initial.energy-1)).toBeLessThan(.0002)
    expect(length(end.momentum)/initial.momentumScale).toBeLessThan(2e-13)
    expect(length(subtract(end.angular,initial.angular))/length(initial.angular)).toBeLessThan(2e-6)
  })

  for(const contact of ['bounce','merge','fragment'] as const)it('records a persistent '+contact+' event from motion and conserves mass and momentum',()=>{
    const start=phenomenonPreset('impact')!
    start.celestial!.contact=contact
    if(contact==='bounce')start.bodies.forEach(body=>body.restitution=1)
    const engine=new SpatialPhysics(start),initial=invariants(engine.bodies,.01)
    while(!engine.contactEvents.length&&engine.time<15000)engine.step()
    expect(engine.contactEvents[0]?.kind).toBe(contact)
    expect(engine.bodies.length).toBe(({bounce:2,merge:1,fragment:3})[contact])
    expect(engine.contactEvents[0].time).toBeGreaterThan(0)
    expect(engine.contactEvents[0].time).toBeLessThanOrEqual(engine.time)
    const end=invariants(engine.bodies,.01)
    expect(end.mass/initial.mass).toBeCloseTo(1,14)
    expect(length(end.momentum)/initial.momentumScale).toBeLessThan(2e-14)
    if(contact==='bounce')expect(Math.abs(engine.contactEvents[0].kineticLoss)/initial.kinetic).toBeLessThan(1e-12)
    else expect(engine.contactEvents[0].kineticLoss).toBeGreaterThan(0)
    const snapshot=engine.capture()
    const restored=SpatialPhysics.restore(JSON.parse(JSON.stringify(snapshot)))
    expect(restored.capture()).toEqual(snapshot)
    restored.step()
    expect(restored.time).toBeGreaterThan(engine.time)
  })

  it('keeps forecasts independent and applies queued velocity and force once the simulation steps',()=>{
    const start=astronomicalUniverse(),body=spatialObject()
    const engine=new SpatialPhysics({...start,bodies:[body]})
    engine.schedule(body.id,{kind:'velocity',value:[5,0,0]})
    engine.schedule(body.id,{kind:'force',value:[0,6,0]})
    expect(engine.pendingVector(body.id,'velocity')).toEqual([5,0,0])
    expect(engine.prediction(12).get(body.id)?.at(-1)?.velocity[1]).toBeCloseTo(1.2)
    expect(engine.time).toBe(0)
    expect(engine.bodies[0].velocity).toEqual([0,0,0])
    engine.step()
    expect(engine.bodies[0].velocity[0]).toBe(5)
    expect(engine.bodies[0].acceleration).toEqual([0,6,0])
  })

  it('loads J2000 eccentric 3D planet states and advances them with the Sun',()=>{
    const engine=new SpatialPhysics(solarSystem())
    expect(engine.bodies).toHaveLength(9)
    const [sun,mercury,,earth]=engine.bodies
    expect(orbitalState(mercury,sun)?.eccentricity).toBeCloseTo(.20563593,8)
    expect(orbitalState(mercury,sun)?.inclination).toBeCloseTo(7.00497902,6)
    expect(orbitalState(earth,sun)?.axis).toBeCloseTo(149597870700*1.00000261, -1)
    const initial=invariants(engine.bodies,100),origin=earth.position
    for(let i=0;i<800;i++)engine.step()
    expect(length(subtract(earth.position,origin))).toBeGreaterThan(1e10)
    expect(Math.abs(invariants(engine.bodies,100).energy/initial.energy-1)).toBeLessThan(1e-5)
  })

  it('physically accretes a companion and ties the resulting horizon to the combined mass',()=>{
    const engine=new SpatialPhysics(phenomenonPreset('accretion')!)
    expect(engine.bodies[0].radius).toBe(horizonRadius(engine.bodies[0].mass))
    for(let i=0;i<120&&engine.bodies.length>1;i++)engine.step()
    expect(engine.contactEvents[0]?.kind).toBe('merge')
    expect(engine.bodies[0].radius).toBe(horizonRadius(engine.bodies[0].mass))
  })

  it('distinguishes a two-body flyby from a transition produced by velocity intervention',()=>{
    const engine=new SpatialPhysics(phenomenonPreset('capture')!)
    const [a,b]=engine.bodies
    expect(orbitalState(b,a)!.energy).toBeGreaterThan(0)
    for(let i=0;i<20;i++)engine.step()
    expect(orbitalState(b,a)!.energy).toBeGreaterThan(0)
    engine.schedule(b.id,{kind:'velocity',value:[0,0,b.velocity[2]*2/3]})
    engine.step()
    expect(orbitalState(b,a)!.energy).toBeLessThan(0)
  })

  it('bounds the weak field examples and evolves collapse, deflection and radiative inspiral',()=>{
    const mass=8e30,rs=horizonRadius(mass)
    expect(lightDeflection(mass,10*rs)).toBeUndefined()
    expect(lightDeflection(mass,40*rs)).toBeCloseTo(.05,12)
    const start=pressurelessCollapse(mass,1e9,0)!,end=pressurelessCollapse(mass,1e9,1)!
    expect(start.surfaceSpeed).toBe(0)
    expect(end.radius).toBeCloseTo(20*rs,6)
    expect(end.density).toBeGreaterThan(start.density)
    expect(end.potential).toBeLessThan(start.potential)
    const inspiral=circularInspiral(mass,mass,8e6,0)!
    const final=circularInspiral(mass,mass,8e6,inspiral.stop)!
    expect(final.radius).toBeLessThan(inspiral.radius)
    expect(final.frequency).toBeGreaterThan(inspiral.frequency)
    expect(final.power).toBeGreaterThan(inspiral.power)
    const b=40*rs
    expect((weakFieldRay(mass,b,101*b)!-weakFieldRay(mass,b,100*b)!)/b).toBeCloseTo(-.05,5)
    expect(weakFieldRay(mass,-b,b)).toBeCloseTo(-weakFieldRay(mass,b,b)!,9)
    expect(weakFieldRay(mass,4*rs,b)).toBeUndefined()
    const aligned=pointLens(mass,1e11,2e11,0)!
    expect(aligned.images).toEqual([aligned.einstein,-aligned.einstein])
    const lensed=pointLens(mass,1e11,2e11,.7)!
    for(const angle of lensed.images)expect(angle-lensed.einstein**2/angle).toBeCloseTo(lensed.source,13)
  })

  it('evolves the 1PN binary on the workbench, preserves its center of mass and stops at the saved boundary',()=>{
    const scene=phenomenonPreset('binaryPN')!,engine=new SpatialPhysics(scene)
    const [a,b]=engine.bodies,initialGap=length(subtract(a.position,b.position)),minGap=10*horizonRadius(a.mass+b.mass)
    const reading=engine.modelReading!
    if(reading.kind!=='binaryPN')throw new Error('Unexpected model')
    const newtonian=circularInspiral(a.mass,b.mass,initialGap,0)!
    expect(reading.frequency/newtonian.frequency).toBeCloseTo(1+(-3+.25)/48,11)
    for(let i=0;i<111;i++)engine.step()
    expect(length(subtract(a.position,b.position))).toBeLessThan(initialGap)
    expect(length(a.position.map((v,i)=>v+b.position[i]) as typeof a.position)).toBeLessThan(1e-8)
    const before=engine.capture()
    engine.prediction(1000)
    expect(engine.capture()).toEqual(before)
    const restored=SpatialPhysics.restore(JSON.parse(JSON.stringify(before)))
    expect(restored.capture()).toEqual(before)
    for(let i=0;i<1000&&!restored.modelEnded;i++)restored.step()
    expect(restored.modelEnded).toBe(true)
    expect(restored.time).toBe(restored.modelLimit)
    expect(length(subtract(restored.bodies[0].position,restored.bodies[1].position))).toBeCloseTo(minGap,6)
    expect(restored.step()).toBe(false)
    expect(restored.history.get(a.id)?.at(-1)?.time).toBe(restored.time)
    expect(SpatialPhysics.restore(restored.capture()).modelEnded).toBe(true)
  })

  it('updates the radius of a collapsing sphere with simulated time without changing its mass or center',()=>{
    const scene=phenomenonPreset('collapse')!,engine=new SpatialPhysics(scene)
    const [sphere]=engine.bodies,initialRadius=sphere.radius,initialMass=sphere.mass
    for(let i=0;i<260;i++)engine.step()
    expect(sphere.radius).toBeLessThan(initialRadius)
    expect(sphere.mass).toBe(initialMass)
    expect(sphere.position).toEqual([0,0,0])
    const finished=SpatialPhysics.restore(engine.capture())
    while(!finished.modelEnded)finished.step()
    expect(finished.bodies[0].radius).toBeCloseTo(20*horizonRadius(initialMass),5)
    expect(finished.modelReading?.kind).toBe('collapse')
  })

  it('captures one companion by three-body energy exchange without applying controls',()=>{
    const engine=new SpatialPhysics(phenomenonPreset('tidalCapture')!)
    const [star,a,b]=engine.bodies
    expect(orbitalState(a,star)!.energy).toBeGreaterThan(0)
    expect(orbitalState(b,star)!.energy).toBeGreaterThan(0)
    for(let i=0;i<300;i++)engine.step()
    expect(orbitalState(a,star)!.energy).toBeLessThan(0)
    expect(orbitalState(b,star)!.energy).toBeGreaterThan(0)
    expect(engine.interventions).toHaveLength(0)
  })

  it('finds a high-speed impact between samples and leaves a near miss untouched',()=>{
    function run(y:number) {
      const scene=astronomicalUniverse(),a=spatialObject(),b=spatialObject()
      const engine=new SpatialPhysics({...scene,collisions:true,celestial:{...scene.celestial!,secondsPerTick:1,maxStep:1,adaptive:false},
        bodies:[{...a,position:[-10,y,0],radius:.5,restitution:1,velocity:[20,0,0]}, {...b,position:[0,0,0],radius:.5,restitution:1}]})
      engine.step()
      return engine
    }
    const impact=run(0)
    expect(impact.contactEvents[0]?.time).toBeCloseTo(.45)
    expect(impact.bodies[1].velocity[0]).toBeCloseTo(20)
    expect(impact.bodies[0].position[0]).toBeCloseTo(-1)
    expect(run(1.01).contactEvents).toHaveLength(0)
  })

  it('uses material strength and gravitational binding to decide whether the same impact fragments',()=>{
    const scene=phenomenonPreset('impact')!
    scene.bodies.forEach(b=>{b.disruptionStrength=1e9})
    const engine=new SpatialPhysics(scene)
    for(let i=0;i<80&&!engine.contactEvents.length;i++)engine.step()
    const event=engine.contactEvents[0]
    expect(event.kind).toBe('merge')
    expect(event.disruptionThreshold).toBeGreaterThan(event.impactSpecificEnergy!)
  })

  it('computes a Kerr horizon and disk ordering and restores the calibrated ringdown',()=>{
    const engine=new SpatialPhysics(phenomenonPreset('ringdown')!)
    const [remnant]=engine.bodies
    expect(remnant.celestial?.spin).toBe(.68646)
    expect(remnant.radius).toBeLessThan(horizonRadius(remnant.mass))
    expect(remnant.radius).toBe(kerrHorizon(remnant.mass,.68646))
    expect(kerrDisk(remnant.mass,-.6).isco).toBeGreaterThan(kerrDisk(remnant.mass,0).isco)
    expect(kerrDisk(remnant.mass,.6).isco).toBeLessThan(kerrDisk(remnant.mass,0).isco)
    for(let i=0;i<12;i++)engine.step()
    const reading=engine.modelReading
    expect(reading?.kind).toBe('ringdown')
    if(reading?.kind!=='ringdown')throw new Error('Unexpected model')
    expect(reading.amplitude).toBeCloseTo(Math.exp(-4))
    expect(SpatialPhysics.restore(engine.capture()).modelReading).toEqual(reading)
    for(let i=0;i<24&&!engine.modelEnded;i++)engine.step()
    expect(engine.modelEnded).toBe(true)
  })

  it('uses the SXS common horizon at the documented transition and restores the exact replay state',()=>{
    const engine=new SpatialPhysics(phenomenonPreset('mergerReplay')!)
    const [a,b,remnant]=engine.bodies
    const range=mergerReplay(a.mass+b.mass)
    expect(engine.visibleBody(a.id)).toBe(true)
    expect(engine.visibleBody(remnant.id)).toBe(false)
    expect(range.at(range.shared).sourceTime).toBeCloseTo(9514.523546,6)
    expect(range.at(range.shared-1e-8).common).toBe(false)
    expect(remnant.mass/(a.mass+b.mass)).toBeCloseTo(sxsMerger.massFraction,12)
    while(engine.time<range.shared)engine.step()
    expect(engine.visibleBody(a.id)).toBe(false)
    expect(engine.visibleBody(remnant.id)).toBe(true)
    const snapshot=engine.capture()
    expect(SpatialPhysics.restore(snapshot).capture()).toEqual(snapshot)
  })

  it('reconstructs a high-eccentricity retrograde comet orbit from its published elements',()=>{
    const [sun,comet]=sourceOrbitScene('halley')!.bodies
    expect(orbitalState(comet,sun)?.eccentricity).toBeCloseTo(.96714291,10)
    expect(orbitalState(comet,sun)?.inclination).toBeCloseTo(162.26269,8)
    expect(length(subtract(comet.position,sun.position))/149597870700).toBeCloseTo(.58597811,8)
  })
})
