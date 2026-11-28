import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import pdfCss from 'pdfjs-dist/web/pdf_viewer.css?inline';

// PDF: Mozilla PDF.js (Apache-2.0) — 보기 + 형광펜·글상자·그리기 주석, 저장하면 주석이 PDF 안에 들어간다
// (원래 글자를 고쳐 쓰는 편집은 아님)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
const { AnnotationEditorType } = pdfjsLib;

// pdf_viewer.mjs 는 globalThis.pdfjsLib 를 읽으므로, 넣어 둔 뒤에 불러온다
let viewerModule;
const loadViewer = () => {
  globalThis.pdfjsLib = pdfjsLib;
  viewerModule ??= import('pdfjs-dist/web/pdf_viewer.mjs');
  return viewerModule;
};

// PDF.js CSS 는 앱과 이름이 겹치는 클래스(.dialog .page .error .sidebar)와 :root 설정이 있어서
// 1) PDF 화면이 열려 있을 때만 넣고 닫으면 빼며 2) 낮은 우선순위 층(@layer)에 넣어 앱 CSS 가 항상 이기게 한다
function usePdfCss() {
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.editor = 'pdfjs';
    style.textContent = `@layer pdfjs {\n${pdfCss}\n}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}

const MODES = [
  { mode: AnnotationEditorType.NONE, label: '🖱️ 선택' },
  { mode: AnnotationEditorType.HIGHLIGHT, label: '🖍️ 형광펜' },
  { mode: AnnotationEditorType.FREETEXT, label: '🔤 글상자' },
  { mode: AnnotationEditorType.INK, label: '✏️ 그리기' },
];

export default function PdfEditor({ blob, readOnly, saverRef, onDirty }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const docRef = useRef(null);
  const [mode, setMode] = useState(AnnotationEditorType.NONE);
  const [pages, setPages] = useState({ now: 1, total: 0 });
  const [error, setError] = useState('');
  usePdfCss();

  useEffect(() => {
    let cancelled = false;
    let task;
    (async () => {
      const { EventBus, PDFLinkService, PDFViewer } = await loadViewer();
      if (cancelled) return;
      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const viewer = new PDFViewer({
        container: containerRef.current,
        eventBus,
        linkService,
        annotationEditorMode: readOnly ? AnnotationEditorType.DISABLE : AnnotationEditorType.NONE,
      });
      linkService.setViewer(viewer);
      viewerRef.current = viewer;
      eventBus.on('pagesinit', () => {
        viewer.currentScaleValue = 'page-width';
      });
      eventBus.on('pagechanging', (e) => setPages((p) => ({ ...p, now: e.pageNumber })));
      task = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      const doc = await task.promise;
      if (cancelled) return doc.destroy();
      docRef.current = doc;
      doc.annotationStorage.onSetModified = () => onDirty();
      viewer.setDocument(doc);
      linkService.setDocument(doc);
      setPages({ now: 1, total: doc.numPages });
    })().catch((err) => !cancelled && setError(`이 PDF 를 열지 못했어요. (${err?.message ?? err})`));
    return () => {
      cancelled = true;
      task?.destroy();
      docRef.current = null;
      viewerRef.current = null;
    };
  }, [blob, readOnly, onDirty]);

  useEffect(() => {
    saverRef.current = async () => {
      const doc = docRef.current;
      if (!doc) return null;
      return new Blob([await doc.saveDocument()], { type: 'application/pdf' });
    };
    return () => {
      saverRef.current = null;
    };
  }, [saverRef]);

  const pickMode = (next) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.annotationEditorMode = { mode: next };
    setMode(next);
  };
  const zoom = (factor) => {
    const viewer = viewerRef.current;
    if (viewer) viewer.currentScale = Math.min(4, Math.max(0.25, viewer.currentScale * factor));
  };

  return (
    <div className="pdf-editor">
      <div className="pdf-toolbar">
        {!readOnly &&
          MODES.map((m) => (
            <button key={m.mode} type="button" className={mode === m.mode ? 'active' : ''} aria-pressed={mode === m.mode} onClick={() => pickMode(m.mode)}>
              {m.label}
            </button>
          ))}
        <span className="pdf-spacer" />
        <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="작게">－</button>
        <button type="button" onClick={() => zoom(1.2)} aria-label="크게">＋</button>
        <span className="muted">{pages.total ? `${pages.now} / ${pages.total}쪽` : ''}</span>
      </div>
      {error && <p className="form-error viewer-message">{error}</p>}
      <div className="pdf-stage">
        <div ref={containerRef} className="pdf-container">
          <div className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}
