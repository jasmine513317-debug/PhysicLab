import { expect,it } from 'vitest'
import { createAstronomyExperiment, createCelestialBody, astronomySchema, AU_KM, EARTH_MASS_KG, MOON_MASS_KG, SOLAR_MASS_KG, METERS_PER_SECOND_SQUARED_PER_AU_PER_YEAR_SQUARED, orbitalPrimary } from '../src/astronomy'
import { AstronomySystem, bodyAcceleration, orbitBodies } from '../src/astronomy-system'
import { TwoBodyOrbit } from '../src/orbital-physics'

it('uses consistent Earth units and keeps existing dual-body saves readable',()=>{
  const scene=createAstronomyExperiment('ellipse')
  expect(scene.bodies[1].mass*SOLAR_MASS_KG/EARTH_MASS_KG).toBeCloseTo(1,10)
  expect(scene.bodies[1].radius*AU_KM).toBe(6371)
  expect(astronomySchema.parse(scene).bodies).toHaveLength(2)
})

it('computes physical acceleration and preserves it when changing the observation origin',()=>{
  const bodies=createAstronomyExperiment('earth-moon').bodies
  const earth=bodies[1],moon=bodies[2]
  expect(orbitalPrimary(moon,bodies)?.id).toBe(earth.id)
  const acceleration=bodyAcceleration(earth,bodies)
  const metersPerSecondSquared=Math.hypot(acceleration.x,acceleration.y)*METERS_PER_SECOND_SQUARED_PER_AU_PER_YEAR_SQUARED
  expect(metersPerSecondSquared).toBeGreaterThan(.005)
  expect(metersPerSecondSquared).toBeLessThan(.007)
  const relative=bodyAcceleration(moon,bodies)
  relative.x-=acceleration.x;relative.y-=acceleration.y
  const translated=bodies.map(b=>({...b,position:{x:b.position.x+7,y:b.position.y-3}}))
  const origin=bodyAcceleration(translated[1],translated),satellite=bodyAcceleration(translated[2],translated)
  expect(satellite.x-origin.x).toBeCloseTo(relative.x,8)
  expect(satellite.y-origin.y).toBeCloseTo(relative.y,8)
  const net=bodies.reduce((sum,b)=>{const a=bodyAcceleration(b,bodies);return {x:sum.x+b.mass*a.x,y:sum.y+b.mass*a.y}},{x:0,y:0})
  expect(Math.hypot(net.x,net.y)).toBeLessThan(1e-18)
})

it('integrates a lunar revolution in roughly one month under Sun-Earth-Moon gravity',()=>{
  const system=new AstronomySystem(createAstronomyExperiment('earth-moon').bodies)
  const phase=()=>Math.atan2(system.bodies[2].position.y-system.bodies[1].position.y,system.bodies[2].position.x-system.bodies[1].position.x)
  let previous=phase(),angle=0,count=0
  while(angle<Math.PI*2&&count++<20000) {
    expect(system.step()).toBe(true)
    const next=phase(),difference=next-previous
    angle+=Math.atan2(Math.sin(difference),Math.cos(difference));previous=next
  }
  expect(angle).toBeGreaterThanOrEqual(Math.PI*2)
  expect(system.time*365.25).toBeGreaterThan(25)
  expect(system.time*365.25).toBeLessThan(30)
  expect(Math.abs(system.energy()/system.initialEnergy-1)).toBeLessThan(1e-4)
})
it('conserves momentum and energy while all three bodies attract one another',()=>{
  const scene=createAstronomyExperiment('ellipse')
  const extra=createCelestialBody('planet',{x:2,y:0})
  extra.velocity.y=4.443
  const system=new AstronomySystem([...scene.bodies,extra])
  const momentum=()=>system.bodies.reduce((p,b)=>({x:p.x+b.mass*b.velocity.x,y:p.y+b.mass*b.velocity.y}),{x:0,y:0})
  const initial=momentum()
  for(let i=0;i<3000;i++)expect(system.step()).toBe(true)
  expect(system.time).toBeGreaterThan(.1)
  expect(Math.abs(system.energy()/system.initialEnergy-1)).toBeLessThan(1e-4)
  expect(momentum().x).toBeCloseTo(initial.x,14)
  expect(momentum().y).toBeCloseTo(initial.y,14)
  expect(system.bodies[0].position).not.toEqual(scene.bodies[0].position)
})
it('provides a barycentric Solar System teaching model with real-world body data',()=>{
  const scene=createAstronomyExperiment('solar-system')
  expect(scene.bodies).toHaveLength(9)
  expect(astronomySchema.parse(scene).bodies).toHaveLength(9)
  const earth=scene.bodies.find(body=>body.name==='地球')!
  expect(earth.mass*SOLAR_MASS_KG/EARTH_MASS_KG).toBeCloseTo(1,10)
  expect(earth.radius*AU_KM).toBe(6371)
  const momentum=scene.bodies.reduce((sum,body)=>({x:sum.x+body.mass*body.velocity.x,y:sum.y+body.mass*body.velocity.y}),{x:0,y:0})
  expect(momentum.x).toBeCloseTo(0,12)
  expect(momentum.y).toBeCloseTo(0,12)
  const system=new AstronomySystem(scene.bodies)
  expect(system.step()).toBe(true)
  expect(Math.abs(system.energy()/system.initialEnergy-1)).toBeLessThan(1e-4)
})
it('uses Moon units and a real Earth-Moon distance in the three-body template',()=>{
  const scene=createAstronomyExperiment('earth-moon')
  const earth=scene.bodies.find(body=>body.name==='地球')!,moon=scene.bodies.find(body=>body.name==='月球')!
  expect(scene.bodies).toHaveLength(3)
  expect(moon.mass*SOLAR_MASS_KG/MOON_MASS_KG).toBeCloseTo(1,10)
  expect(moon.radius*AU_KM).toBe(1737.4)
  expect(Math.hypot(moon.position.x-earth.position.x,moon.position.y-earth.position.y)).toBeLessThan(.003)
})
it('stops initially overlapping bodies and retains inertial offsets in a two-body snapshot',()=>{
  const scene=createAstronomyExperiment('ellipse')
  expect(()=>new AstronomySystem([scene.bodies[0],{...scene.bodies[1],position:scene.bodies[0].position}])).toThrow('接触')
  const [a,b]=scene.bodies.map(b=>({...b,position:{x:b.position.x+2,y:b.position.y+3},velocity:{x:b.velocity.x+.5,y:b.velocity.y+.1}}))
  const orbit=new TwoBodyOrbit([a,b]);orbit.step()
  const snapshot=orbitBodies(orbit)
  expect(snapshot[0].position.x).toBeGreaterThan(1.9)
  expect(snapshot[0].position.y).toBeGreaterThan(3)
})
