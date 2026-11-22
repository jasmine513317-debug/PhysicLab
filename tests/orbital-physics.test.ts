import { describe, expect, it } from 'vitest'
import { createAstronomyExperiment, ellipsePair } from '../src/astronomy'
import { barycentricPosition, centerOfMass, orbitCsv, referenceEllipse, TwoBodyOrbit, verifyKeplerThird } from '../src/orbital-physics'

function template() {
  const {bodies}=createAstronomyExperiment('kepler')
  return new TwoBodyOrbit([bodies[0],bodies[1]])
}

describe('Newtonian two-body orbit',()=>{
  it('recovers the initial ellipse and the barycenter for unequal masses',()=>{
    const orbit=template(), elements=orbit.elements!
    expect(elements.axis).toBeCloseTo(1,12)
    expect(elements.eccentricity).toBeCloseTo(.43,12)
    expect(elements.periapsis).toBeCloseTo(.57,12)
    expect(elements.apoapsis).toBeCloseTo(1.43,12)
    expect(centerOfMass(orbit.bodies).x).toBeCloseTo(0,12)
    const ellipse=referenceEllipse(elements)
    expect(ellipse[0].x).toBeCloseTo(.57,12)
    expect(ellipse[96].x).toBeCloseTo(-1.43,12)
    const companion=barycentricPosition(orbit.current.relative,orbit.bodies,1)
    const primary=barycentricPosition(orbit.current.relative,orbit.bodies,0)
    expect(primary.x*orbit.bodies[0].mass+companion.x*orbit.bodies[1].mass).toBeCloseTo(0,14)
  })

  it('measures a complete orbit and conserves energy, angular momentum and equal-time area',()=>{
    const orbit=template(),period=orbit.elements!.period!
    let energyError=0
    while(orbit.current.time<period*1.1&&orbit.step()) {
      energyError=Math.max(energyError,Math.abs(orbit.current.energy/orbit.initial.energy-1))
    }
    expect(orbit.stopped).toBe('')
    expect(Math.abs(orbit.measuredPeriod!/period-1)).toBeLessThan(5e-5)
    expect(Math.abs(orbit.maximumDistance-1.43)).toBeLessThan(5e-5)
    expect(energyError).toBeLessThan(5e-5)
    expect(Math.abs(orbit.current.angularMomentum/orbit.initial.angularMomentum-1)).toBeLessThan(1e-10)
    expect(orbit.firstSweep).not.toBe(orbit.lastSweep)
    expect(Math.abs(orbit.lastSweep!.area/orbit.firstSweep!.area-1)).toBeLessThan(1e-6)
    const csv=orbitCsv(orbit)
    expect(csv).toContain('energy_Msun_AU2_per_yr2,angular_momentum_Msun_AU2_per_yr')
    expect(csv.trim().split('\r\n').at(-1)?.startsWith(orbit.current.time.toExponential(10))).toBe(true)
  })

  it('verifies the third law using three independently measured numerical periods',()=>{
    const orbit=template()
    const data=verifyKeplerThird(orbit)
    expect(data.map(row=>Number(row.axis.toFixed(2)))).toEqual([.75,1,1.35])
    expect(data.every(row=>row.relativeError<5e-5)).toBe(true)
    for(const row of data)expect(Math.abs(row.ratio/(4*Math.PI**2/orbit.mu)-1)).toBeLessThan(1e-4)
    expect(orbit.current.time).toBe(0)
  })

  it('stops before a radial encounter crosses the contact boundary',()=>{
    const source=template().bodies
    const orbit=new TwoBodyOrbit(source.map(body=>({...body,radius:.1,velocity:{x:0,y:0}})) as typeof source)
    for(let index=0;index<10000&&orbit.step();index++) { /* step to contact */ }
    expect(orbit.stopped).toContain('已接触')
    expect(Math.hypot(orbit.current.relative.x,orbit.current.relative.y)).toBeGreaterThan(.2)
    expect(()=>new TwoBodyOrbit(ellipsePair(source,.001,.4))).toThrow('发生接触')
  })
})
