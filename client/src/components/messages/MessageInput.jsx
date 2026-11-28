import { useState } from 'react';

// Enter = 보내기, Shift+Enter = 줄바꿈
export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // 3. 보내는 순간 입력칸을 비우고(그동안 새로 쓰는 글은 그대로 남음), 실패하면 보낸 글을 되돌려 놓는다
  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    setText('');
    const result = await onSend(content);
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      setText((typed) => (typed ? typed : content)); // 그사이 새로 쓴 게 없으면 보낸 글 복구
    }
  };

  const onKeyDown = (e) => {
    // 한글 입력 중(조합 중) Enter는 글자 확정용이라 무시.
    // Safari 는 조합을 끝내는 Enter 에서 isComposing 이 false 라 keyCode 229 로 한 번 더 확인
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (e.key === 'Enter' && !e.shiftKey && !composing) {
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
