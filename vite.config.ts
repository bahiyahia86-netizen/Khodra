import { defineConfig, type PluginOption, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const enableElectron = process.env.KHODRA_ELECTRON === '1'

export default defineConfig(async (): Promise<UserConfig> => {
  const plugins: PluginOption[] = [react(), tailwindcss()]

  if (enableElectron) {
    const electron = (await import('vite-plugin-electron/simple')).default
    plugins.push(
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: [
                  'electron',
                  'mysql2',
                  'mysql2/promise',
                  'bcryptjs',
                  'mysql-memory-server',
                  'sql.js',
                ],
              },
            },
          },
        },
        preload: {
          input: path.join(rootDir, 'electron/preload.ts'),
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                output: {
                  format: 'cjs',
                  entryFileNames: 'preload.cjs',
                },
              },
            },
          },
        },
        renderer: {},
      }) as unknown as PluginOption,
    )
  }

  return {
    plugins,
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
    },
    build: {
      outDir: 'dist',
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
  }
})
