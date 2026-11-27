import { useEffect } from 'react';

// "읽음 확인" 창: 이 메시지를 읽은 사람 / 아직 안 읽은 사람 (보낸 사람 제외)
export default function ReadersDialog({ readers, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const section = (title, people) => (
    <section>
      <h3>
        {title} <span className="muted">{people.length}</span>
      </h3>
      {people.length === 0 ? (
        <p className="muted">없음</p>
      ) : (
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              {p.nickname}
              {p.department && <small> · {p.department}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="읽음 확인" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>읽음 확인</h2>
          <button type="button" className="link-button" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {section('안 읽음', readers.unread)}
        {section('읽음', readers.read)}
      </div>
    </div>
  );
}
