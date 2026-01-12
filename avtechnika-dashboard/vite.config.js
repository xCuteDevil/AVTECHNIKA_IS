import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useHttps = process.env.VITE_DEV_HTTPS === 'true'
  const certPath = process.env.VITE_SSL_CERT
  const keyPath = process.env.VITE_SSL_KEY
  return {
    plugins: [
      react(),
      // If no explicit cert/key provided, fall back to basic self-signed
      useHttps && !(certPath && keyPath) ? basicSsl() : null,
    ].filter(Boolean),
    server: {
      https: useHttps
        ? (certPath && keyPath
            ? {
                cert: fs.readFileSync(certPath),
                key: fs.readFileSync(keyPath),
              }
            : true)
        : undefined,
      host: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
