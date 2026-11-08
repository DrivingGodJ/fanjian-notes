import type { Label } from './layout';
import type { Annotation, AnnotationStyle } from '../types';
import {ANNOTATION_FONT} from './typography';
export function AnnotationLayer({labels,style,onSelect}:{labels:Label[];style:AnnotationStyle;onSelect?:(a:Annotation)=>void}){
 return <g opacity={style.opacity} data-testid="annotation-layer">{labels.filter(l=>!l.hidden).map(l=><g key={l.annotation.id}
   transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`} role={onSelect?'button':undefined}
   tabIndex={onSelect?0:undefined} aria-label={`${l.annotation.original} → ${l.annotation.simplified}`}
   onClick={e=>{e.stopPropagation();onSelect?.(l.annotation);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onSelect?.(l.annotation);}}
   className={onSelect?'annotation-hit':''} data-testid="annotation" data-original={l.annotation.original} data-line={l.annotation.lineId}>
   <title>{l.annotation.original} → {l.annotation.simplified} · {l.annotation.kind==='phrase'?'短语提示':'估算位置，点击纠正'}</title>
   <rect x={-l.width/2} y={-l.height/2} width={l.width} height={l.height} rx={l.fontSize*.12} fill={style.background?'#fffdf4':'transparent'}/>
   <text x="0" y="0" dominantBaseline="central" textAnchor="middle" fontFamily={ANNOTATION_FONT} fontWeight="600" fontSize={l.fontSize} fill={style.color}>{l.annotation.simplified}</text>
 </g>)}</g>;
}
