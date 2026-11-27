import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';

export default function RoomListPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // 처음 열 때 방 목록 받기
  useEffect(() => {
    api('/rooms', { token })
      .then((data) => setRooms(data.rooms))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // 다른 사람이 방을 만들거나 들어오고 나가면 목록을 바로 고친다
  useEffect(() => {
    const onCreated = (room) => {
      setRooms((prev) =>
        prev.some((r) => r.id === room.id)
          ? prev
          : [...prev, { ...room, joined: room.createdBy === user.id }],
      );
    };
    const onMembers = ({ roomId, change, user: who }) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id !== roomId
            ? r
            : {
                ...r,
                memberCount: r.memberCount + (change === 'join' ? 1 : -1),
                joined: who.id === user.id ? change === 'join' : r.joined,
              },
        ),
      );
    };
    socket.on('room:created', onCreated);
    socket.on('room:members', onMembers);
    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:members', onMembers);
    };
  }, [user.id]);

  const onCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError('');
    try {
      const { room } = await api('/rooms', { method: 'POST', body: { name }, token });
      setNewName('');
      navigate(`/rooms/${room.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="page">
      <h1>채팅방</h1>

      <form className="room-create" onSubmit={onCreate}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 채팅방 이름 (예: 개발팀 회의)"
          maxLength={30}
          aria-label="새 채팅방 이름"
        />
        <button type="submit" disabled={creating || !newName.trim()}>만들기</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>불러오는 중…</p>
      ) : rooms.length === 0 ? (
        <p className="muted">아직 채팅방이 없어요. 첫 방을 만들어 보세요.</p>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link to={`/rooms/${room.id}`} className="room-item">
                <span className="room-name">{room.name}</span>
                <span className="room-meta">
                  {room.joined && <span className="badge-joined">참여 중</span>}
                  <span>👥 {room.memberCount}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
