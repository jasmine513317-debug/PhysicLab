import { describe, expect, it } from 'vitest'
import { contourCell, COULOMB_CONSTANT, createElectrostaticExperiment, electricFieldLines, sampleElectricField, type Charge } from '../src/electrostatics'

const origin={x:0,y:0}
const charge:Charge={id:'q',position:origin,nanocoulombs:2}

describe('electrostatic field and potential',()=>{
  it('uses the Coulomb inverse-square field and inverse-distance potential in SI units',()=>{
    const inner=sampleElectricField([charge],{x:1,y:0})!
    const outer=sampleElectricField([charge],{x:2,y:0})!
    expect(inner.x).toBeCloseTo(COULOMB_CONSTANT*2e-9,10)
    expect(inner.y).toBe(0)
    expect(inner.magnitude/outer.magnitude).toBeCloseTo(4,12)
    expect(inner.potential/outer.potential).toBeCloseTo(2,12)
    const negative=sampleElectricField([{...charge,nanocoulombs:-2}],{x:0,y:2})!
    expect(negative.y).toBeCloseTo(-outer.x,12)
    expect(negative.potential).toBeCloseTo(-outer.potential,12)
    expect(sampleElectricField([charge],origin)).toBeNull()
    expect(sampleElectricField([{...charge,nanocoulombs:0}],origin)).toEqual({x:0,y:0,magnitude:0,potential:0})
  })

  it('sums vectors and scalar potential and agrees with the negative potential gradient',()=>{
    const {charges}=createElectrostaticExperiment('dipole')
    const center=sampleElectricField(charges,origin)!
    expect(center.potential).toBeCloseTo(0,12)
    expect(center.x).toBeCloseTo(2*COULOMB_CONSTANT*5e-9/(1.5**2),10)
    const point={x:.35,y:.7}, h=1e-5
    const value=sampleElectricField(charges,point)!
    const isolated=charges.map(charge=>sampleElectricField([charge],point)!)
    expect(value.y).toBeCloseTo(isolated[0].y+isolated[1].y,12)
    expect(value.potential).toBeCloseTo(isolated[0].potential+isolated[1].potential,12)
    for(const axis of ['x','y'] as const) {
      const plus=sampleElectricField(charges,{...point,[axis]:point[axis]+h})!
      const minus=sampleElectricField(charges,{...point,[axis]:point[axis]-h})!
      expect(value[axis]).toBeCloseTo(-(plus.potential-minus.potential)/(2*h),7)
    }
    const equalSigns=sampleElectricField(createElectrostaticExperiment('equipotential').charges,origin)!
    expect(equalSigns.magnitude).toBeCloseTo(0,12)
    expect(equalSigns.potential).toBeCloseTo(2*COULOMB_CONSTANT*5e-9/1.5,10)
  })

  it('orients field lines away from positive charge and toward negative charge',()=>{
    const pathFor=(nanocoulombs:number)=>electricFieldLines([{...charge,nanocoulombs}],{left:-2,right:2,bottom:-2,top:2},80)
    const outward=pathFor(2),inward=pathFor(-2)
    expect(outward).toHaveLength(10)
    expect(inward).toHaveLength(10)
    for(const path of outward)expect(Math.hypot(path[0].x,path[0].y)).toBeLessThan(Math.hypot(path.at(-1)!.x,path.at(-1)!.y))
    for(const path of inward)expect(Math.hypot(path[0].x,path[0].y)).toBeGreaterThan(Math.hypot(path.at(-1)!.x,path.at(-1)!.y))
  })

  it('interpolates equipotentials and retains a zero contour along an exact grid edge',()=>{
    expect(contourCell([-1,1,1,-1],0)).toEqual([[{x:.5,y:0},{x:.5,y:1}]])
    expect(contourCell([-1,0,0,-1],0)).toEqual([[{x:1,y:0},{x:1,y:1}]])
    expect(contourCell([2,-1,2,-1],0)).toHaveLength(2)
    expect(contourCell([0,0,0,0],0)).toEqual([])
  })
})
