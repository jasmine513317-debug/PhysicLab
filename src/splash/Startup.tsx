import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { SplashScreen } from './SplashScreen'
import { appPath } from '../routes'

const sessionKey='physiclab-startup-v1'
function alreadySeen() {
  try {return sessionStorage.getItem(sessionKey)==='ready'} catch {return false}
}
let preparation:ReturnType<typeof prepare>|undefined
function prepare() {
  const resource=import('../App')
  const physics=Promise.all([import('../physics'),import('../model')]).then(([{Physics},{emptyExperiment}])=>{
    new Physics(emptyExperiment())
  })
  const environment=import('../repository').then(async ({prepareExperimentStorage})=>{
    let timeout=0
    try {
      await Promise.race([prepareExperimentStorage(),new Promise<void>((_,reject)=>{
        timeout=window.setTimeout(()=>reject(new Error('Experiment storage unavailable')),1800)
      })])
    } finally {clearTimeout(timeout)}
  })
  return {resource,physics,environment}
}

export function Startup() {
  const home=appPath(location.pathname)==='/'
  const [seen]=useState(alreadySeen)
  const [completed,setCompleted]=useState(0)
  const [storageUnavailable,setStorageUnavailable]=useState(false)
  const [application,setApplication]=useState<ComponentType>()
  const [leaving,setLeaving]=useState(false)
  const [visible,setVisible]=useState(!seen)
  const [error,setError]=useState(false)

  useEffect(()=>{
    let active=true
    let timer=0
    let frame=0
    const {resource,physics,environment}=preparation??=prepare()
    const track=<T,>(task:Promise<T>)=>task.then(result=>{
      if(active)setCompleted(count=>count+1)
      return result
    })
    const storage=track(environment).catch(()=>{
      if(active){setStorageUnavailable(true);setCompleted(count=>count+1)}
    })
    void Promise.all([track(resource),track(physics),storage]).then(([module])=>{
      if(!active)return
      setApplication(()=>module.App)
      if(home||seen||matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setVisible(false)
      } else {
        // One paint at completion, then the exit transition. There is no minimum intro duration.
        const leave=()=>{
          if(!active)return
          setLeaving(true)
          timer=window.setTimeout(()=>setVisible(false),240)
        }
        if(document.hidden)leave()
        else frame=requestAnimationFrame(()=>{
          frame=requestAnimationFrame(()=>{
            leave()
          })
        })
      }
      try {sessionStorage.setItem(sessionKey,'ready')} catch {/* optional session state */}
    }).catch(()=>{
      if(active){setError(true);setVisible(false)}
    })
    return ()=>{active=false;clearTimeout(timer);cancelAnimationFrame(frame)}
  },[home,seen])

  if(error)return <main className="launch-error" role="alert">无法载入 PhysicLab。请刷新页面重试。</main>
  if(home)return <SplashScreen completed={completed} ready={Boolean(application)} storageUnavailable={storageUnavailable}/>
  if(visible)return <SplashScreen completed={completed} leaving={leaving} storageUnavailable={storageUnavailable}/>
  return application?<Application component={application} animate={!seen&&leaving}/>:<div className="launch-transition" aria-label="正在启动 PhysicLab"/>
}

function Application({component:App,animate}: {component:ComponentType;animate:boolean}) {
  return animate?<div className="launch-arrival"><App/></div>:<App/>
}
