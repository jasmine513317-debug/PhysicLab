import { describe, expect, it } from 'vitest'
import { decodeExperiment, emptyExperiment } from '../src/model'

describe('experiment version decoding', () => {
  it('keeps supported version 1, 2 and 3 scenes unchanged', () => {
    for (const version of [1, 2, 3] as const) {
      const scene = { ...emptyExperiment(), version }
      expect(decodeExperiment(scene)).toEqual(scene)
    }
  })

  it('rejects a future version without changing the source record', () => {
    const scene = { ...emptyExperiment(), version: 4 }
    const before = structuredClone(scene)

    expect(() => decodeExperiment(scene)).toThrow('暂不支持实验文件版本 4')
    expect(scene).toEqual(before)
  })

  it('rejects a missing version before applying defaults', () => {
    const scene = { ...emptyExperiment() } as Partial<ReturnType<typeof emptyExperiment>>
    delete scene.version

    expect(() => decodeExperiment(scene)).toThrow('实验文件缺少有效版本号')
  })
})
