import { CircleDot, Magnet, Orbit, type LucideIcon } from 'lucide-react'
import { appUrl } from './routes'

export interface Domain {
  id:'mechanics'|'electromagnetism'|'astrophysics'
  name:string
  icon:LucideIcon
  description:string
}

export const domains:readonly Domain[]=[
  {id:'mechanics',name:'经典力学',icon:CircleDot,description:'搭建刚体、斜面与弹簧，分析运动、摩擦和碰撞。'},
  {id:'electromagnetism',name:'电磁学',icon:Magnet,description:'从点电荷出发，探索电场与电势分布。'},
  {id:'astrophysics',name:'天体物理',icon:Orbit,description:'改变质量与初速度，探索引力和轨道。'},
]

export function domainUrl(domain:Domain) {
  return appUrl(domain.id==='mechanics'?'/lab':'/lab?domain='+domain.id)
}

export function DomainNav({active,select}:{active:Domain;select:(domain:Domain)=>void}) {
  return <nav className="domain-nav" aria-label="实验领域">
    {domains.map(domain=><a key={domain.id} href={domainUrl(domain)} aria-current={domain.id===active.id?'page':undefined} onClick={event=>{
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return
      event.preventDefault()
      select(domain)
    }}>
      <domain.icon size={15} aria-hidden="true"/>{domain.name}
    </a>)}
  </nav>
}
