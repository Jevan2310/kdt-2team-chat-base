import { useAuth } from '../auth/useAuth.js';
import { useUnread } from '../notifications/useUnread.js';
import { useChatWidget } from './useChatWidget.js';
import RoomList from './RoomList.jsx';
import ChatRoom from './ChatRoom.jsx';

// 오른쪽 아래 채팅: 💬 버튼 + 팝업 창 (방 목록 ↔ 대화). 휴대폰에서는 화면 전체로 열린다.
export default function ChatWidget() {
  const { user } = useAuth();
  const { total } = useUnread();
  const { phase, isOpen, roomId, open, close, finishClose, showRoom, showList } = useChatWidget();
  if (!user) return null;

  return (
    <>
      {phase !== 'closed' && (
        <section
          className={`chat-widget ${phase === 'closing' ? 'closing' : ''}`}
          aria-label="채팅"
          onAnimationEnd={(e) => e.target === e.currentTarget && phase === 'closing' && finishClose()}
        >
          {roomId ? (
            <ChatRoom key={roomId} id={roomId} onBack={showList} onMinimize={close} />
          ) : (
            <>
              <header className="widget-header">
                <h2>💬 채팅</h2>
                <button type="button" className="widget-icon-button" onClick={close} aria-label="채팅 창 내리기">—</button>
              </header>
              <RoomList onSelect={showRoom} />
            </>
          )}
        </section>
      )}

      <button
        type="button"
        className={`chat-fab ${isOpen ? 'open' : ''}`}
        onClick={() => (isOpen ? close() : open())}
        aria-label={isOpen ? '채팅 창 내리기' : `채팅 열기${total ? ` (안 읽은 메시지 ${total}개)` : ''}`}
        aria-expanded={isOpen}
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && total > 0 && <span className="badge-unread fab-badge">{total > 99 ? '99+' : total}</span>}
      </button>
    </>
  );
}
