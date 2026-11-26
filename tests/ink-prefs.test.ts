import { expect, it } from 'vitest'
import { DEFAULT_INK_PREFS, loadInkPrefs, normalizeInkPrefs, saveInkPrefs } from '../src/inkPrefs'

function memoryStorage() {
  const data=new Map<string,string>()
  return {
    data,
    getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{data.set(key,value)},
  }
}

it('normalizes invalid or partial drawing preferences to safe defaults',()=>{
  expect(normalizeInkPrefs(undefined)).toEqual(DEFAULT_INK_PREFS)
  expect(normalizeInkPrefs({color:'green',width:99,mode:'always',eraserMode:'all',eraserSize:'huge',eraserReturn:'yes'})).toEqual(DEFAULT_INK_PREFS)
  expect(normalizeInkPrefs({color:'#AABBCC',width:3.6,mode:'immediate',role:'boundary',eraserMode:'drag',eraserSize:'small',eraserReturn:true}))
    .toEqual({...DEFAULT_INK_PREFS,color:'#aabbcc',width:3.6,mode:'immediate',role:'boundary',eraserMode:'drag',eraserSize:'small',eraserReturn:true})
  expect(normalizeInkPrefs({role:'constraint'}).role).toBe('body')
})

it('deduplicates and caps collected custom colors',()=>{
  const prefs=normalizeInkPrefs({customInks:['#112233','#112233','#445566','#778899','#AABBCC','not-a-color','#101010','#222222','#333333']})
  expect(prefs.customInks).toEqual(['#aabbcc','#101010','#222222','#333333'])
  expect(normalizeInkPrefs({customInks:'#112233'}).customInks).toEqual([])
})

it('round-trips preferences through storage and survives corrupt storage',()=>{
  const storage=memoryStorage()
  const prefs={...DEFAULT_INK_PREFS,color:'#12ab34',customInks:['#12ab34'],width:1.8 as const,mode:'free' as const,eraserReturn:true}
  saveInkPrefs(prefs,storage)
  expect(loadInkPrefs(storage)).toEqual(prefs)

  storage.setItem('physiclab.ink-prefs.v1','{broken')
  expect(loadInkPrefs(storage)).toEqual(DEFAULT_INK_PREFS)

  const blocked={getItem:()=>null,setItem:()=>{throw new Error('quota')}}
  expect(()=>saveInkPrefs(prefs,blocked)).not.toThrow()
})