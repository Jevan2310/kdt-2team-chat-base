import { useNavigate } from 'react-router-dom';
import { useUnread } from './useUnread.js';

// 화면 오른쪽 아래 새 메시지 알림. 누르면 그 방으로 이동
export default function Toasts() {
  const { toasts, dismiss } = useUnread();
  const navigate = useNavigate();
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
            navigate(`/rooms/${t.roomId}`);
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
