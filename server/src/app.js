import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRoutes from './modules/health/health.routes.js';

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

// 기능(모듈)마다 주소 앞부분을 하나씩 맡는다. 새 기능은 modules/<기능>/ 을 만들고 여기 한 줄 추가.
app.use('/api/health', healthRoutes);

// 없는 주소
app.use('/api', (req, res) => res.status(404).json({ message: '없는 API 주소예요.' }));
