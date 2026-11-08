import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync,readFileSync } from 'node:fs';

export default defineConfig(({ mode }) => {
 const base=process.env.VITE_BASE_PATH||'/';
 if(!base.startsWith('/')||!base.endsWith('/'))throw new Error('VITE_BASE_PATH must start and end with /');
 const trusted=mode==='https'&&existsSync('.cert/dev.pem')&&existsSync('.cert/dev-key.pem');
 const https=trusted?{cert:readFileSync('.cert/dev.pem'),key:readFileSync('.cert/dev-key.pem')}:undefined;
 return {
  base,
  plugins: [react(), tailwindcss(), ...(mode === 'https'&&!trusted ? [basicSsl({certDir: '.cert'})] : []), VitePWA({
    base,scope:base,
    strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts',
    registerType: 'prompt', injectRegister: false,
    injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2,txt}'], globIgnores: ['ocr/**','assets/worker-entry-*'], maximumFileSizeToCacheInBytes: 16000000 },
    manifest: {
      name: '繁简旁注', short_name: '繁简旁注', description: '看原照片，读简体旁注',
      lang: 'zh-CN', id:base,scope:base,start_url:base, display: 'standalone', orientation: 'any',
      background_color: '#f6f7f2', theme_color: '#f6f7f2',
      icons: [{src:`${base}icon-192.png`,sizes:'192x192',type:'image/png'}, {src:`${base}icon-512.png`,sizes:'512x512',type:'image/png',purpose:'any maskable'}]
    }
  })],
  optimizeDeps: { exclude: ['@paddleocr/paddleocr-js'] },
  server: { port: 5173, strictPort: true,https },
  preview: { port: 4173, strictPort: true,https },
  build: { chunkSizeWarningLimit: 1800 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' }
};});
