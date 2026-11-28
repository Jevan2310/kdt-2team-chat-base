import { useUnread } from './useUnread.js';
import { useChatWidget } from '../chat/useChatWidget.js';

// 화면 오른쪽 아래(채팅 버튼 위) 새 메시지 알림. 누르면 채팅 팝업이 그 방으로 열린다
export default function Toasts() {
  const { toasts, dismiss } = useUnread();
  const { open } = useChatWidget();
  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="toast"
          onClick={() => {
            dismiss(t.id);
            open(t.roomId);
          }}
        >
          <strong>{t.roomName}</strong>
          <span>
            {t.author}: {t.content}
          </span>
        </button>
      ))}
    </div>
  );
}
