import { defineConfig, type BrowserName } from '@playwright/test'

const browserName=(process.env.PLAYWRIGHT_BROWSER??'chromium') as BrowserName
const port=Number(process.env.PLAYWRIGHT_PORT??42872)
const baseURL='http://127.0.0.1:'+port

export default defineConfig({
  testDir:'./e2e',
  outputDir:'test-results/'+browserName+'-'+port,
  use:{baseURL,browserName,
    channel:browserName==='chromium'?(process.env.PLAYWRIGHT_CHANNEL??'chromium'):undefined,
    launchOptions:browserName==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:undefined,
    viewport:{width:1440,height:900}},
  webServer:{
    command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port '+port+' --strictPort',
    url:baseURL,
    reuseExistingServer:false,
  },
})
