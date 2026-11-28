import { useCallback, useMemo, useState } from 'react';
import { ChatWidgetContext } from './useChatWidget.js';

const STORAGE_KEY = 'chat.widget';

// 새로고침해도 팝업 상태(열림·보던 방)가 유지되게 브라우저에 저장 (막혀 있으면 그냥 닫힌 상태로 시작)
function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return { phase: saved?.open ? 'open' : 'closed', roomId: Number.isInteger(saved?.roomId) ? saved.roomId : null };
  } catch {
    return { phase: 'closed', roomId: null };
  }
}
function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: state.phase === 'open', roomId: state.roomId }));
  } catch {
    // 저장이 막힌 브라우저면 무시
  }
}

// phase: 'open' 열림 / 'closing' 닫히는 효과 중 / 'closed' 닫힘
export function ChatWidgetProvider({ children }) {
  const [state, setState] = useState(readSaved);

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = fn(prev);
      save(next);
      return next;
    });
  }, []);

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
