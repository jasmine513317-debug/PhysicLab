import type { Point } from './model'

export const INK_HOLD_MS=900
export const INK_HOLD_TOLERANCE_PX=2

type Timer=ReturnType<typeof setTimeout>
export class InkHold {
  private timer:Timer|undefined
  private last:Point|undefined
  ready=false
  constructor(private tolerance=INK_HOLD_TOLERANCE_PX,private notify:()=>void) {}
  start(point:Point) {this.cancel();this.last=point;this.arm()}
  move(point:Point) {
    if(!this.last)return false
    if(Math.hypot(point.x-this.last.x,point.y-this.last.y)<this.tolerance)return false
    this.last=point;this.ready=false;this.arm()
    return true
  }
  private arm() {
    if(this.timer!==undefined)clearTimeout(this.timer)
    this.timer=setTimeout(()=>{this.timer=undefined;this.ready=true;this.notify()},INK_HOLD_MS)
  }
  cancel() {
    if(this.timer!==undefined)clearTimeout(this.timer)
    this.timer=undefined;this.last=undefined;this.ready=false
  }
}
