import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';

export default function ChatRoomPage() {
  const { roomId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  // 방에 들어오면: 참여(이미 참여 중이면 그대로) → 방 정보·참여자 받기
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api(`/rooms/${roomId}/join`, { method: 'POST', token });
        const data = await api(`/rooms/${roomId}`, { token });
        if (!cancelled) {
          setRoom(data.room);
          setMembers(data.members);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, token]);

  // 다른 사람이 들어오고 나가면 참여자 목록 고치기
  useEffect(() => {
    const onMembers = ({ roomId: changedId, change, user }) => {
      if (changedId !== Number(roomId)) return;
      setMembers((prev) =>
        change === 'join'
          ? prev.some((m) => m.id === user.id) ? prev : [...prev, user]
          : prev.filter((m) => m.id !== user.id),
      );
    };
    socket.on('room:members', onMembers);
    return () => socket.off('room:members', onMembers);
  }, [roomId]);

  const onLeave = async () => {
    try {
      await api(`/rooms/${roomId}/leave`, { method: 'POST', token });
      navigate('/rooms');
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return (
      <main className="page">
        <p className="form-error">{error}</p>
        <Link to="/rooms">← 채팅방 목록</Link>
      </main>
    );
  }
  if (!room) return <main className="page">불러오는 중…</main>;

  return (
    <main className="page">
      <div className="room-header">
        <Link to="/rooms" aria-label="채팅방 목록으로">←</Link>
        <h1>{room.name}</h1>
        <button type="button" className="link-button danger" onClick={onLeave}>나가기</button>
      </div>

      <section className="members">
        <h2>참여자 {members.length}명</h2>
        <ul>
          {members.map((m) => (
            <li key={m.id}>
              {m.nickname}
              {m.department && <small> · {m.department}</small>}
            </li>
          ))}
        </ul>
      </section>

      <section className="messages-placeholder">
        <p className="muted">메시지는 4단계에서 구현해요.</p>
      </section>
    </main>
  );
}
