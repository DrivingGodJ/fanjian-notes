import {describe,it,expect} from 'vitest';
import {alignConversion,characters,toSimplified} from '../../src/text-conversion/convert';
describe('whole-line contextual conversion and sequence alignment',()=>{
 it.each([
  ['這是一個美麗的世界','这是一个美丽的世界'],['頭髮','头发'],['發展','发展'],['電腦與軟體','电脑与软件'],
  ['繁简混排：這是 iPhone 16，價格 123 元！','繁简混排：这是 iPhone 16，价格 123 元！']
 ])('%s → %s',(source,target)=>expect(toSimplified(source)).toBe(target));
 it('only annotates the three changed characters in the acceptance sentence',()=>{
  expect(alignConversion('這是一個美麗的世界').changes.map(c=>[c.sourceStart,c.original,c.simplified])).toEqual([[0,'這','这'],[3,'個','个'],[5,'麗','丽']]);
 });
 it('preserves mixed letters, numbers, punctuation and existing simplified text',()=>{
  const result=alignConversion('版本 v2.1：這是简体！');expect(result.changes).toHaveLength(1);expect(result.changes[0].original).toBe('這');
 });
 it('does not split Unicode surrogate pairs',()=>{expect(characters('𠮷😀這')).toHaveLength(3);expect(alignConversion('𠮷😀這').changes[0].sourceStart).toBe(2);});
 it('uses phrase hints for insertions, merges and ambiguous paths',()=>{
  expect(alignConversion('甲乙','甲丙丁乙').changes[0].kind).toBe('phrase');
  expect(alignConversion('甲乙','乙甲').ambiguous).toBe(true);
  expect(alignConversion('甲甲','甲').changes.every(c=>c.kind==='phrase')).toBe(true);
 });
 it('does not annotate identical lines',()=>expect(alignConversion('你好，世界！abc123').changes).toEqual([]));
 it('bounds long-input sequence alignment',()=>expect(alignConversion('繁'.repeat(501),'简'.repeat(501)).changes[0].kind).toBe('phrase'));
});
