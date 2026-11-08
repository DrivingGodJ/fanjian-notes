export const ANNOTATION_FONT='"Source Han Serif", serif';
export async function ensureAnnotationFont(){
  await document.fonts.load(`600 24px ${ANNOTATION_FONT}`,'繁简旁注');
}
