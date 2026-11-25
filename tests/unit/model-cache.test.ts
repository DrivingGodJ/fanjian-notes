import { createHash } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildCandidateSources, type Asset } from '../../src/ocr/model-cache';

describe('model cache candidate sources and auto-failover', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const sampleAsset: Asset = {
    url: 'https://drivinggodj.github.io/fanjian-notes/ocr/ort-wasm-simd-threaded.mjs',
    bytes: 5,
    sha256: createHash('sha256').update('hello').digest('hex'),
    mirrors: [
      'https://fastly.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort-wasm-simd-threaded.mjs',
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort-wasm-simd-threaded.mjs',
      'https://evil.example.com/malicious.mjs'
    ]
  };

  it('orders same-origin first in auto mode, mirrors first in mirror-first mode, and filters untrusted hosts', () => {
    const auto = buildCandidateSources(sampleAsset, 'auto');
    expect(auto.map(s => s.isMirror)).toEqual([false, true, true]);
    expect(auto[0].url).toContain('direct=1');
    expect(auto.some(s => s.url.includes('evil.example.com'))).toBe(false);

    const mirrorFirst = buildCandidateSources(sampleAsset, 'mirror-first');
    expect(mirrorFirst.map(s => s.isMirror)).toEqual([true, true, false]);

    const originOnly = buildCandidateSources(sampleAsset, 'origin-only');
    expect(originOnly).toHaveLength(1);
    expect(originOnly[0].isMirror).toBe(false);
  });

  it('automatically fails over to verified mirror and caches under canonical URL', async () => {
    vi.resetModules();
    const payload = new TextEncoder().encode('hello');
    const hash = createHash('sha256').update(payload).digest('hex');
    const manifestJson = {
      version: 'test',
      assets: [
        {
          url: 'ort-wasm-simd-threaded.mjs',
          bytes: payload.byteLength,
          sha256: hash,
          mirrors: ['https://fastly.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort-wasm-simd-threaded.mjs']
        }
      ]
    };

    const store = new Map<string, Response>();
    const fakeCache = {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, res: Response) => {
        const buf = await res.arrayBuffer();
        store.set(key, new Response(buf, { headers: res.headers }));
      }
    };

    vi.stubGlobal('location', { href: 'https://drivinggodj.github.io/fanjian-notes/', origin: 'https://drivinggodj.github.io' });
    vi.stubGlobal('caches', {
      open: async () => fakeCache,
      delete: async () => true
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.includes('manifest.json')) {
        return new Response(JSON.stringify(manifestJson), { status: 200 });
      }
      if (input.startsWith('https://drivinggodj.github.io/')) {
        return new Response(null, { status: 504 });
      }
      if (input.startsWith('https://fastly.jsdelivr.net/')) {
        return new Response(payload, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }));

    const { downloadModels } = await import('../../src/ocr/model-cache');
    const logs: string[] = [];
    const result = await downloadModels(() => {}, undefined, { mode: 'auto', onLog: l => logs.push(l) });

    expect(result.ready).toBe(true);
    expect(result.cached).toBe(1);
    expect(logs.some(l => l.includes('自动切换下一线路'))).toBe(true);
    expect([...store.keys()].some(k => k.endsWith('/ocr/ort-wasm-simd-threaded.mjs'))).toBe(true);
    expect([...store.keys()].every(k => !k.includes('direct=1'))).toBe(true);
  });
});
