import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// Separate entry for the v2 interface. It reuses ../src stores and data read-only
// and never touches the v1 build (dist/) or its Pages workflow.
export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: path.resolve(__dirname, '../public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@v2': path.resolve(__dirname, 'src'),
      '@': path.resolve(__dirname, '../src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../dist-v2'),
    emptyOutDir: true,
  },
  server: { port: 5174 },
  preview: { port: 5174 },
})
