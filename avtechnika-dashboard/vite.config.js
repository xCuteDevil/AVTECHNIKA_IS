import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useHttps = process.env.VITE_DEV_HTTPS === 'true'
  return {
    plugins: [
      react(),
      useHttps ? basicSsl() : null,
    ].filter(Boolean),
    server: {
      https: useHttps ? true : undefined,
    },
  }
})
