import { decodeExperiment, type Experiment } from './model'
import { decodeReplay, type Replay } from './replay'
import { electrostaticSchema } from './electrostatics'
import { astronomySchema } from './astronomy'
import { extendedSchema } from './extended-experiments'

const format = 'physiclab-experiment-backup'
const version = 1

export function encodeBackup(scene:Experiment, replay?:Replay) {
  return JSON.stringify({format, version, scene, replay})
}

function readJson(text:string):unknown {
  try { return JSON.parse(text.replace(/^\uFEFF/,'')) }
  catch { throw new Error('该文件不是有效的 PhysicLab 实验文件或实验备份。') }
}

export function decodeImport(text:string, size:number) {
  return readMechanicsImport(readJson(text),size)
}

export function decodeLibraryImport(text:string,size:number) {
  const value=readJson(text)
  if(value&&typeof value==='object'&&'extension' in value) {
    if(size>5_000_000)throw new Error('请选择小于 5 MB 的 PhysicLab 场景 JSON 文件。')
    try {return {kind:'extended' as const,scene:extendedSchema.parse(value)}}
    catch {throw new Error('该文件不是有效的 PhysicLab 扩展实验文件。')}
  }
  if(value&&typeof value==='object'&&'domain' in value&&value.domain==='electromagnetism') {
    if(size>5_000_000)throw new Error('请选择小于 5 MB 的 PhysicLab 场景 JSON 文件。')
    try {return {kind:'electrostatic' as const,scene:electrostaticSchema.parse(value)}}
    catch {throw new Error('该文件不是有效的 PhysicLab 静电实验文件。')}
  }
  if(value&&typeof value==='object'&&'domain' in value&&value.domain==='astrophysics') {
    if(size>5_000_000)throw new Error('请选择小于 5 MB 的 PhysicLab 场景 JSON 文件。')
    try {return {kind:'astronomy' as const,scene:astronomySchema.parse(value)}}
    catch {throw new Error('该文件不是有效的 PhysicLab 双体实验文件。')}
  }
  return {kind:'mechanics' as const,...readMechanicsImport(value,size)}
}

function readMechanicsImport(value:unknown, size:number):{scene:Experiment;replay?:Replay} {

  if(value && typeof value === 'object' && 'format' in value && value.format === format) {
    if(!('version' in value) || value.version !== version) throw new Error('不支持此实验备份版本。')
    try {
      const scene = decodeExperiment('scene' in value ? value.scene : undefined)
      const replay = 'replay' in value ? decodeReplay(value.replay) : undefined
      if(replay&&(replay.scene.id!==scene.id||replay.scene.version!==scene.version))throw new Error('回放不属于此实验。')
      return {scene,replay}
    } catch { throw new Error('实验备份的场景或回放无效。') }
  }

  if(size > 5_000_000) throw new Error('请选择小于 5 MB 的 PhysicLab 场景 JSON 文件。')
  try { return {scene:decodeExperiment(value)} }
  catch { throw new Error('该文件不是有效的 PhysicLab 版本 1 或版本 2 实验文件。') }
}
