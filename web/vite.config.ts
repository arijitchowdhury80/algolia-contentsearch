/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // lib unit tests (SSE parser, grounding auditor) need no DOM
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
