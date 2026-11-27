import { io } from 'socket.io-client';

// 앱 전체에서 소켓 하나만 쓴다. autoConnect: false → 필요할 때 socket.connect() 로 연결.
// 주소를 비워 두면 지금 페이지 주소(5173)로 연결하고, Vite 프록시가 서버(3000)로 넘긴다.
export const socket = io({ autoConnect: false });
