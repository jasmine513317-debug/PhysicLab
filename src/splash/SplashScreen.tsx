import { ArrowRight,Atom } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { animateSpace } from './space'
import planet from './planet.jpg'
import atmosphere from './atmosphere.jpg'
import { appUrl } from '../routes'
import './splash.css'

export const startupSteps = ['应用资源', '物理核心', '实验环境'] as const

export function SplashScreen({ completed=0, leaving=false, storageUnavailable=false, ready=false }: {completed?: number; leaving?: boolean;storageUnavailable?:boolean;ready?:boolean}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const atmosphereMotion=useRef<HTMLDivElement>(null)
  const [planetFailed,setPlanetFailed]=useState(false)
  const [atmosphereFailed,setAtmosphereFailed]=useState(false)
  useEffect(() => {
    if (canvas.current&&atmosphereMotion.current) return animateSpace(canvas.current,atmosphereMotion.current)
  }, [])
  return <main className="launch-transition" id={ready?'app-content':undefined}>
    <section className={'launch' + (leaving ? ' launch-leaving' : '')} aria-label="PhysicLab">
      <div className={'launch-space'+(atmosphereFailed?' launch-texture-failed':'')} aria-hidden="true">
        <div className="launch-nebula"/>
        {!atmosphereFailed&&<img className="launch-atmosphere" src={atmosphere} alt="" onError={()=>setAtmosphereFailed(true)}/>}
        <div className="launch-atmosphere-motion" ref={atmosphereMotion} hidden={atmosphereFailed}>
          <div className="launch-wisp launch-wisp-left" style={{backgroundImage:'url('+atmosphere+')'}}/>
          <div className="launch-wisp launch-wisp-right" style={{backgroundImage:'url('+atmosphere+')'}}/>
        </div>
        {planetFailed||atmosphereFailed?<div className={'launch-planet-fallback'+(planetFailed?' launch-no-planet':'')}/>:null}
        {!planetFailed&&
          <img className="launch-planet" src={planet} alt="" onError={()=>setPlanetFailed(true)}/>}
        <canvas className="launch-canvas" ref={canvas}/>
      </div>
      <div className="launch-brand">
        <div className="launch-wordmark"><Atom aria-hidden="true" strokeWidth={1.5}/><span>PhysicLab</span></div>
        {ready?<h1>让想法，成为实验。</h1>:<p>让想法，成为实验。</p>}
      </div>
      {ready?<a className="launch-enter" href={appUrl('/lab?new=1')}>创建实验<ArrowRight size={16} aria-hidden="true"/></a>:
      <div className="launch-track" role="progressbar" aria-label="启动进度" aria-valuemin={0} aria-valuemax={startupSteps.length}
        aria-valuenow={completed} aria-valuetext={completed+' / '+startupSteps.length+' 启动阶段结束'+(storageUnavailable?'，实验存储暂不可用':'')}>
        <div className="launch-progress" style={{width: completed / startupSteps.length * 100 + '%'}}/>
      </div>}
    </section>
  </main>
}
