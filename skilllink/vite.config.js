import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_FUNCTIONS_PROXY_TARGET?.trim()

  return {
    plugins: [react()],
    server: proxyTarget
      ? {
          proxy: {
            '/functions': {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/functions/, ''),
            },
          },
        }
      : undefined,
  }
})
