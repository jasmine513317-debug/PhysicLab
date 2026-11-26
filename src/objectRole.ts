import type { BodyConfig, ObjectRole } from './model'

export type EditableRole=Exclude<ObjectRole,'constraint'>
export type RoleVisual={filled:boolean;stroke?:string;dash?:number[];badge?:string}

export function withObjectRole(config:BodyConfig,role:EditableRole):BodyConfig {
  const fixed=role!=='body'||config.geometry.kind==='surface'||config.geometry.kind==='track'||
    (config.geometry.kind==='freeform'&&!config.geometry.closed)
  const geometry=role==='track'&&config.geometry.kind==='freeform'
    ? {kind:'track' as const,vertices:config.geometry.vertices,closed:config.geometry.closed}
    : config.geometry
  return {
    ...config,role,geometry,type:fixed?'static':config.type,
    ...(fixed?{velocity:{x:0,y:0},angularVelocity:0}:{}),
    ...(role==='field'&&config.charge===undefined?{charge:10}:{}),
  }
}

export function roleVisual(config:BodyConfig):RoleVisual {
  const role=config.role??(config.geometry.kind==='track'?'track':'body')
  if(role==='body')return {filled:true}
  if(role==='marker')return {filled:false,dash:[5,4]}
  if(role==='boundary')return {filled:true,stroke:'#e6a071',badge:'B'}
  if(role==='track')return {filled:false,stroke:'#e8b779',dash:[8,5]}
  return {filled:false,stroke:'#c5a3ff',badge:!config.charge?'±':config.charge>0?'+':'−'}
}
