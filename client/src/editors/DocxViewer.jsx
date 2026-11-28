import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

// 워드(docx): 보기만 (docx-preview, Apache-2.0). 브라우저에서 바로 그림
export default function DocxViewer({ blob }) {
  const boxRef = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const box = boxRef.current;
    let cancelled = false;
    renderAsync(blob, box, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true, experimental: false }).catch(
      (err) => !cancelled && setError(`이 문서를 그리지 못했어요. (${err.message})`),
    );
    return () => {
      cancelled = true;
      box.replaceChildren();
    };
  }, [blob]);
  return (
    <div className="doc-viewer">
      {error && <p className="form-error viewer-message">{error}</p>}
      <div ref={boxRef} />
    </div>
  );
}
