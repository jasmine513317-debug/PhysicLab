const base=import.meta.env.BASE_URL

export function appUrl(path:string) {
  const relative=path.replace(/^\//,'')
  return base+(base==='/'?relative:relative.replace(/^(lab|experiments|geometry)(?=\?|$)/,'$1/'))
}

export function appPath(pathname:string) {
  const path=pathname.startsWith(base)?pathname.slice(base.length):pathname
  return '/'+path.replace(/^\/+|\/+$/g,'')
}
