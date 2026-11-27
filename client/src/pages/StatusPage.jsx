import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';

// 확인용 화면: 서버·DB·소켓이 연결됐는지 보여 준다. 소켓은 로그인해야 연결된다.
export default function StatusPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [socketState, setSocketState] = useState(socket.connected ? `✅ 연결 (${socket.id})` : '');

  useEffect(() => {
    api('/health').then(setHealth).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onConnect = () => setSocketState(`✅ 연결 (${socket.id})`);
    const onDisconnect = () => setSocketState('끊김');
    const onError = (err) => setSocketState(`❌ ${err.message}`);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  return (
    <main className="page">
      <h1>연결 상태</h1>
      <ul className="status-list">
        <li>서버: {error ? `❌ ${error}` : health ? '✅ 응답' : '…'}</li>
        <li>DB: {health ? (health.db ? `✅ 연결 (방 ${health.rooms}개)` : `❌ ${health.error}`) : '…'}</li>
        <li>로그인: {user ? `✅ ${user.nickname} (${user.department ?? '부서 없음'})` : '로그인 안 함'}</li>
        <li>소켓: {user ? socketState || '연결 중…' : '로그인하면 연결돼요'}</li>
      </ul>
    </main>
  );
}
