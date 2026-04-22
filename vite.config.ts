import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { geminiApiProxy } from './server/geminiProxy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    // Make env vars available to server-side plugins via process.env
    const serverEnvKeys = [
      'GEMINI_API_KEY',
      'TEXAPI_API_KEY',
      'COHERE_API_KEY',
      'COHERE_MODEL',
      'COHERE_TIMEOUT_MS',
      'OPENROUTER_API_KEY',
      'OPENROUTER_MODEL',
      'OPENROUTER_TIMEOUT_MS',
      'GEMINI_TIMEOUT_MS',
      'AI_PROVIDER_ORDER',
    ] as const;

    for (const key of serverEnvKeys) {
      if (env[key]) {
        process.env[key] = env[key];
      }
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
