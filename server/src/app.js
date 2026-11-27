import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import roomRoutes from './modules/rooms/rooms.routes.js';

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

// 기능(모듈)마다 주소 앞부분을 하나씩 맡는다. 새 기능은 modules/<기능>/ 을 만들고 여기 한 줄 추가.
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// 없는 주소
app.use('/api', (req, res) => res.status(404).json({ message: '없는 API 주소예요.' }));

// 처리 못 한 오류 (Express 5는 async 함수의 오류도 여기로 온다)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: '서버 오류가 났어요.' });
});
