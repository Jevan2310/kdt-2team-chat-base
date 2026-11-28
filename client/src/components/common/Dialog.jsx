import { useEffect } from 'react';

// 가운데 뜨는 창. 바깥을 누르거나 Esc 를 누르면 닫힌다.
export default function Dialog({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="link-button" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {children}
      </div>
    </div>
  );
}
