import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Save, X } from 'lucide-react'
import type { Replay } from './replay'

interface Props {
  replay:Replay
  index:number
  seek:(index:number)=>void
  close:()=>void
  save:()=>Promise<void>
}

export function ReplayControls({replay,index,seek,close,save}:Props) {
  const samples=replay.tracks[0][1]
  const last=samples.length-1
  const [playing,setPlaying]=useState(false)
  const [saving,setSaving]=useState(false)
  const start=useRef(index)

  useEffect(()=>{
    if(!playing)return
    const first=start.current
    let frame=0
    let cursor=first
    let began:number|undefined
    const tick=(now:number)=>{
      began??=now
      const time=samples[first].time+(now-began)/1000
      while(cursor<last&&samples[cursor+1].time<=time)cursor++
      seek(cursor)
      if(cursor===last)setPlaying(false)
      else frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return ()=>cancelAnimationFrame(frame)
  },[last,playing,samples,seek])

  async function saveRecording() {
    setSaving(true)
    try {await save()}
    finally {setSaving(false)}
  }

  return <section className="replay-controls" aria-label="历史回放">
    <div className="replay-actions">
      <button className="icon framed" aria-label={playing?'暂停回放':'播放回放'} onClick={()=>{
        if(playing) {setPlaying(false);return}
        start.current=index===last?0:index
        seek(start.current)
        setPlaying(true)
      }}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>
      <output aria-label="回放时间">{samples[index].time.toFixed(3)} s</output>
      <button className="button compact" disabled={saving} onClick={()=>void saveRecording()}><Save size={14}/>{saving?'保存中…':'保存回放'}</button>
      <button className="icon" aria-label="退出回放" title="退出回放" onClick={close}><X size={16}/></button>
    </div>
    <input type="range" aria-label="回放时间轴" aria-valuetext={samples[index].time.toFixed(3)+' 秒'} min={0} max={last} step={1} value={index} onChange={e=>{setPlaying(false);seek(+e.target.value)}}/>
  </section>
}
