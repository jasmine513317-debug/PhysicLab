import { z } from 'zod'
import { pointSchema, type Experiment, type Point } from './model'
import type { ElectrostaticExperiment } from './electrostatics'
import type { ExtendedExperiment } from './extended-experiments'

// IAU nominal solar mass parameter, exact AU, and Julian year, in SI units.
const au=149_597_870_700
const year=31_557_600
export const AU_KM=au/1000
export const SOLAR_MASS_KG=1.9884e30
export const EARTH_MASS_KG=5.9722e24
export const MOON_MASS_KG=7.346e22
export const MAX_CELESTIAL_BODIES=12
export const MIN_ORBIT_AXIS_AU=.00001
export const MAX_ORBIT_AXIS_AU=1000
export const SOLAR_GRAVITY=1.3271244e20*year**2/au**3
export const KM_PER_SECOND_PER_AU_PER_YEAR=au/year/1000
export const METERS_PER_SECOND_SQUARED_PER_AU_PER_YEAR_SQUARED=au/year**2

const celestialSchema=z.object({
  id:z.string().min(1),name:z.string().trim().min(1).max(60),kind:z.enum(['star','planet','satellite']),
  mass:z.number().min(1e-15).max(1000), radius:z.number().min(1e-10).max(100),
  position:pointSchema,velocity:pointSchema,
})

export const astronomySchema=z.object({
  domain:z.literal('astrophysics'),version:z.literal(1),id:z.string().min(1),
  title:z.string().trim().min(1).max(100),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),
  bodies:z.array(celestialSchema).max(MAX_CELESTIAL_BODIES),
  layers:z.object({reference:z.boolean(),trails:z.boolean(),center:z.boolean(),velocity:z.boolean(),apsides:z.boolean(),sweeps:z.boolean()}),
}).refine(scene=>new Set(scene.bodies.map(body=>body.id)).size===scene.bodies.length,'天体标识必须唯一。')

export type AstronomyExperiment=z.infer<typeof astronomySchema>
export type CelestialBody=z.infer<typeof celestialSchema>
export function orbitalPrimary(body:CelestialBody,bodies:CelestialBody[]):CelestialBody|undefined {
  const planets=bodies.filter(b=>b.id!==body.id&&b.kind==='planet')
  if(body.kind==='satellite'&&planets.length)return planets.sort((a,b)=>
    Math.hypot(a.position.x-body.position.x,a.position.y-body.position.y)-Math.hypot(b.position.x-body.position.x,b.position.y-body.position.y))[0]
  return bodies.filter(b=>b.id!==body.id).sort((a,b)=>b.mass-a.mass)[0]
}
export type SavedExperiment=Experiment|ElectrostaticExperiment|AstronomyExperiment|ExtendedExperiment

export const astronomyTemplates=[
  {id:'ellipse',title:'椭圆轨道',description:'观察日地质量双体的质心、近日点与远日点。'},
  {id:'kepler',title:'开普勒定律',description:'测量等时扫过面积，比较三条轨道的周期。'},
  {id:'escape',title:'逃逸速度',description:'比较起点的速度阈值，观察束缚与逃逸轨道。'},
  {id:'earth-moon',title:'日地月系统',description:'用真实质量与平均半径观察月球对地球和太阳运动的影响。'},
  {id:'solar-system',title:'太阳系近似模型',description:'八大行星共用平面牛顿引力模型，相位为教学示意。'},
] as const

export const planetCatalog=[
  {name:'水星',mass:0.0553,radius:2439.7,axis:.3871,eccentricity:.2056,phase:.4},
  {name:'金星',mass:0.815,radius:6051.8,axis:.7233,eccentricity:.0068,phase:2.1},
  {name:'地球',mass:1,radius:6371,axis:1,eccentricity:.0167,phase:4.2},
  {name:'火星',mass:0.1074,radius:3389.5,axis:1.5237,eccentricity:.0934,phase:5.6},
  {name:'木星',mass:317.83,radius:69911,axis:5.2029,eccentricity:.0489,phase:1.2},
  {name:'土星',mass:95.16,radius:58232,axis:9.5367,eccentricity:.0565,phase:3.1},
  {name:'天王星',mass:14.54,radius:25362,axis:19.189,eccentricity:.0473,phase:5},
  {name:'海王星',mass:17.15,radius:24622,axis:30.0699,eccentricity:.0086,phase:.9},
] as const

export type PlanetDefinition=typeof planetCatalog[number]

export function createPlanetBody(definition:PlanetDefinition,position:Point):CelestialBody {
  return {id:crypto.randomUUID(),kind:'planet',name:definition.name,position,velocity:{x:0,y:0},
    mass:definition.mass*EARTH_MASS_KG/SOLAR_MASS_KG,radius:definition.radius/AU_KM}
}

export function orbitingBody(body:CelestialBody,parent:CelestialBody,axis:number,eccentricity:number,phase=0):CelestialBody {
  const distance=axis*(1-eccentricity)
  const speed=Math.sqrt(SOLAR_GRAVITY*(parent.mass+body.mass)*(1+eccentricity)/distance)
  return {...body,
    position:{x:parent.position.x+Math.cos(phase)*distance,y:parent.position.y+Math.sin(phase)*distance},
    velocity:{x:parent.velocity.x-Math.sin(phase)*speed,y:parent.velocity.y+Math.cos(phase)*speed},
  }
}

export function barycentricBodies(bodies:CelestialBody[]):CelestialBody[] {
  const mass=bodies.reduce((sum,body)=>sum+body.mass,0)
  const center=bodies.reduce((point,body)=>({x:point.x+body.position.x*body.mass/mass,y:point.y+body.position.y*body.mass/mass}),{x:0,y:0})
  const velocity=bodies.reduce((point,body)=>({x:point.x+body.velocity.x*body.mass/mass,y:point.y+body.velocity.y*body.mass/mass}),{x:0,y:0})
  return bodies.map(body=>({...body,
    position:{x:body.position.x-center.x,y:body.position.y-center.y},
    velocity:{x:body.velocity.x-velocity.x,y:body.velocity.y-velocity.y},
  }))
}

export function createCelestialBody(kind:CelestialBody['kind'],position:Point):CelestialBody {
  const properties={
    star:{name:'太阳',mass:1,radius:695700/AU_KM},
    planet:{name:'地球',mass:EARTH_MASS_KG/SOLAR_MASS_KG,radius:6371/AU_KM},
    satellite:{name:'月球',mass:MOON_MASS_KG/SOLAR_MASS_KG,radius:1737.4/AU_KM},
  }
  return {id:crypto.randomUUID(),kind,position,velocity:{x:0,y:0},...properties[kind]}
}

export function ellipsePair(bodies:[CelestialBody,CelestialBody],axis:number,eccentricity:number):[CelestialBody,CelestialBody] {
  const [primary,secondary]=bodies
  const mass=primary.mass+secondary.mass
  const distance=axis*(1-eccentricity)
  const speed=Math.sqrt(SOLAR_GRAVITY*mass*(1+eccentricity)/distance)
  const position=(fraction:number)=>({x:distance*fraction,y:0})
  const velocity=(fraction:number)=>({x:0,y:speed*fraction})
  const primaryFraction=-secondary.mass/mass,secondaryFraction=primary.mass/mass
  return [
    {...primary,position:position(primaryFraction),velocity:velocity(primaryFraction)},
    {...secondary,position:position(secondaryFraction),velocity:velocity(secondaryFraction)},
  ]
}

export function createAstronomyExperiment(template:string|null):AstronomyExperiment {
  const now=new Date().toISOString()
  const preset=astronomyTemplates.find(candidate=>candidate.id===template)
  const star=createCelestialBody('star',{x:0,y:0}),planet=createCelestialBody('planet',{x:1,y:0})
  const kepler=preset?.id==='kepler'
  const escape=preset?.id==='escape'
  let bodies:CelestialBody[]=[]
  if(preset?.id==='solar-system') {
    const planets=planetCatalog.map(definition=>orbitingBody(createPlanetBody(definition,{x:0,y:0}),star,definition.axis,definition.eccentricity,definition.phase))
    bodies=barycentricBodies([star,...planets])
  } else if(preset?.id==='earth-moon') {
    const earth=orbitingBody(planet,star,1,.0167,0)
    const moon=orbitingBody(createCelestialBody('satellite',{x:0,y:0}),earth,.00257,.0549,.7)
    bodies=barycentricBodies([star,earth,moon])
  } else if(preset) bodies=ellipsePair([star,planet],escape?2.5:1,escape?.6:kepler?.43:.0167)
  return {
    domain:'astrophysics',version:1,id:crypto.randomUUID(),title:preset?.title??'未命名天体实验',createdAt:now,updatedAt:now,bodies,
    layers:{reference:true,trails:true,center:true,velocity:true,apsides:true,sweeps:kepler},
  }
}
