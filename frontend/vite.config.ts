import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // './' — чтобы собранный сайт работал и на user.github.io, и на user.github.io/repo/
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5173, host: '127.0.0.1' },
})
