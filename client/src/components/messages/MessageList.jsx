import { useLayoutEffect, useRef } from 'react';
import MessageItem from './MessageItem.jsx';

const dateOf = (createdAt) => createdAt?.slice(0, 10) ?? '';

// 메시지 목록 + 스크롤 관리
// - 새 메시지: 맨 아래를 보고 있었거나 내가 보낸 거면 맨 아래로
// - 이전 대화 불러오기: 보던 위치 그대로 유지
export default function MessageList({ messages, myId, hasMore, loadingOlder, onLoadOlder, unreadCountOf }) {
  const boxRef = useRef(null);
  const prev = useRef({ firstId: null, lastId: null, scrollHeight: 0, nearBottom: true });

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || messages.length === 0) return;
    const first = messages[0];
    const last = messages[messages.length - 1];
    const p = prev.current;

    if (p.firstId !== null && first.id < p.firstId && last.id === p.lastId) {
      // 위쪽에 이전 메시지가 붙었음 → 늘어난 높이만큼 내려서 보던 곳 유지
      box.scrollTop += box.scrollHeight - p.scrollHeight;
    } else if (p.lastId === null || p.nearBottom || last.user?.id === myId) {
      box.scrollTop = box.scrollHeight;
    }
    prev.current = { ...p, firstId: first.id, lastId: last.id, scrollHeight: box.scrollHeight };
  }, [messages, myId]);

  const onScroll = () => {
    const box = boxRef.current;
    prev.current.nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    prev.current.scrollHeight = box.scrollHeight;
  };

  return (
    <div className="msg-list" ref={boxRef} onScroll={onScroll}>
      {hasMore && (
        <button type="button" className="load-older" onClick={onLoadOlder} disabled={loadingOlder}>
          {loadingOlder ? '불러오는 중…' : '이전 대화 더 보기'}
        </button>
      )}
      {messages.length === 0 && <p className="muted center">첫 메시지를 보내 보세요.</p>}
      {messages.map((m, i) => (
        <div key={m.id}>
          {dateOf(m.createdAt) !== dateOf(messages[i - 1]?.createdAt) && (
            <div className="msg-date">{dateOf(m.createdAt)}</div>
          )}
          <MessageItem message={m} mine={m.type === 'text' && m.user?.id === myId} unread={unreadCountOf?.(m) ?? 0} />
        </div>
      ))}
    </div>
  );
}
