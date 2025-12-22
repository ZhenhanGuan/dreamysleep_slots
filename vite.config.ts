import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // 根据环境变量或模式设置base路径
    // 如果设置了 VITE_BASE_PATH，使用该值；否则根据模式判断
    const basePath = env.VITE_BASE_PATH || (mode === 'github' ? '/sleep/' : './');
    return {
      base: basePath, // GitHub Pages需要 '/sleep/'，OSS/COS使用 './'
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // 确保资源文件使用相对路径
        assetsDir: 'assets',
        rollupOptions: {
          output: {
            // 确保资源文件名包含hash，便于缓存
            assetFileNames: 'assets/[name].[hash].[ext]',
            chunkFileNames: 'assets/[name].[hash].js',
            entryFileNames: 'assets/[name].[hash].js',
          }
        }
      }
    };
});
