import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발할 때 /api, /uploads, /socket.io 요청을 서버(3000)로 넘긴다 → 브라우저 입장에선 같은 주소라 CORS 문제가 없다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // xfwd: 원래 접속한 주소를 X-Forwarded-For 로 서버에 알려 준다 (서버의 로그인 시도 제한이 사람마다 세도록)
      '/api': { target: 'http://localhost:3000', xfwd: true },
      '/uploads': { target: 'http://localhost:3000', xfwd: true }, // 프로필 사진 등 올린 파일
      '/socket.io': { target: 'http://localhost:3000', ws: true, xfwd: true },
    },
  },
})
