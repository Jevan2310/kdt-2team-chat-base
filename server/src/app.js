import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import roomRoutes from './modules/rooms/rooms.routes.js';
import userRoutes from './modules/users/users.routes.js';
import departmentRoutes from './modules/departments/departments.routes.js';
import driveRoutes from './modules/drive/drive.routes.js';

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

// 기능(모듈)마다 주소 앞부분을 하나씩 맡는다. 새 기능은 modules/<기능>/ 을 만들고 여기 한 줄 추가.
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/drive', driveRoutes);

// 올린 파일(프로필 사진). nosniff: 브라우저가 내용을 보고 다른 형식(HTML 등)으로 해석하지 못하게
app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    index: false,
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  }),
);

// 없는 주소
app.use('/api', (req, res) => res.status(404).json({ message: '없는 API 주소예요.' }));

// 처리 못 한 오류 (Express 5는 async 함수의 오류도 여기로 온다)
// 상태 코드가 붙은 오류(잘못된 JSON 400, 너무 큼 413 …)는 그 코드로, 나머지만 500
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: '요청 형식이 잘못됐어요.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: '보낸 내용이 너무 커요.' });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ message: err.expose === false ? '잘못된 요청이에요.' : err.message });
  if (err.status === 503) return res.status(503).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: '서버 오류가 났어요.' });
});
