import {useEffect,useRef,useState} from 'react';
import {Camera as CameraIcon,X,ImagePlus} from 'lucide-react';
import {canvasBlob} from '../image-processing/images';
export function Camera({onCapture,onClose,onFallback}:{onCapture:(f:File)=>void;onClose:()=>void;onFallback:()=>void}){
 const video=useRef<HTMLVideoElement>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{let stream:MediaStream|undefined,disposed=false;
   (async()=>{try{if(!window.isSecureContext)throw new Error('相机需要 HTTPS 安全连接。你仍然可以从文件或相册导入照片。');
     stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}},audio:false});
     if(disposed){stream.getTracks().forEach(t=>t.stop());return;}video.current!.srcObject=stream;await video.current!.play();setReady(true);
   }catch(e){if(!disposed)setError(e instanceof Error&&e.message.includes('HTTPS')?e.message:'无法打开相机。请允许相机权限，或使用下方的相册 / 系统拍照后备入口。');}})();
   return()=>{disposed=true;stream?.getTracks().forEach(t=>t.stop());};
 },[]);
 const capture=async()=>{if(!video.current||!ready)return;setBusy(true);try{const v=video.current,c=document.createElement('canvas'),ratio=Math.min(1,2400/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*ratio);c.height=Math.round(v.videoHeight*ratio);c.getContext('2d')!.drawImage(v,0,0,c.width,c.height);onCapture(new File([await canvasBlob(c)],`拍摄-${Date.now()}.jpg`,{type:'image/jpeg'}));c.width=1;}catch{setError('拍摄失败，请使用相册导入。');}finally{setBusy(false);}};
 return <div className="camera-screen" role="dialog" aria-modal="true" aria-label="拍照"><button className="camera-close" aria-label="关闭相机" onClick={onClose}><X/></button><video ref={video} playsInline muted/><div className="camera-guide"/><p>{error||'将文字放入画面，保持手机平稳'}</p><div className="camera-actions"><button className="secondary" onClick={onFallback}><ImagePlus size={18}/>相册 / 系统拍照</button><button className="shutter" aria-label="拍摄照片" disabled={!ready||busy} onClick={capture}><CameraIcon size={28}/></button></div></div>;
}
