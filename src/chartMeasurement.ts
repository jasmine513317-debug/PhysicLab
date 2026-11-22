import type { Sample } from './analysis'

export type MeasuredQuantity = Exclude<keyof Sample, 'bodyId' | 'time'>

/** Snap a requested time to a real sample, including samples omitted from the plotted line. */
export function nearestSample(samples: readonly Sample[], time: number) {
  if (!Number.isFinite(time) || !samples.length) return undefined
  let left = 0
  let right = samples.length - 1
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (samples[middle].time < time) left = middle + 1
    else right = middle
  }
  const after = samples[left]
  const before = samples[left - 1]
  return before && time - before.time <= after.time - time ? before : after
}

export function measureInterval(a: Sample, b: Sample, quantity: MeasuredQuantity) {
  const duration = b.time - a.time
  const change = b[quantity] - a[quantity]
  return { duration, change, slope: duration === 0 ? undefined : change / duration }
}
