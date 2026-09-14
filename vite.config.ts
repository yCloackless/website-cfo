import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    esbuild: {
      legalComments: 'none',
    },
    build: {
      outDir: 'dist/public',
      sourcemap: 'hidden',
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
                return 'vendor-react';
              }
              if (id.includes('/three/')) {
                return 'three';
              }
              if (id.includes('/recharts/') || id.includes('/d3-')) {
                return 'recharts';
              }
              if (id.includes('/katex/')) {
                return 'katex';
              }
              if (id.includes('/firebase/')) {
                return 'firebase';
              }
              if (id.includes('/motion/')) {
                return 'motion';
              }
              if (id.includes('/lucide-react/')) {
                return 'vendor-icons';
              }
            }
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '127.0.0.1',
      fs: {
        strict: true,
        deny: ['**/package.json', '**/package-lock.json', '**/.env*', '**/*.mjs', '**/server.ts', '**/server.cjs'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
