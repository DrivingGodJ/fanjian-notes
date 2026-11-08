/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { MODEL_CACHE } from './ocr/model-cache';
declare const self:ServiceWorkerGlobalScope & {__WB_MANIFEST:Array<{url:string;revision:string|null}>};
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
const ocrPrefix=new URL('ocr/',self.registration.scope);
registerRoute(({url})=>url.origin===ocrPrefix.origin&&url.pathname.startsWith(ocrPrefix.pathname),new CacheFirst({cacheName:MODEL_CACHE,matchOptions:{ignoreVary:true}}));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
