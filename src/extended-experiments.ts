import { z } from 'zod'
import { appUrl } from './routes'
import { SOLAR_GRAVITY } from './astronomy'

const header={version:z.literal(1),id:z.string().min(1),title:z.string().trim().min(1).max(100),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()}
const range=(min:number,max:number)=>z.number().min(min).max(max)
const orbitBody=z.object({mass:range(1e-15,10),x:range(-20,20),y:range(-20,20),vx:range(-100,100),vy:range(-100,100)})
const triple=z.tuple([orbitBody,orbitBody,orbitBody])
export const extendedSchema=z.discriminatedUnion('extension',[
  z.object({...header,domain:z.literal('mechanics'),extension:z.literal('pendulum'),settings:z.object({
    length:range(.05,30),mass:range(.001,1000),gravity:range(0,100),angle:range(-179,179),angularSpeed:range(-30,30),
  })}),
  z.object({...header,domain:z.literal('electromagnetism'),extension:z.literal('particle'),settings:z.object({
    mass:range(1e-32,100),charge:range(-10,10),ex:range(-100,100),ey:range(-100,100),bz:range(-10,10),vx:range(-1e7,1e7),vy:range(-1e7,1e7),
  })}),
  z.object({...header,domain:z.literal('electromagnetism'),extension:z.literal('rc'),settings:z.object({
    voltage:range(-100,100),resistance:range(10,100000),capacitance:range(1,10000),initialVoltage:range(-100,100),mode:z.enum(['charge','discharge']),
  })}),
  z.object({...header,domain:z.literal('mechanics'),extension:z.literal('double-pendulum'),settings:z.object({
    length1:range(.1,10),length2:range(.1,10),mass1:range(.05,50),mass2:range(.05,50),gravity:range(0,30),
    angle1:range(-180,180),angle2:range(-180,180),speed1:range(-10,10),speed2:range(-10,10),perturbation:range(0,5),
  })}),
  z.object({...header,domain:z.literal('electromagnetism'),extension:z.literal('induction'),settings:z.object({
    area:range(.001,10),field:range(-10,10),slope:range(-10,10),angle:range(-180,180),resistance:range(.1,100000),closed:z.boolean(),
  })}),
  z.object({...header,domain:z.literal('astrophysics'),extension:z.literal('three-body'),settings:z.object({
    bodies:triple,perturbation:range(0,.5),
  })}),
  z.object({...header,domain:z.literal('astrophysics'),extension:z.literal('gravity-assist'),settings:z.object({
    bodies:triple,measurementRadius:range(.005,2),
  })}),
])

export type ExtendedExperiment=z.infer<typeof extendedSchema>
export type PendulumSettings=Extract<ExtendedExperiment,{extension:'pendulum'}>['settings']
export type ParticleSettings=Extract<ExtendedExperiment,{extension:'particle'}>['settings']
export type RcSettings=Extract<ExtendedExperiment,{extension:'rc'}>['settings']
export type DoublePendulumSettings=Extract<ExtendedExperiment,{extension:'double-pendulum'}>['settings']
export type InductionSettings=Extract<ExtendedExperiment,{extension:'induction'}>['settings']
export type GravityExperiment=Extract<ExtendedExperiment,{extension:'three-body'|'gravity-assist'}>
export type GravityBody=z.infer<typeof orbitBody>
export type Extension=ExtendedExperiment['extension']

export const extendedTemplates=[
  {id:'pendulum',domain:'mechanics',title:'单摆',description:'比较摆长、重力和振幅如何影响周期。'},
  {id:'particle',domain:'electromagnetism',title:'带电粒子运动',description:'观察均匀电场和磁场如何改变粒子的运动。'},
  {id:'rc',domain:'electromagnetism',title:'RC 电路暂态',description:'切换充电与放电，测量电容电压和电流。'},
  {id:'double-pendulum',domain:'mechanics',title:'双摆与混沌',description:'改变微小的初始摆角，比较两次运动和步长误差。'},
  {id:'induction',domain:'electromagnetism',title:'电磁感应',description:'在变化的磁场中测量固定回路的磁通与感应电动势。'},
  {id:'three-body',domain:'astrophysics',title:'三体引力',description:'从等质量八字轨道出发，比较轨迹、质心和守恒量。'},
  {id:'gravity-assist',domain:'astrophysics',title:'引力弹弓',description:'在恒星和行星参考系中比较航天器飞掠前后的速度与动能。'},
] as const

export function isExtension(value:unknown):value is Extension {
  return extendedTemplates.some(template=>template.id===value)
}

export function extensionUrl(extension:Extension,id?:string) {
  const domain=extendedTemplates.find(template=>template.id===extension)!.domain
  return appUrl('/lab?domain='+domain+'&extension='+extension+(id?'&id='+encodeURIComponent(id):''))
}

export function createExtendedExperiment(extension:Extension):ExtendedExperiment {
  const now=new Date().toISOString()
  const title=extendedTemplates.find(template=>template.id===extension)!.title
  const header={version:1 as const,id:crypto.randomUUID(),title,createdAt:now,updatedAt:now}
  switch(extension) {
    case 'pendulum':return {...header,domain:'mechanics',extension,settings:{length:1,mass:1,gravity:9.81,angle:20,angularSpeed:0}}
    case 'particle':return {...header,domain:'electromagnetism',extension,settings:{mass:1,charge:1,ex:0,ey:0,bz:2,vx:3,vy:0}}
    case 'rc':return {...header,domain:'electromagnetism',extension,settings:{voltage:5,resistance:1000,capacitance:1000,initialVoltage:0,mode:'charge'}}
    case 'double-pendulum':return {...header,domain:'mechanics',extension,settings:{
      length1:1,length2:1,mass1:1,mass2:1,gravity:9.81,angle1:120,angle2:-20,speed1:0,speed2:0,perturbation:.05,
    }}
    case 'induction':return {...header,domain:'electromagnetism',extension,settings:{
      area:.25,field:.2,slope:.4,angle:30,resistance:2,closed:true,
    }}
    case 'three-body': {
      const vx=.466203685*Math.sqrt(SOLAR_GRAVITY),vy=.43236573*Math.sqrt(SOLAR_GRAVITY)
      return {...header,domain:'astrophysics',extension,settings:{perturbation:.005,bodies:[
        {mass:1,x:-.97000436,y:.24308753,vx,vy},
        {mass:1,x:.97000436,y:-.24308753,vx,vy},
        {mass:1,x:0,y:0,vx:-2*vx,vy:-2*vy},
      ]}}
    }
    case 'gravity-assist': {
      const speed=Math.sqrt(SOLAR_GRAVITY/1.001)
      return {...header,domain:'astrophysics',extension,settings:{measurementRadius:.05,bodies:[
        {mass:1,x:0,y:0,vx:0,vy:-.001*speed},
        {mass:.001,x:1,y:0,vx:0,vy:speed},
        {mass:1e-8,x:.935,y:.02,vx:1,vy:speed-.8},
      ]}}
    }
  }
}
