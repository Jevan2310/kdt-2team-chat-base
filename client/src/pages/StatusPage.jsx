import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { socket, useSocketConnected } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';

// 확인용 화면: 서버·DB·소켓이 연결됐는지 보여 준다. 소켓은 로그인해야 연결된다.
export default function StatusPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const connected = useSocketConnected();
  const [socketError, setSocketError] = useState('');

  useEffect(() => {
    api('/health').then(setHealth).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onError = (err) => setSocketError(err.message);
    const onConnect = () => setSocketError('');
    socket.on('connect_error', onError);
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect_error', onError);
      socket.off('connect', onConnect);
    };
  }, []);

  return (
    <main className="page">
      <h1>연결 상태</h1>
      <ul className="status-list">
        <li>서버: {error ? `❌ ${error}` : health ? '✅ 응답' : '…'}</li>
        <li>DB: {health ? (health.db ? `✅ 연결 (방 ${health.rooms}개)` : `❌ ${health.error}`) : '…'}</li>
        <li>로그인: {user ? `✅ ${user.nickname} (${user.department ?? '부서 없음'})` : '로그인 안 함'}</li>
        <li>소켓: {!user ? '로그인하면 연결돼요' : connected ? `✅ 연결 (${socket.id})` : socketError ? `❌ ${socketError}` : '연결 중…'}</li>
      </ul>
    </main>
  );
}
