import { useEffect, useRef, useState } from 'react';
import { init } from 'pptx-preview';

// PPT(pptx): 보기만 (pptx-preview — npm 패키지는 상업 사용 무료, 소스는 비공개)
export default function PptxViewer({ blob }) {
  const boxRef = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const box = boxRef.current;
    let cancelled = false;
    const width = Math.min(960, box.clientWidth - 32 || 960);
    const previewer = init(box, { width, height: Math.round((width * 9) / 16) });
    blob
      .arrayBuffer()
      .then((buf) => previewer.preview(buf))
      .catch((err) => !cancelled && setError(`이 발표 자료를 그리지 못했어요. (${err?.message ?? err})`));
    return () => {
      cancelled = true;
      box.replaceChildren();
    };
  }, [blob]);
  return (
    <div className="doc-viewer">
      {error && <p className="form-error viewer-message">{error}</p>}
      <div ref={boxRef} className="pptx-box" />
    </div>
  );
}
