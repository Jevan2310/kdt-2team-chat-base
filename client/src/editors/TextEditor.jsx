import { useEffect, useRef, useState } from 'react';

// 글 파일(txt·md·json …): 라이브러리 없이 textarea 로 편집 (UTF-8)
export default function TextEditor({ blob, readOnly, saverRef, onDirty }) {
  const [text, setText] = useState(null);
  const textRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    blob.text().then((t) => {
      if (cancelled) return;
      textRef.current = t;
      setText(t);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    saverRef.current = async () => new Blob([textRef.current], { type: blob.type || 'text/plain' });
    return () => {
      saverRef.current = null;
    };
  }, [saverRef, blob]);

  if (text === null) return <p className="muted viewer-message">여는 중…</p>;
  return (
    <textarea
      className="text-editor"
      value={text}
      readOnly={readOnly}
      spellCheck={false}
      aria-label="파일 내용"
      onChange={(e) => {
        textRef.current = e.target.value;
        setText(e.target.value);
        onDirty();
      }}
    />
  );
}
