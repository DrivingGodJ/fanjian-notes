export type Point = { x: number; y: number };
/** Clockwise: top-left, top-right, bottom-right, bottom-left in natural image pixels. */
export type Quad = [Point, Point, Point, Point];
export type Direction = 'horizontal' | 'vertical';
export interface CharacterEvidence {sourceIndex:number;character:string;polygon:Quad;confidence:number}
export interface OcrLine {
  id: string; text: string; polygon: Quad; confidence: number;
  direction: Direction; modified?: boolean;
  directionSource?:'auto'|'manual';
  textCorrected?:boolean;
  characters?:CharacterEvidence[];evidenceStatus?:'verified'|'mismatch'|'unavailable';
}
export interface Annotation {
  id: string; lineId: string; sourceIndex: number; original: string; simplified: string;
  center: Point; position: Point; direction: Direction;
  sourcePolygon?:Quad;
  charWidth: number; charHeight: number; angle: number;
  ocrConfidence: number; positionConfidence: number;
  method: 'geometry' | 'projection' | 'recognition' | 'manual';
  modified: boolean; visible: boolean; deleted?: boolean;
  needsReview?:boolean;
  offset?: Point; kind: 'character' | 'phrase';
}
export interface AnnotationStyle {
  size: number; color: string; opacity: number; background: boolean;
}
export interface ViewTransform { x: number; y: number; scale: number }
export interface Reading {
  id: string; name: string; createdAt: number; updatedAt: number;
  image: Blob; width: number; height: number; lines: OcrLine[];
  annotations: Annotation[]; style: AnnotationStyle; showAnnotations: boolean;
  view: ViewTransform; demo?: boolean;
  alignmentVersion?:number;
}
export interface PreparedImage { blob: Blob; width: number; height: number; name: string }
export const DEFAULT_STYLE: AnnotationStyle = {size: .48, color: '#b34c32', opacity: 1, background: true};
