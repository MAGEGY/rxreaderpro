import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages project site needs /rxreaderpro/; local dev stays at /
  base: process.env.GHPAGES ? '/rxreaderpro/' : '/',
  plugins: [react()],
})
