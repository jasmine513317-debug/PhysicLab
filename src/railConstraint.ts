import type { BodyConfig,Point } from './model'
import { rotate } from './coordinates'

const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y
type Segment={a:Point;tangent:Point;start:number;end:number}

// One degree of freedom: distance along the static rail. The bead's centre is the
// constraint point. It has no rolling, friction or collisions with other objects.
export class RailConstraint {
  private readonly segments:Segment[]=[]
  private readonly length:number
  private readonly closed:boolean
  private distance=0
  private speed=0

  constructor(track:BodyConfig,position:Point,velocity:Point) {
    if(track.geometry.kind!=='track')throw new Error('请选择链式轨道。')
    const {vertices,closed}=track.geometry
    this.closed=closed
    const world=vertices.map(vertex=>{
      const v=rotate(vertex,track.angle)
      return {x:v.x+track.position.x,y:v.y+track.position.y}
    })
    let start=0,best=Infinity
    world.slice(0,closed?world.length:world.length-1).forEach((a,i)=>{
      const b=world[(i+1)%world.length],length=Math.hypot(b.x-a.x,b.y-a.y)
      const tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length}
      this.segments.push({a,tangent,start,end:start+length})
      const s=Math.max(0,Math.min(length,dot({x:position.x-a.x,y:position.y-a.y},tangent)))
      const miss=Math.hypot(position.x-a.x-tangent.x*s,position.y-a.y-tangent.y*s)
      if(miss<best){best=miss;this.distance=start+s;this.speed=dot(velocity,tangent)}
      start+=length
    })
    this.length=start
  }

  private segment(distance:number,speed:number) {
    if(speed<0&&distance===0&&this.closed)return this.segments.at(-1)!
    return this.segments.find(segment=>speed<0?distance<=segment.end:distance<segment.end)??this.segments.at(-1)!
  }

  pose() {
    const segment=this.segment(this.distance,this.speed),tangent=segment.tangent
    const distance=this.closed&&this.distance===0&&this.speed<0?this.length:this.distance
    const offset=distance-segment.start
    return {
      position:{x:segment.a.x+offset*tangent.x,y:segment.a.y+offset*tangent.y},
      velocity:{x:this.speed*tangent.x,y:this.speed*tangent.y},tangent,
    }
  }

  setVelocity(velocity:Point) {this.speed=dot(velocity,this.pose().tangent)}

  step(dt:number,acceleration:Point,drag:number) {
    // Substep so tangential work changes smoothly through neighbouring segments.
    const slices=8,h=dt/slices
    for(let i=0;i<slices;i++) {
      const a=dot(acceleration,this.pose().tangent)-drag*this.speed
      const predicted=this.distance+this.speed*h+.5*a*h*h
      const v=this.speed+a*h
      if(this.closed) {
        this.distance=((predicted%this.length)+this.length)%this.length
        this.speed=v
      } else {
        this.distance=Math.max(0,Math.min(this.length,predicted))
        this.speed=predicted<0||predicted>this.length?0:v
      }
    }
    return this.pose()
  }
}
