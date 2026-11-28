import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { socket, useSocketConnected } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';
import MessageList from '../components/messages/MessageList.jsx';
import MessageInput from '../components/messages/MessageInput.jsx';
import ReadersDialog from '../components/messages/ReadersDialog.jsx';
import PersonRow from '../components/users/PersonRow.jsx';

// 같은 id는 한 번만, id 순서대로 (소켓으로 온 것과 API로 받은 것이 겹칠 수 있음)
function mergeMessages(...lists) {
  const byId = new Map();
  lists.flat().forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// 소켓 emit 을 await 할 수 있게 (서버가 ack 로 답함)
const emitWithAck = (event, data) => new Promise((resolve) => socket.emit(event, data, resolve));

// 방 주소가 바뀌면(key 변경) 화면 상태를 처음부터 새로 만든다
export default function ChatRoomPage() {
  const { roomId } = useParams();
  return <ChatRoom key={roomId} id={Number(roomId)} />;
}

function ChatRoom({ id }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const connected = useSocketConnected();
  const [error, setError] = useState('');
  const [readersOf, setReadersOf] = useState(null); // 읽음 확인 창을 연 메시지
  const [notice, setNotice] = useState(''); // 수정·삭제·반응 실패 안내

  // 방에 들어오면: 참여 → 소켓 방 입장 → 방 정보·참여자·최근 메시지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api(`/rooms/${id}/join`, { method: 'POST', token });
        if (socket.connected) await emitWithAck('room:join', { roomId: id });
        const [detail, history] = await Promise.all([
          api(`/rooms/${id}`, { token }),
          api(`/rooms/${id}/messages`, { token }),
        ]);
        if (cancelled) return;
        setRoom(detail.room);
        setMembers(detail.members);
        setMessages((prev) => mergeMessages(history.messages, prev));
        setHasMore(history.hasMore);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      socket.emit('room:leave', { roomId: id });
    };
  }, [id, token]);

  // 실시간: 새 메시지, 메시지 변경(수정·삭제·반응), 참여자 변화, 소켓 재연결 (연결 상태 표시는 useSocketConnected)
  useEffect(() => {
    // 새 메시지든 바뀐 메시지든 같은 id 는 새것으로 바꿔 끼우면 된다
    const onNew = (message) => {
      if (message.roomId === id) setMessages((prev) => mergeMessages(prev, [message]));
    };
    const onMembers = ({ roomId: changedId, change, user: who }) => {
      if (changedId !== id) return;
      setMembers((prev) =>
        change === 'join'
          ? prev.some((m) => m.id === who.id)
            ? prev
            : [...prev, { ...who, lastReadMessageId: Infinity }] // 새로 온 사람은 이전 메시지를 "안 읽음"으로 세지 않음
          : prev.filter((m) => m.id !== who.id),
      );
    };
    // 누가 어디까지 읽었는지 바뀜 → 메시지 옆 숫자 다시 계산
    const onReadUpdate = ({ roomId: changedId, userId, lastReadMessageId }) => {
      if (changedId !== id) return;
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, lastReadMessageId } : m)));
    };
    // 끊겼다 다시 연결되면 방에 다시 들어가고, 그사이 놓친 메시지를 받아 온다
    const onConnect = async () => {
      await emitWithAck('room:join', { roomId: id });
      const history = await api(`/rooms/${id}/messages`, { token }).catch(() => null);
      if (history) setMessages((prev) => mergeMessages(prev, history.messages));
    };

    socket.on('message:new', onNew);
    socket.on('message:updated', onNew);
    socket.on('room:members', onMembers);
    socket.on('read:update', onReadUpdate);
    socket.on('connect', onConnect);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onNew);
      socket.off('room:members', onMembers);
      socket.off('read:update', onReadUpdate);
      socket.off('connect', onConnect);
    };
  }, [id, token]);

  // 읽음 처리: 화면이 보이고 있으면 마지막 메시지까지 읽었다고 서버에 알린다
  const lastId = messages.at(-1)?.id ?? null;
  const reportedRef = useRef(0);
  useEffect(() => {
    if (!lastId || !connected) return;
    const report = () => {
      if (document.visibilityState !== 'visible' || lastId <= reportedRef.current) return;
      reportedRef.current = lastId;
      socket.emit('message:read', { roomId: id, messageId: lastId });
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [id, lastId, connected]);

  // 메시지별 "안 읽은 사람 수" = 보낸 사람을 뺀 참여자 중 책갈피가 그 메시지보다 앞인 사람 수
  const unreadCountOf = useMemo(() => {
    const marks = members.map((m) => ({ id: m.id, last: m.lastReadMessageId ?? 0 }));
    return (message) => marks.filter((m) => m.id !== message.user?.id && m.last < message.id).length;
  }, [members]);

  // 읽은 사람 창 내용: 보낸 사람을 빼고, 책갈피가 그 메시지 이상인 사람.
  // 메시지가 온 뒤에 들어온 사람은 그 메시지를 본 게 아니므로 뺀다 (방금 들어와 joinedAt 이 없는 사람 = lastReadMessageId Infinity)
  const readers = useMemo(() => {
    if (!readersOf) return null;
    const joinedBefore = (m) => m.lastReadMessageId !== Infinity && !(m.joinedAt && m.joinedAt > readersOf.createdAt);
    return members.filter(
      (m) => m.id !== readersOf.user?.id && (m.lastReadMessageId ?? 0) >= readersOf.id && joinedBefore(m),
    );
  }, [readersOf, members]);

  // 메시지 메뉴(수정·삭제·반응)가 쓰는 것들. 결과는 서버가 message:updated 로도 보내지만, 내 화면은 ack 로 바로 반영
  const messageCtx = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.nickname]));
    const change = async (event, data) => {
      if (!socket.connected) return { ok: false, message: '연결이 끊겨 있어요.' };
      const result = await emitWithAck(event, data);
      if (result.ok) setMessages((prev) => mergeMessages(prev, [result.message]));
      return result;
    };
    const tell = (result) => setNotice(result.ok ? '' : result.message);
    return {
      myId: user.id,
      nameOf: (userId) => byId.get(userId) ?? '나간 사람',
      onReact: async (message, emoji) => tell(await change('reaction:toggle', { messageId: message.id, emoji })),
      onDelete: async (message) => tell(await change('message:delete', { messageId: message.id })),
      onEdit: (message, content) => change('message:edit', { messageId: message.id, content }), // 결과는 수정칸이 보여 줌
      onShowReaders: setReadersOf,
    };
  }, [members, user.id]);

  const sendMessage = useCallback(
    async (content) => {
      if (!socket.connected) return { ok: false, message: '연결이 끊겨 있어요. 잠시 후 다시 보내 주세요.' };
      const result = await emitWithAck('message:send', { roomId: id, content });
      if (result.ok) setMessages((prev) => mergeMessages(prev, [result.message]));
      return result;
    },
    [id],
  );

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    try {
      const older = await api(`/rooms/${id}/messages?before=${messages[0].id}`, { token });
      setMessages((prev) => mergeMessages(older.messages, prev));
      setHasMore(older.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const onLeave = async () => {
    try {
      await api(`/rooms/${id}/leave`, { method: 'POST', token });
      navigate('/rooms');
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return (
      <div className="no-room">
        <p className="form-error">{error}</p>
        <Link to="/rooms">← 채팅방 목록</Link>
      </div>
    );
  }
  if (!room) return <div className="no-room">불러오는 중…</div>;

  return (
    <div className="chat-room">
      <header className="room-header">
        <Link to="/rooms" className="back-link" aria-label="채팅방 목록으로">←</Link>
        <h1>{room.name}</h1>
        <button type="button" className="link-button" onClick={() => setShowMembers((v) => !v)} aria-expanded={showMembers}>
          👥 {members.length}
        </button>
        <button type="button" className="link-button danger" onClick={onLeave}>나가기</button>
      </header>

      {showMembers && (
        <section className="members person-list">
          {members.map((m) => (
            <PersonRow key={m.id} user={m} size={32} />
          ))}
        </section>
      )}

      {!connected && <p className="conn-warning">연결이 끊겼어요. 다시 연결하는 중…</p>}

      <MessageList
        messages={messages}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        unreadCountOf={unreadCountOf}
        ctx={messageCtx}
      />
      {notice && (
        <p className="conn-warning" role="alert">
          {notice} <button type="button" className="link-button" onClick={() => setNotice('')}>닫기</button>
        </p>
      )}
      <MessageInput onSend={sendMessage} disabled={!connected} />
      {readers && <ReadersDialog readers={readers} onClose={() => setReadersOf(null)} />}
    </div>
  );
}
