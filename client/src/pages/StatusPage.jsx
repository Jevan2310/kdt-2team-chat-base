import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';

// 1단계 확인용 화면: 서버·DB·소켓이 연결됐는지 보여 준다.
export default function StatusPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [socketMsg, setSocketMsg] = useState('연결 중…');

  useEffect(() => {
    api('/health').then(setHealth).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onHello = (data) => setSocketMsg(`${data.message} (${data.socketId})`);
    const onDisconnect = () => setSocketMsg('끊김');
    socket.on('server:hello', onHello);
    socket.on('disconnect', onDisconnect);
    socket.connect();
    return () => {
      socket.off('server:hello', onHello);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
    };
  }, []);

  return (
    <main className="page">
      <h1>연결 상태</h1>
      <ul className="status-list">
        <li>서버: {error ? `❌ ${error}` : health ? '✅ 응답' : '…'}</li>
        <li>DB: {health ? (health.db ? `✅ 연결 (방 ${health.rooms}개)` : `❌ ${health.error}`) : '…'}</li>
        <li>소켓: {socketMsg}</li>
      </ul>
    </main>
  );
}
