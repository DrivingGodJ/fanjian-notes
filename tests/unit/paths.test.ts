import {describe,it,expect} from 'vitest';
import {appPath} from '../../src/paths';
describe('deployment resource paths',()=>{
 it('supports a root deployment',()=>expect(appPath('ocr/worker.js','/')).toBe('/ocr/worker.js'));
 it('supports a GitHub Pages project path',()=>expect(appPath('ocr/worker.js','/fanjian-notes/')).toBe('/fanjian-notes/ocr/worker.js'));
 it('keeps icons and runtime resources inside the project scope',()=>expect(appPath('/icon.svg','/fanjian-notes/')).toBe('/fanjian-notes/icon.svg'));
});
