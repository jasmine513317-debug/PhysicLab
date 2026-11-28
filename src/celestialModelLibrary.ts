import { z } from 'zod'
import { spatialBodySchema,type SpatialBody } from './spatialPhysics'

const key='physiclab-celestial-model-library-v1'
const librarySchema=z.array(spatialBodySchema.refine(body=>!body.geometry&&body.charge===0)).max(50)

export function readCelestialModels() {
  try {return librarySchema.parse(JSON.parse(localStorage.getItem(key)??'[]'))}
  catch {return []}
}

export function writeCelestialModels(models:SpatialBody[]) {
  localStorage.setItem(key,JSON.stringify(librarySchema.parse(models)))
}

export function storeCelestialModel(body:SpatialBody,models:SpatialBody[]) {
  const model:SpatialBody={...body,id:crypto.randomUUID(),position:[0,0,0],velocity:[0,0,0],force:[0,0,0]}
  if(models.length>=50)throw new Error('天体模型库上限为 50 项。')
  const next=[...models,model]
  writeCelestialModels(next)
  return next
}
