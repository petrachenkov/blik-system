import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Слушать все интерфейсы (не только localhost), чтобы с телефона/другого компьютера в
    // той же сети можно было зайти по IP этой машины — см. запрос на тестирование с другого устройства.
    host: true,
    proxy: {
      // В деве бэкенд поднят отдельно (npm run dev:backend); в проде эту роль выполняет nginx
      // (см. infra/docker-compose.yml + apps/frontend/nginx.conf). Порт 3001, а не дефолтный
      // 3000 backend'а — 3000 на этой машине занят посторонним процессом (см. .env PORT).
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
})
