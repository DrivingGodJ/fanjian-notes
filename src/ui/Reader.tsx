import {useMemo,useState} from 'react';
import {ArrowLeft,Check,Download,Eye,EyeOff,RotateCcw,Save,X} from 'lucide-react';
import type {Reading,ViewTransform} from '../types';
import type {PreprocessOptions} from '../image-processing/analyze';
import {layoutAnnotations} from '../annotation/layout';
import {exportReading} from '../export/image';
import {Viewport} from './Viewport';

export function Reader({reading,saved,onToggleShow,onViewChange,onBack,onSave,onReprocess,notify}:{
 reading:Reading;
 saved:boolean;
 onToggleShow:()=>void;
 onViewChange:(v:ViewTransform)=>void;
 onBack:()=>void;
 onSave:()=>void;
 onReprocess:(options:PreprocessOptions)=>void;
 notify:(s:string)=>void;
}){
 const applied=reading.preprocess??{correct:true,enhance:true};
 const [correct,setCorrect]=useState(applied.correct);
 const [enhance,setEnhance]=useState(applied.enhance);
 const [showExport,setShowExport]=useState(false);
 const [exporting,setExporting]=useState(false);

 const visibleCount=useMemo(()=>layoutAnnotations(reading.annotations,reading.style,reading.width,reading.height,reading.lines).filter(l=>!l.hidden).length,[reading.annotations,reading.style,reading.width,reading.height,reading.lines]);
 const changed=correct!==applied.correct||enhance!==applied.enhance;

 return <section className="reader">
  <header className="reader-header">
   <button className="icon-button" aria-label="返回首页" onClick={onBack}><ArrowLeft size={21}/></button>
   <div className="reader-title">
    <h2>{reading.name}</h2>
    <p>{visibleCount>0?`已替换为简体 · ${visibleCount} 处`:'未发现需转换的繁体字'}</p>
   </div>
   <div className="reader-tools">
    <button className={reading.showAnnotations?'reader-action active':'reader-action'} aria-label={reading.showAnnotations?'隐藏简体':'显示简体'} onClick={onToggleShow}>
     {reading.showAnnotations?<Eye size={16}/>:<EyeOff size={16}/>}
     <span>{reading.showAnnotations?'隐藏':'显示'}</span>
    </button>
    <button className={saved?'reader-action saved':'reader-action'} aria-label="保存阅读记录" onClick={onSave}>
     {saved?<Check size={16}/>:<Save size={16}/>}
     <span>{saved?'已保存':'保存'}</span>
    </button>
    <button className="export-button" aria-label="导出图片" onClick={()=>setShowExport(!showExport)}>
     <Download size={16}/>
     <span>导出</span>
    </button>
   </div>
  </header>

  <Viewport key={reading.id} reading={reading} onView={onViewChange}/>

  <div className="reprocess-bar">
   <label className="check-field"><input type="checkbox" checked={correct} onChange={e=>setCorrect(e.target.checked)}/>自动矫正</label>
   <label className="check-field"><input type="checkbox" checked={enhance} onChange={e=>setEnhance(e.target.checked)}/>图片增强</label>
   <button type="button" className={changed?'primary small reprocess-btn':'secondary small reprocess-btn'} disabled={!changed} onClick={()=>onReprocess({correct,enhance})}>
    <RotateCcw size={14}/>重新识别
   </button>
  </div>

  {showExport&&<aside className="reader-panel" role="dialog" aria-label="导出图片">
   <header><h3>带走这一页</h3><button className="icon-button" aria-label="关闭面板" onClick={()=>setShowExport(false)}><X size={19}/></button></header>
   <p className="muted">保留完整照片与当前可见简体，按照片尺寸导出。</p>
   <p className="export-dimensions">{reading.width} × {reading.height} <span>像素</span></p>
   {(['image/png','image/jpeg'] as const).map(type=><button key={type} className="secondary full export-option" disabled={exporting} onClick={async()=>{setExporting(true);try{await exportReading(reading,type);notify('图片已生成，正在下载');setShowExport(false);}catch(e){notify((e as Error).message);}finally{setExporting(false);}}}><Download size={18}/>{type==='image/png'?'PNG · 清晰无损':'JPEG · 更小文件'}{exporting&&'…'}</button>)}
   <p className="fine-print">{reading.showAnnotations?'包含当前显示的简体替换。':'已隐藏简体，将导出当前底图。'}在 iPhone 上也可以从浏览器下载项保存到相册。</p>
  </aside>}
 </section>;
}
