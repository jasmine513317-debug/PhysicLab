import data from './sxs0180Horizons'
import { GRAVITATION,LIGHT_SPEED } from './celestialPhysics'
import type { Vec3 } from './spatialPhysics'

// SXS:BBH:0180 / Lev4, Blackman & SXS Collaboration, CC BY 4.0.
// Reduced from Horizons.h5. Rows are t/M, x/M, y/M, z/M, and areal radius/M.
export const sxsMerger={massFraction:data.massFraction,spin:data.spin,source:'https://doi.org/'+data.doi}
const start=data.individualA[0][0]
const shared=data.common[0][0]
const end=data.common[data.common.length-1][0]

function interpolate(rows:number[][],time:number) {
  let left=0,right=rows.length-1
  while(right-left>1) {
    const index=(left+right)>>1
    if(rows[index][0]<=time)left=index
    else right=index
  }
  const a=rows[left],b=rows[right]
  const fraction=Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0])))
  return [1,2,3,4].map(i=>a[i]+fraction*(b[i]-a[i]))
}

export function mergerReplay(totalMass:number) {
  const unit=GRAVITATION*totalMass/LIGHT_SPEED**2,second=unit/LIGHT_SPEED
  return {
    stop:(end-start)*second,
    shared:(shared-start)*second,
    at:(elapsed:number)=>{
      const time=Math.min(end,start+elapsed/second),common=elapsed>=(shared-start)*second
      const horizons=[data.individualA,data.individualB,data.common].map(rows=>interpolate(rows,time))
      return {kind:'mergerReplay' as const,common,sourceTime:time,
        positions:horizons.map(([x,y,z]):Vec3=>[x*unit,z*unit,-y*unit]),
        visualRadii:horizons.map(row=>row[3]*unit)}
    },
  }
}
