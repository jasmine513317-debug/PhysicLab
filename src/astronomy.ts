import { z } from 'zod'
import { pointSchema, type Experiment, type Point } from './model'
import type { ElectrostaticExperiment } from './electrostatics'
import type { ExtendedExperiment } from './extended-experiments'

// IAU nominal solar mass parameter, exact AU, and Julian year, in SI units.
const au=149_597_870_700
const year=31_557_600
export const SOLAR_GRAVITY=1.3271244e20*year**2/au**3
export const KM_PER_SECOND_PER_AU_PER_YEAR=au/year/1000

const celestialSchema=z.object({
  id:z.string().min(1),name:z.string().trim().min(1).max(60),kind:z.enum(['star','planet','satellite']),
  mass:z.number().min(1e-15).max(1000), radius:z.number().min(1e-10).max(100),
  position:pointSchema,velocity:pointSchema,
})

export const astronomySchema=z.object({
  domain:z.literal('astrophysics'),version:z.literal(1),id:z.string().min(1),
  title:z.string().trim().min(1).max(100),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),
  bodies:z.array(celestialSchema).max(2),
  layers:z.object({reference:z.boolean(),trails:z.boolean(),center:z.boolean(),velocity:z.boolean(),apsides:z.boolean(),sweeps:z.boolean()}),
}).refine(scene=>new Set(scene.bodies.map(body=>body.id)).size===scene.bodies.length,'天体标识必须唯一。')

export type AstronomyExperiment=z.infer<typeof astronomySchema>
export type CelestialBody=z.infer<typeof celestialSchema>
export type SavedExperiment=Experiment|ElectrostaticExperiment|AstronomyExperiment|ExtendedExperiment

export const astronomyTemplates=[
  {id:'ellipse',title:'椭圆轨道',description:'观察日地质量双体的质心、近日点与远日点。'},
  {id:'kepler',title:'开普勒定律',description:'测量等时扫过面积，比较三条轨道的周期。'},
  {id:'escape',title:'逃逸速度',description:'比较起点的速度阈值，观察束缚与逃逸轨道。'},
] as const

export function createCelestialBody(kind:CelestialBody['kind'],position:Point):CelestialBody {
  const properties={
    star:{name:'恒星',mass:1,radius:.00465},
    planet:{name:'行星',mass:.0000030035,radius:.0000426},
    satellite:{name:'卫星',mass:3.695e-8,radius:.0000116},
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
  return {
    domain:'astrophysics',version:1,id:crypto.randomUUID(),title:preset?.title??'未命名双体实验',createdAt:now,updatedAt:now,
    bodies:preset?ellipsePair([star,planet],escape?2.5:1,escape ? .6 : kepler ? .43 : .3):[],
    layers:{reference:true,trails:true,center:true,velocity:true,apsides:true,sweeps:kepler},
  }
}
