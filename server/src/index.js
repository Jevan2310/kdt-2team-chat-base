import http from 'node:http';
import { app } from './app.js';
import { attachSocket } from './socket/index.js';
import { config } from './config.js';

// Express(app)와 Socket.IO가 같은 서버·같은 포트(3000)를 쓴다.
const server = http.createServer(app);
attachSocket(server);

server.listen(config.port, () => {
  console.log(`서버 실행: http://localhost:${config.port}`);
});
