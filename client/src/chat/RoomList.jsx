import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';
import { useUnread } from '../notifications/useUnread.js';

// 채팅방 목록 (채팅 팝업 첫 화면). 방을 누르면 onSelect(방 id)
export default function RoomList({ onSelect }) {
  const { token, user } = useAuth();
  const { counts, syncFromRooms } = useUnread();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // 처음 열 때 방 목록 받기
  useEffect(() => {
    api('/rooms', { token })
      .then((data) => {
        setRooms(data.rooms);
        syncFromRooms(data.rooms); // 안 읽은 개수도 최신으로
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, syncFromRooms]);

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
      onSelect(room.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="sidebar">
      <form className="room-create" onSubmit={onCreate}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 채팅방 이름"
          maxLength={30}
          aria-label="새 채팅방 이름"
        />
        <button type="submit" disabled={creating || !newName.trim()}>만들기</button>
      </form>
      {error && <p className="form-error sidebar-error">{error}</p>}

      {loading ? (
        <p className="muted sidebar-empty">불러오는 중…</p>
      ) : rooms.length === 0 ? (
        <p className="muted sidebar-empty">아직 채팅방이 없어요. 첫 방을 만들어 보세요.</p>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => (
            <li key={room.id}>
              <button type="button" className="room-item" onClick={() => onSelect(room.id)}>
                <span className="room-name">{room.name}</span>
                <span className="room-meta">
                  {counts[room.id] > 0 && <span className="badge-unread">{counts[room.id] > 99 ? '99+' : counts[room.id]}</span>}
                  {room.joined && <span className="badge-joined">참여 중</span>}
                  <span>👥 {room.memberCount}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
