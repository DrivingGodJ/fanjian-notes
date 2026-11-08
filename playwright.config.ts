import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/e2e',fullyParallel:false,workers:1,timeout:180000,
 expect:{timeout:15000},reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:process.env.PLAYWRIGHT_BASE_URL||`http://localhost:4173${process.env.VITE_BASE_PATH||'/'}`,viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  browserName:'chromium',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{},
  trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --host 0.0.0.0',port:4173,reuseExistingServer:!process.env.CI}
});
