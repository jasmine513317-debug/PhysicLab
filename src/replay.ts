import { z } from 'zod'
import { experimentSchema, type Experiment } from './model'
import type { Sample } from './analysis'

export const REPLAY_SAMPLE_LIMIT = 3601
const sampleSchema = z.object({
  time:z.number().nonnegative(), bodyId:z.string(), x:z.number(), y:z.number(), angle:z.number(),
  vx:z.number(), vy:z.number(), speed:z.number(), ax:z.number(), ay:z.number(),
  kinetic:z.number(), potential:z.number(), spring:z.number(), total:z.number(),
})
export type RecordedSample = Sample & {angle:number}
type Track = [string, RecordedSample[]]
export interface Replay {
  version:1
  scene:Experiment
  tracks:Track[]
  externalForceApplied?:true
}
const replaySchema = z.object({
  version:z.literal(1),
  scene:experimentSchema,
  tracks:z.array(z.tuple([z.string(),z.array(sampleSchema).min(2).max(REPLAY_SAMPLE_LIMIT)])).min(1).max(100),
  externalForceApplied:z.literal(true).optional(),
})

export function decodeReplay(value:unknown):Replay {
  const replay=replaySchema.parse(value)
  const ids=new Set(replay.scene.bodies.filter(b=>b.type==='dynamic').map(b=>b.id))
  const times=replay.tracks[0][1].map(s=>s.time)
  const aligned=times.every((time,i)=>i===0||time>times[i-1]) && replay.tracks.every(([id,samples])=>
    ids.delete(id)&&samples.length===times.length&&samples.every((s,i)=>s.time===times[i]&&s.bodyId===id))
  if(!aligned||ids.size) throw new Error('回放数据与场景不匹配。')
  return replay
}
