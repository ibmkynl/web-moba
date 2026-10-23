import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173 },
  build: {
    // three.js alone is ~610 kB minified (~150 kB gzip); the game chunk is similar
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // the engine libraries change far less often than the game: separate chunks stay cached across releases
        manualChunks: (id) => {
          if (id.includes('node_modules/three.quarks')) return 'quarks'
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
})
