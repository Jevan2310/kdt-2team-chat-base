import { useCallback, useMemo, useState } from 'react';
import { ChatWidgetContext } from './useChatWidget.js';

// 새로고침해도 팝업 상태(열림·보던 방)가 유지되게 브라우저에 저장 (막혀 있으면 그냥 닫힌 상태로 시작)
// 사람마다 따로 저장한다 → 같은 브라우저에서 다른 사람이 로그인해도 앞사람이 보던 방이 열리지 않음
const keyOf = (userId) => `chat.widget.${userId}`;

try {
  localStorage.removeItem('chat.widget'); // 예전(사람 구분 없던) 저장값 정리
} catch {
  // 저장이 막힌 브라우저면 무시
}

function readSaved(userId) {
  if (!userId) return { phase: 'closed', roomId: null };
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(userId)) ?? 'null');
    return { phase: saved?.open ? 'open' : 'closed', roomId: Number.isInteger(saved?.roomId) ? saved.roomId : null };
  } catch {
    return { phase: 'closed', roomId: null };
  }
}
function save(userId, state) {
  if (!userId) return;
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify({ open: state.phase === 'open', roomId: state.roomId }));
  } catch {
    // 저장이 막힌 브라우저면 무시
  }
}

// phase: 'open' 열림 / 'closing' 닫히는 효과 중 / 'closed' 닫힘
// 로그인한 사람이 바뀌면 main.jsx 에서 key 가 바뀌어 이 상태가 통째로 새로 만들어진다
export function ChatWidgetProvider({ userId, children }) {
  const [state, setState] = useState(() => readSaved(userId));

  const update = useCallback(
    (fn) => {
      setState((prev) => {
        const next = fn(prev);
        save(userId, next);
        return next;
      });
    },
    [userId],
  );

  // roomId 를 주면 그 방으로, undefined 면 마지막에 보던 화면으로 연다
  const open = useCallback((roomId) => update((s) => ({ phase: 'open', roomId: roomId === undefined ? s.roomId : roomId })), [update]);
  const close = useCallback(() => update((s) => (s.phase === 'open' ? { ...s, phase: 'closing' } : s)), [update]);
  const finishClose = useCallback(() => update((s) => (s.phase === 'closing' ? { ...s, phase: 'closed' } : s)), [update]);
  const showRoom = useCallback((roomId) => update((s) => ({ ...s, roomId })), [update]);
  const showList = useCallback(() => update((s) => ({ ...s, roomId: null })), [update]);

  const value = useMemo(
    () => ({
      phase: state.phase,
      isOpen: state.phase === 'open',
      roomId: state.roomId,
      activeRoomId: state.phase === 'open' ? state.roomId : null, // 지금 화면에 떠 있는 방 (알림·읽음 판단용)
      open,
      close,
      finishClose,
      showRoom,
      showList,
    }),
    [state, open, close, finishClose, showRoom, showList],
  );
  return <ChatWidgetContext.Provider value={value}>{children}</ChatWidgetContext.Provider>;
}
