import type { Label } from './layout';
import type { AnnotationStyle } from '../types';
import {ANNOTATION_FONT} from './typography';
export function AnnotationLayer({labels,style}:{labels:Label[];style:AnnotationStyle}){
 return <g opacity={style.opacity} data-testid="annotation-layer">{labels.filter(l=>!l.hidden).map(l=><g key={l.annotation.id}
   transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`}
   data-testid="annotation" data-original={l.annotation.original} data-line={l.annotation.lineId}
   data-bg={l.bgColor} data-ink={l.inkColor}>
   <title>{l.annotation.original} → {l.annotation.simplified}</title>
   <rect x={-l.width/2} y={-l.height/2} width={l.width} height={l.height} rx={Math.min(l.width,l.height)*.14} fill={l.bgColor}/>
   <text x="0" y="0" dominantBaseline="central" textAnchor="middle" fontFamily={ANNOTATION_FONT} fontWeight="500" fontSize={l.fontSize} fill={l.inkColor}>{l.annotation.simplified}</text>
  </g>)}</g>;
}
