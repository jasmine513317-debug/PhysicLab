import { useId, useState } from 'react'
import './timedRun.css'

interface Props {
  open: boolean
  running: boolean
  currentTime: number
  timeStep: number
  start: (tick: number) => void
}

export function TimedRunControls({open, running, currentTime, timeStep, start}: Props) {
  const [entry, setEntry] = useState('0.70')
  const id = useId()
  const seconds = Number(entry)
  const tick = Math.max(1, Math.round(seconds / timeStep))
  const valid = seconds > 0 && Number.isSafeInteger(tick)
  const stopTime = tick * timeStep
  const restart = valid && currentTime >= stopTime
  if (!open) return null
  return <form id="timed-run-controls" className="timed-controls" onSubmit={event => {
    event.preventDefault()
    if (valid && !running) start(tick)
  }}>
    <label htmlFor={id}>运行到</label>
    <input id={id} type="number" aria-label="目标模拟时间（秒）" step="any" min="0" value={entry}
      required disabled={running} onChange={event => setEntry(event.target.value)} aria-invalid={!valid}/>
    <span>秒</span>
    <button className="button compact" disabled={!valid || running} type="submit">
      {running ? '运行中' : restart ? '从头定时运行' : '开始定时运行'}
    </button>
    {!valid && <small>请输入有效的正数秒数。</small>}
    {valid && Math.abs(seconds - stopTime) > 1e-9 &&
      <small>按 60 Hz 步长，将在 {stopTime.toFixed(3)} 秒暂停。</small>}
  </form>
}
