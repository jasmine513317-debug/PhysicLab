import { GRAVITATION as G,LIGHT_SPEED as c,horizonRadius } from './celestialPhysics'

export function kerrHorizon(mass:number,spin=0) {
  return horizonRadius(mass)/2*(1+Math.sqrt(1-spin**2))
}

// Bardeen, Press & Teukolsky. Signed spin is relative to the orbit.
export function kerrDisk(mass:number,spin=0) {
  const z1=1+Math.cbrt(1-spin**2)*(Math.cbrt(1+spin)+Math.cbrt(1-spin))
  const z2=Math.sqrt(3*spin**2+z1*z1)
  const isco=3+z2-Math.sign(spin)*Math.sqrt((3-z1)*(3+z1+2*z2))
  const unit=G*mass/c**2
  return {isco:unit*isco,omega:c/unit/(isco**1.5+spin)}
}

// Scheel et al., equal masses and initially nonspinning, energy from infinity.
export const equalMassRemnant=(totalMass:number)=>({mass:totalMass*.95162,spin:.68646})

// Berti, Cardoso & Will, dominant l=m=2 fundamental Kerr mode.
export function kerrRingdown(mass:number,spin:number) {
  const scale=G*mass/c**3
  const omega=(1.5251-1.1568*(1-spin)**.1292)/scale
  const quality=.7+1.4187*(1-spin)**(-.499)
  return {omega,frequency:omega/(2*Math.PI),tau:2*quality/omega}
}

// First-order weak-field ray bending; the section near the photon sphere is excluded.
export function lightDeflection(mass:number,impact:number) {
  if(impact<20*horizonRadius(mass))return
  return 4*G*mass/(c*c*impact)
}

// The incident null ray is approximated by a straight line in the force term.
export function weakFieldRay(mass:number,impact:number,x:number) {
  const angle=lightDeflection(mass,Math.abs(impact))
  if(angle===undefined)return
  return impact-Math.sign(impact)*angle/2*(x+Math.hypot(x,impact))
}

export function pointLens(mass:number,lensDistance:number,sourceDistance:number,offset:number) {
  if(lensDistance<=0||sourceDistance<=lensDistance)return
  const einstein=Math.sqrt(4*G*mass/c**2*(1/lensDistance-1/sourceDistance))
  const discriminant=Math.hypot(offset,2)
  return {einstein,source:offset*einstein,
    images:[(offset+discriminant)*einstein/2,(offset-discriminant)*einstein/2] as const}
}

export function radialTide(mass:number,distance:number,diameter:number) {
  if(distance<20*horizonRadius(mass)||diameter>distance*.1)return
  return 2*G*mass*diameter/distance**3
}

// Leading-order face-on plus polarization in the far field.
export function binaryStrain(m1:number,m2:number,gap:number,phase:number,distance:number) {
  return 4*G**2*m1*m2/(c**4*gap*distance)*Math.cos(2*phase)
}

// Peters (1964), circular orbit. Stops before the strong-field regime.
export function circularInspiral(m1:number,m2:number,initialRadius:number,time:number,postNewtonian=false) {
  const total=m1+m2
  const cutoff=20*G*total/(c*c)
  if(initialRadius<=cutoff)return
  const decay=64/5*G**3*m1*m2*total/c**5
  const stop=(initialRadius**4-cutoff**4)/(4*decay)
  const t=Math.max(0,Math.min(time,stop))
  const radius=Math.max(cutoff,(initialRadius**4-4*decay*t)**.25)
  // Expand the square root of the harmonic-coordinate circular Kepler law to 1PN.
  const eta=m1*m2/total**2
  const correction=postNewtonian?(-3+eta)*G*total/(2*c*c):0
  const phase=Math.sqrt(G*total)/decay*(2/5*(initialRadius**2.5-radius**2.5)
    +2/3*correction*(initialRadius**1.5-radius**1.5))
  const omega=Math.sqrt(G*total/radius**3)*(1+correction/radius)
  return {radius,stop,frequency:omega/Math.PI,phase,omega,radialSpeed:-decay/radius**3,
    radialAcceleration:-3*decay**2/radius**7,angularAcceleration:omega*(-decay/radius**3)*(-1.5/radius-correction/(radius*(radius+correction))),
    radiatedEnergy:G*m1*m2/2*(1/radius-1/initialRadius),
    power:32/5*G**4*(m1*m2)**2*total/(c**5*radius**5)}
}

// Uniform, nonrotating dust sphere initially at rest; eta=0 at release.
export function pressurelessCollapse(mass:number,initialRadius:number,progress:number) {
  const cutoff=20*horizonRadius(mass)
  if(initialRadius<=cutoff)return
  const theta=Math.acos(Math.sqrt(cutoff/initialRadius))*Math.max(0,Math.min(1,progress))
  const radius=initialRadius*Math.cos(theta)**2
  const ff=Math.PI/2*Math.sqrt(initialRadius**3/(2*G*mass))
  return {radius,time:ff*(2*theta+Math.sin(2*theta))/Math.PI,ff,density:3*mass/(4*Math.PI*radius**3),
    potential:-3*G*mass*mass/(5*radius),surfaceSpeed:Math.sqrt(Math.max(0,2*G*mass*(1/radius-1/initialRadius)))}
}

export function timedCollapse(mass:number,initialRadius:number,time:number) {
  const final=pressurelessCollapse(mass,initialRadius,1)
  if(!final)return
  let lower=0,upper=1
  const target=Math.min(final.time,Math.max(0,time))
  if(target===0)return {...pressurelessCollapse(mass,initialRadius,0)!,stop:final.time}
  if(target===final.time)return {...final,stop:final.time}
  for(let i=0;i<44;i++) {
    const mid=(lower+upper)/2
    if(pressurelessCollapse(mass,initialRadius,mid)!.time<target)lower=mid
    else upper=mid
  }
  return {...pressurelessCollapse(mass,initialRadius,(lower+upper)/2)!,stop:final.time}
}
