import { describe, expect, it } from 'vitest'
import { emptyExperiment, environmentSchema, GRAVITY_PRESETS } from '../src/model'

describe('gravity presets', () => {
  it('keeps every preset inside the environment schema', () => {
    for (const preset of GRAVITY_PRESETS) {
      const environment = environmentSchema.parse({ ...emptyExperiment().environment, gravity: preset.gravity })
      expect(environment.gravity).toBe(preset.gravity)
    }
  })

  it('offers uniquely named presets, including weightlessness', () => {
    expect(new Set(GRAVITY_PRESETS.map(p => p.name)).size).toBe(GRAVITY_PRESETS.length)
    expect(new Set(GRAVITY_PRESETS.map(p => p.gravity)).size).toBe(GRAVITY_PRESETS.length)
    expect(GRAVITY_PRESETS.some(p => p.gravity === 0)).toBe(true)
  })

  it('uses the earth preset for a blank experiment', () => {
    expect(emptyExperiment().environment.gravity).toBe(GRAVITY_PRESETS[0].gravity)
    expect(GRAVITY_PRESETS[0].name).toBe('地球')
  })
})
