/** Resolve bundled resources under the configured Vite base (including project Pages). */
export function appPath(resource:string,base=import.meta.env.BASE_URL):string {
  return `${base.endsWith('/')?base:`${base}/`}${resource.replace(/^\/+/, '')}`;
}
