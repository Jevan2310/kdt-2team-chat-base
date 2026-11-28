import { useEffect } from 'react';
import PersonRow from '../users/PersonRow.jsx';

// "읽은 사람" 창: 이 메시지를 읽은 사람만 프로필과 함께 보여 준다 (보낸 사람 제외)
export default function ReadersDialog({ readers, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="읽은 사람" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            읽은 사람 <span className="muted">{readers.length}</span>
          </h2>
          <button type="button" className="link-button" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {readers.length === 0 ? (
          <p className="muted">아직 읽은 사람이 없어요.</p>
        ) : (
          <div className="person-list">
            {readers.map((p) => (
              <PersonRow key={p.id} user={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
