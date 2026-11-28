import { useEffect, useRef, useState } from 'react';
import Dialog from '../common/Dialog.jsx';

// 이름 입력 창 (새 폴더, 이름 바꾸기). onSubmit(name) 이 오류 문구를 돌려주면 창에 보여 준다
export default function NameDialog({ title, initial = '', submitLabel = '확인', maxLength = 255, onSubmit, onClose }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // 파일 이름이면 확장자 앞까지만 선택 → 바로 고쳐 쓰기 편하게
  useEffect(() => {
    const input = inputRef.current;
    const dot = initial.lastIndexOf('.');
    input?.focus();
    input?.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const message = await onSubmit(name.trim());
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={maxLength} aria-label="이름" />
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>{submitLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}
