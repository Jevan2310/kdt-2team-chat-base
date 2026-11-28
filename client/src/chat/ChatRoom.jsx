import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { socket, useSocketConnected, emitAck } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';
import MessageList from '../components/messages/MessageList.jsx';
import MessageInput from '../components/messages/MessageInput.jsx';
import ReadersDialog from '../components/messages/ReadersDialog.jsx';
import Dialog from '../components/common/Dialog.jsx';
import PersonRow from '../components/users/PersonRow.jsx';

// 같은 id는 한 번만, id 순서대로 (소켓으로 온 것과 API로 받은 것이 겹칠 수 있음)
function mergeMessages(...lists) {
  const byId = new Map();
  lists.flat().forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}


// 채팅 팝업 안의 대화 화면. 방이 바뀌면 부모가 key 를 바꿔 화면 상태를 처음부터 새로 만든다.
// onBack: 방 목록으로, onMinimize: 팝업 내리기
export default function ChatRoom({ id, onBack, onMinimize }) {
  const { token, user } = useAuth();
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [newAfterId, setNewAfterId] = useState(null); // 이 id 뒤로 온 메시지는 슬라이드 효과
  const [loadingOlder, setLoadingOlder] = useState(false);
  const connected = useSocketConnected();
  const [error, setError] = useState('');
  const [readersOf, setReadersOf] = useState(null); // 읽음 확인 창을 연 메시지
  const [notice, setNotice] = useState(''); // 수정·삭제·반응 실패 안내

  // 다시 연결됐을 때 "여기 뒤로 온 것"을 받아 오는 기준 (onConnect 안에서 최신 값을 쓰려고 ref)
  const lastIdRef = useRef(0);
  useEffect(() => {
    lastIdRef.current = messages.at(-1)?.id ?? 0;
  }, [messages]);

  // 방에 들어오면: 참여 → 소켓 방 입장 → 방 정보·참여자·최근 메시지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api(`/rooms/${id}/join`, { method: 'POST', token });
        if (cancelled) return; // 그사이 다른 방으로 옮겼으면 이 방 소켓 그룹에 들어가지 않음
        if (socket.connected) await emitAck('room:join', { roomId: id });
        const [detail, history] = await Promise.all([
          api(`/rooms/${id}`, { token }),
          api(`/rooms/${id}/messages`, { token }),
        ]);
        if (cancelled) return;
        setRoom(detail.room);
        setMembers(detail.members);
        setMessages((prev) => mergeMessages(history.messages, prev));
        setNewAfterId(history.messages.at(-1)?.id ?? 0);
        setHasMore(history.hasMore);
      } catch (err) {
        if (cancelled) return;
        // 팝업이 기억하던 방이 지워졌거나 없으면 오류 화면 대신 방 목록으로
        if (err.status === 404) return onBack();
        setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      socket.emit('room:leave', { roomId: id });
    };
  }, [id, token, onBack]);

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
            : [...prev, { ...who, lastReadMessageId: who.lastReadMessageId ?? 0 }] // 서버가 알려 준 실제 책갈피 (들어온 순간의 마지막 메시지)
          : prev.filter((m) => m.id !== who.id),
      );
    };
    // 누가 어디까지 읽었는지 바뀜 → 메시지 옆 숫자 다시 계산
    const onReadUpdate = ({ roomId: changedId, userId, lastReadMessageId }) => {
      if (changedId !== id) return;
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, lastReadMessageId } : m)));
    };
    // 끊겼다 다시 연결되면: 방에 다시 들어가고, 마지막으로 받은 메시지 "뒤로" 온 것을 빈틈없이 받아 온다
    // (예전에는 최근 50개만 받아서, 그사이 50개 넘게 오면 중간이 비었다)
    const onConnect = async () => {
      await emitAck('room:join', { roomId: id });
      api(`/rooms/${id}`, { token }).then((d) => setMembers(d.members)).catch(() => {}); // 읽음 숫자도 최신으로
      let cursor = lastIdRef.current;
      const caught = [];
      for (let page = 0; cursor && page < 10; page++) {
        const res = await api(`/rooms/${id}/messages?after=${cursor}&limit=100`, { token }).catch(() => null);
        if (!res) return;
        caught.push(...res.messages);
        if (!res.hasMore) {
          // 끊긴 사이 수정·삭제·반응도 반영되게 최근 대화도 한 번 더 받아 합친다
          const latest = await api(`/rooms/${id}/messages`, { token }).catch(() => null);
          setMessages((prev) => mergeMessages(prev, caught, latest?.messages ?? []));
          return;
        }
        cursor = res.messages.at(-1).id;
      }
      // 1000개 넘게 밀렸으면(또는 받은 게 없었으면) 최근 대화로 새로 시작 → 중간이 빈 채로 남지 않게
      const latest = await api(`/rooms/${id}/messages`, { token }).catch(() => null);
      if (latest) {
        setMessages(latest.messages);
        setHasMore(latest.hasMore);
      }
    };

    // 누가 프로필(이름·부서·사진)을 바꿨으면 참여자 목록과 메시지의 보낸 사람 정보를 바꿔 끼운다
    const onUserUpdated = (changed) => {
      setMembers((prev) => prev.map((m) => (m.id === changed.id ? { ...m, ...changed } : m)));
      setMessages((prev) =>
        prev.some((m) => m.user?.id === changed.id)
          ? prev.map((m) => (m.user?.id === changed.id ? { ...m, user: { ...m.user, ...changed } } : m))
          : prev,
      );
    };

    socket.on('message:new', onNew);
    socket.on('user:updated', onUserUpdated);
    socket.on('message:updated', onNew);
    socket.on('room:members', onMembers);
    socket.on('read:update', onReadUpdate);
    socket.on('connect', onConnect);
    return () => {
      socket.off('message:new', onNew);
      socket.off('user:updated', onUserUpdated);
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
  // 메시지가 온 뒤에 들어온 사람은 그 메시지를 본 게 아니므로 뺀다 (joinedAt 이 메시지보다 늦은 사람)
  const readers = useMemo(() => {
    if (!readersOf) return null;
    const joinedBefore = (m) => !(m.joinedAt && m.joinedAt > readersOf.createdAt);
    return members.filter(
      (m) => m.id !== readersOf.user?.id && (m.lastReadMessageId ?? 0) >= readersOf.id && joinedBefore(m),
    );
  }, [readersOf, members]);

  // 메시지 메뉴(수정·삭제·반응)가 쓰는 것들. 결과는 서버가 message:updated 로도 보내지만, 내 화면은 ack 로 바로 반영
  const messageCtx = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.nickname]));
    const change = async (event, data) => {
      if (!socket.connected) return { ok: false, message: '연결이 끊겨 있어요.' };
      const result = await emitAck(event, data);
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
      const result = await emitAck('message:send', { roomId: id, content });
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
      // 1. 실패해도 방 화면은 그대로 두고 짧게 안내 → 버튼을 다시 누르면 됨
      setNotice(`이전 대화를 불러오지 못했어요. 다시 눌러 주세요. (${err.message})`);
    } finally {
      setLoadingOlder(false);
    }
  };

  // 2. 나가기는 한 번 묻고 진행 (— 버튼 바로 옆이라 잘못 누르기 쉬움)
  const [confirmLeave, setConfirmLeave] = useState(false);
  const onLeave = async () => {
    setConfirmLeave(false);
    try {
      await api(`/rooms/${id}/leave`, { method: 'POST', token });
      onBack();
    } catch (err) {
      setNotice(`나가지 못했어요. (${err.message})`);
    }
  };

  if (error) {
    return (
      <div className="no-room">
        <p className="form-error">{error}</p>
        <button type="button" className="link-button" onClick={onBack}>← 채팅방 목록</button>
      </div>
    );
  }
  if (!room) return <div className="no-room">불러오는 중…</div>;

  return (
    <div className="chat-room">
      <header className="room-header">
        <button type="button" className="back-link" onClick={onBack} aria-label="채팅방 목록으로">←</button>
        <h1>{room.name}</h1>
        <button type="button" className="link-button" onClick={() => setShowMembers((v) => !v)} aria-expanded={showMembers}>
          👥 {members.length}
        </button>
        <button type="button" className="link-button danger" onClick={() => setConfirmLeave(true)}>나가기</button>
        <button type="button" className="widget-icon-button" onClick={onMinimize} aria-label="채팅 창 내리기">—</button>
      </header>

      {/* 참여자 목록: 항상 그려 두고 높이만 0 ↔ 내용 높이로 바꿔서 열고 닫을 때 부드럽게 미끄러지게 */}
      <div className={`members-drawer ${showMembers ? 'open' : ''}`} inert={!showMembers}>
        <div className="members-drawer-inner">
          <section className="members person-list" aria-label="참여자">
            {members.map((m) => (
              <PersonRow key={m.id} user={m} size={32} />
            ))}
          </section>
        </div>
      </div>

      {!connected && <p className="conn-warning">연결이 끊겼어요. 다시 연결하는 중…</p>}

      <MessageList
        messages={messages}
        newAfterId={newAfterId}
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
      {confirmLeave && (
        <Dialog title="채팅방 나가기" onClose={() => setConfirmLeave(false)}>
          <p>
            <strong>{room.name}</strong>에서 나갈까요?
            <br />
            <span className="muted">나가면 이 방의 새 메시지를 받지 않아요. 목록에서 다시 들어올 수 있어요.</span>
          </p>
          <div className="dialog-buttons">
            <button type="button" onClick={() => setConfirmLeave(false)}>취소</button>
            <button type="button" className="danger-fill" onClick={onLeave}>나가기</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
