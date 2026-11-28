import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MessageItem from './MessageItem.jsx';
import MessageMenu from './MessageMenu.jsx';

const dateOf = (createdAt) => createdAt?.slice(0, 10) ?? '';
const minutesOf = (createdAt) => (createdAt ? new Date(createdAt.replace(' ', 'T')).getTime() / 60000 : 0);

// 같은 사람이 이어서 보낸 글(같은 날, 5분 이내)은 프로필·이름을 한 번만 보여 준다 (텔레그램·디스코드처럼)
function isContinued(m, prev) {
  return (
    prev?.type === 'text' &&
    m.type === 'text' &&
    prev.user?.id === m.user?.id &&
    dateOf(prev.createdAt) === dateOf(m.createdAt) &&
    minutesOf(m.createdAt) - minutesOf(prev.createdAt) <= 5
  );
}

// 메시지 목록 + 스크롤 관리
// - 새 메시지: 맨 아래를 보고 있었거나 내가 보낸 거면 맨 아래로
// - 이전 대화 불러오기: 보던 위치 그대로 유지
// - 수정·반응처럼 메시지가 바뀌기만 했으면: 스크롤을 건드리지 않음 (맨 아래를 보고 있었으면 맨 아래 유지)
// newAfterId: 방에 들어올 때 받은 마지막 메시지 id. 이보다 뒤에 온 것만 "새 메시지" 효과 (처음 화면·이전 대화는 효과 없음)
export default function MessageList({ messages, newAfterId, hasMore, loadingOlder, onLoadOlder, unreadCountOf, ctx }) {
  const { myId } = ctx;
  const boxRef = useRef(null);
  const prev = useRef({ firstId: null, lastId: null, scrollHeight: 0, nearBottom: true });
  const [menu, setMenu] = useState(null); // 열린 메시지 메뉴 { messageId, anchor }
  const [editingId, setEditingId] = useState(null); // 수정 중인 메시지
  const closeMenu = () => setMenu(null);
  const itemCtx = {
    ...ctx,
    onOpenMenu: (message, anchor) => setMenu({ messageId: message.id, anchor }),
    onCloseMenu: closeMenu,
    onStartEdit: setEditingId,
  };
  const menuMessage = menu && messages.find((m) => m.id === menu.messageId && !m.deletedAt);

  // 메뉴가 열려 있을 때 닫는 경우: 메뉴 밖을 누름, Esc, 목록 스크롤, 창 크기 바뀜
  // (손가락으로 같은 말풍선을 다시 누르면 그 말풍선이 닫기를 처리)
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e) => {
      if (e.target.closest?.('.msg-menu')) return;
      if (e.pointerType !== 'mouse' && e.target.closest?.('.msg-selected')) return;
      setMenu(null);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setMenu(null);
      // 말풍선에 남은 포커스 테두리가 "아직 선택됨"처럼 보이지 않게
      if (document.activeElement?.classList.contains('msg-bubble')) document.activeElement.blur();
    };
    const box = boxRef.current;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    box?.addEventListener('scroll', closeMenu, { passive: true });
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      box?.removeEventListener('scroll', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || messages.length === 0) return;
    const first = messages[0];
    const last = messages[messages.length - 1];
    const p = prev.current;

    if (first.id === p.firstId && last.id === p.lastId) {
      // 목록은 그대로, 내용만 바뀜 (수정·삭제·반응)
      if (p.nearBottom) box.scrollTop = box.scrollHeight;
    } else if (p.firstId !== null && first.id < p.firstId && last.id === p.lastId) {
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
        <div key={m.id} className={newAfterId !== null && m.id > newAfterId ? 'msg-enter' : undefined}>
          {dateOf(m.createdAt) !== dateOf(messages[i - 1]?.createdAt) && (
            <div className="msg-date">{dateOf(m.createdAt)}</div>
          )}
          <MessageItem
            message={m}
            continued={isContinued(m, messages[i - 1])}
            mine={m.type === 'text' && m.user?.id === myId}
            unread={m.deletedAt ? 0 : (unreadCountOf?.(m) ?? 0)}
            selected={menu?.messageId === m.id}
            editing={editingId === m.id}
            ctx={itemCtx}
          />
        </div>
      ))}
      {menuMessage && (
        <MessageMenu
          key={menu.messageId}
          message={menuMessage}
          mine={menuMessage.user?.id === myId}
          anchor={menu.anchor}
          onClose={closeMenu}
          ctx={itemCtx}
        />
      )}
    </div>
  );
}
