import { useState } from 'react';

// Enter = 보내기, Shift+Enter = 줄바꿈
export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    const result = await onSend(content);
    setSending(false);
    if (result.ok) setText('');
    else setError(result.message);
  };

  const onKeyDown = (e) => {
    // 한글 입력 중(조합 중) Enter는 글자 확정용이라 무시
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="msg-input">
      {error && <p className="form-error">{error}</p>}
      <div className="msg-input-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? '연결 중…' : '메시지 입력'}
          title="Enter 보내기, Shift+Enter 줄바꿈"
          rows={1}
          maxLength={2000}
          disabled={disabled}
          aria-label="메시지 입력"
        />
        <button type="button" onClick={send} disabled={disabled || sending || !text.trim()}>
          보내기
        </button>
      </div>
    </div>
  );
}
