import { COULOMB_CONSTANT } from './electrostatics'
import { add,cross,dot,length,multiply,subtract,type SpatialPhysics,type Vec3 } from './spatialPhysics'

type Charge={charge:number;position:Vec3}
export function spatialField(sources:readonly Charge[],point:Vec3,electric:Vec3=[0,0,0]) {
  let field=electric,potential=-dot(electric,point)
  for(const source of sources) {
    if(!source.charge)continue
    const displacement=subtract(point,source.position)
    const radius=Math.sqrt(dot(displacement,displacement)+.0001)
    const charge=COULOMB_CONSTANT*source.charge
    potential+=charge/radius
    field=add(field,multiply(displacement,charge/radius**3))
  }
  return {field,potential}
}

export function spaceFieldLines(engine:SpatialPhysics,center:Vec3,span:number) {
  const sources=engine.scene.mutualElectric?engine.bodies.filter(b=>b.charge):[]
  const field=(position:Vec3)=>spatialField(sources,position,engine.scene.electric).field
  const step=span/70
  const seeds:{point:Vec3;sign:number}[]=[]
  for(const source of sources.slice(0,10)) {
    const radius=Math.max(.025,span/45)
    for(let i=0;i<10;i++) {
      const y=1-2*(i+.5)/10,angle=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y)
      seeds.push({point:add(source.position,[radius*r*Math.cos(angle),radius*y,radius*r*Math.sin(angle)]),sign:Math.sign(source.charge)})
    }
  }
  if(!seeds.length&&length(engine.scene.electric)>0)for(const x of [-.4,0,.4])for(const z of [-.4,0,.4]) {
    seeds.push({point:add(center,[span*x,0,span*z]),sign:1},{point:add(center,[span*x,0,span*z]),sign:-1})
  }
  return seeds.map(({point,sign})=>{
    const path=[point]
    for(let i=0;i<120;i++) {
      const at=path.at(-1)!,v=field(at),magnitude=length(v)
      if(magnitude<1e-12||length(subtract(at,center))>span)break
      const mid=field(add(at,multiply(v,sign*step/(2*magnitude)))),midLength=length(mid)
      if(midLength<1e-12)break
      const next=add(at,multiply(mid,sign*step/midLength))
      path.push(next)
      if(sources.some(source=>length(subtract(next,source.position))<step*.65))break
    }
    return path
  }).filter(path=>path.length>1)
}

const tetrahedra=[[0,1,5,6],[0,5,4,6],[0,4,7,6],[0,7,3,6],[0,3,2,6],[0,2,1,6]]
const edges=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]
export function equipotentialSurface(engine:SpatialPhysics,center:Vec3,span:number,level:number) {
  const sources=engine.scene.mutualElectric?engine.bodies.filter(b=>b.charge):[]
  const n=16,width=n+1
  const samples=Array.from({length:width**3},(_,i)=>{
    const ix=i%width,iy=Math.floor(i/width)%width,iz=Math.floor(i/width**2)
    const p=add(center,[(ix/n-.5)*span,(iy/n-.5)*span,(iz/n-.5)*span])
    return {p,value:spatialField(sources,p,engine.scene.electric).potential-level}
  })
  const flat=(x:number,y:number,z:number)=>x+width*y+width**2*z
  const cells=(x:number,y:number,z:number)=>[
    flat(x,y,z),flat(x+1,y,z),flat(x+1,y+1,z),flat(x,y+1,z),
    flat(x,y,z+1),flat(x+1,y,z+1),flat(x+1,y+1,z+1),flat(x,y+1,z+1),
  ]
  const faces:Vec3[][]=[]
  for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++) {
    const cube=cells(x,y,z)
    for(const tetra of tetrahedra) {
      const face:Vec3[]=[]
      for(const [i,j] of edges) {
        const a=samples[cube[tetra[i]]],b=samples[cube[tetra[j]]]
        if((a.value<0)===(b.value<0))continue
        const edge=subtract(b.p,a.p)
        let low=0,high=1
        for(let step=0;step<8;step++) {
          const t=(low+high)/2
          const residual=spatialField(sources,add(a.p,multiply(edge,t)),engine.scene.electric).potential-level
          if((residual<0)===(a.value<0))low=t
          else high=t
        }
        face.push(add(a.p,multiply(edge,(low+high)/2)))
      }
      if(face.length===3)faces.push(face)
      if(face.length===4)faces.push([face[0],face[1],face[3]],[face[0],face[3],face[2]])
    }
  }
  return faces
}

export function inductionLoop(engine:SpatialPhysics):Vec3[] {
  const coil=engine.scene.induction
  if(!coil)return []
  const seed:Vec3=Math.abs(coil.normal[1])>.9?[1,0,0]:[0,1,0]
  const crosswise=cross(coil.normal,seed),tangent=multiply(crosswise,coil.radius/length(crosswise))
  const bitangent=cross(coil.normal,tangent)
  return Array.from({length:49},(_,i)=>{
    const angle=i*Math.PI/24
    return add(coil.center,add(multiply(tangent,Math.cos(angle)),multiply(bitangent,Math.sin(angle))))
  })
}
