import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { geminiApiProxy } from './server/geminiProxy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    // Make env vars available to server-side plugins via process.env
    if (env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
    }
    if (env.TEXAPI_API_KEY) {
      process.env.TEXAPI_API_KEY = env.TEXAPI_API_KEY;
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), geminiApiProxy()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
