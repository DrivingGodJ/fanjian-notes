import type { Reading } from '../types';
let dbPromise:Promise<IDBDatabase>|undefined;
function db(){return dbPromise??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('fanjian-notes',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('readings',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>{dbPromise=undefined;reject(request.error);};
});}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('readings',mode),req=run(tx.objectStore('readings'));let result:T;
 req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??new Error('本地存储事务失败'));tx.onerror=()=>reject(tx.error);});
}
export const saveReading=(reading:Reading)=>transaction('readwrite',s=>s.put(reading));
export async function listReadings(){return (await transaction<Reading[]>('readonly',s=>s.getAll())).sort((a,b)=>b.updatedAt-a.updatedAt);}
export const deleteReading=(id:string)=>transaction('readwrite',s=>s.delete(id));
