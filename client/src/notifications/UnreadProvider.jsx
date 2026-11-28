import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useAuth } from '../auth/useAuth.js';
import { UnreadContext } from './useUnread.js';
import { useChatWidget } from '../chat/useChatWidget.js';

const TOAST_MS = 4000;
const BASE_TITLE = '사내 드라이브';

// 지금 이 방을 보고 있나? (채팅 팝업에 그 방이 떠 있고 탭이 화면에 보일 때)
function isViewing(activeRoomId, roomId) {
  return activeRoomId === roomId && document.visibilityState === 'visible';
}

export function UnreadProvider({ children }) {
  const { token } = useAuth();
  const { activeRoomId } = useChatWidget();
  const activeRef = useRef(activeRoomId);
  const [counts, setCounts] = useState({}); // { 방 id: 안 읽은 개수 }
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    activeRef.current = activeRoomId;
  }, [activeRoomId]);

  // 방 목록을 받으면 개수 맞추기 (로그인할 때, 채팅 팝업의 방 목록을 열 때)
  const syncFromRooms = useCallback((rooms) => {
    setCounts(Object.fromEntries(rooms.map((r) => [r.id, r.unreadCount ?? 0])));
  }, []);

  // 로그인할 때, 그리고 끊겼다 다시 연결될 때(그사이 놓친 알림이 있을 수 있음) 서버 기준으로 다시 맞춘다
  useEffect(() => {
    if (!token) return;
    const resync = () =>
      api('/rooms', { token })
        .then((data) => syncFromRooms(data.rooms))
        .catch(() => {});
    resync();
    socket.on('connect', resync);
    return () => socket.off('connect', resync);
  }, [token, syncFromRooms]);

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  useEffect(() => {
    // 새 메시지 알림: 그 방을 보고 있지 않으면 개수 +1, 토스트 띄우기
    const onNotify = ({ roomId, roomName, message }) => {
      if (isViewing(activeRef.current, roomId)) return;
      setCounts((prev) => ({ ...prev, [roomId]: (prev[roomId] ?? 0) + 1 }));
      const toast = { id: message.id, roomId, roomName, author: message.user?.nickname, content: message.content };
      setToasts((prev) => [...prev.slice(-2), toast]); // 최대 3개
      setTimeout(() => dismiss(toast.id), TOAST_MS);
    };
    // 내가(다른 탭 포함) 그 방을 읽음 → 0
    const onRead = ({ roomId }) => setCounts((prev) => ({ ...prev, [roomId]: 0 }));

    socket.on('notify:message', onNotify);
    socket.on('room:read', onRead);
    return () => {
      socket.off('notify:message', onNotify);
      socket.off('room:read', onRead);
    };
  }, [dismiss]);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  // 브라우저 탭 제목에 안 읽은 개수
  const shownTotal = token ? total : 0;
  useEffect(() => {
    document.title = shownTotal > 0 ? `(${shownTotal}) ${BASE_TITLE}` : BASE_TITLE;
  }, [shownTotal]);

  const value = useMemo(
    () => ({ counts: token ? counts : {}, total: token ? total : 0, toasts, dismiss, syncFromRooms }),
    [token, counts, total, toasts, dismiss, syncFromRooms],
  );
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
