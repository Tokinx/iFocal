import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: {
        window: path.resolve(__dirname, 'window.html'),
        background: path.resolve(__dirname, 'src/background/index.ts'),
        content: path.resolve(__dirname, 'src/content/index.ts')
      },
      output: {
        entryFileNames: chunk => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
        codeSplitting: {
          groups: [
            {
              name: 'vue-vendor',
              test: /node_modules[\\/](vue|@vue|@vueuse)[\\/]/,
              priority: 30
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](reka-ui|@phosphor-icons|@radix-icons|lucide-vue-next|class-variance-authority|clsx|tailwind-merge)[\\/]/,
              priority: 20
            },
            {
              name: 'markdown-vendor',
              test: /node_modules[\\/]marked[\\/]/,
              priority: 20
            }
          ]
        }
      }
    }
  }
});
