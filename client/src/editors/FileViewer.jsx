import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { downloadFile } from '../lib/drive.js';
import Dialog from '../components/common/Dialog.jsx';
import { editorFor } from './registry.js';
import './editors.css';

// [편집기 시험판 A] 드라이브 가운데 큰 화면: 파일 보기·편집·저장
// 편집기 공통 약속 (props): blob(원래 내용), file, readOnly, saverRef, onDirty
//   - 고치면 onDirty() 를 부른다
//   - saverRef.current = async () => Blob  (지금 내용을 원래 형식의 파일로 만들어 돌려줌)
export default function FileViewer({ file, canEdit, token, onClose }) {
  const editor = editorFor(file.name);
  const [blob, setBlob] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const saverRef = useRef(null);
  const baseRef = useRef(null); // 연 내용의 판 (서버가 X-File-Version 으로 알려 줌) → 그사이 누가 저장했으면 서버가 409
  const readOnly = !editor?.canSave || !canEdit;

  // 내용 받기: 60초짜리 서명 주소(S5)를 받아 그 주소에서 내용을 가져온다
  useEffect(() => {
    let cancelled = false;
    api(`/drive/files/${file.id}/link`, { method: 'POST', body: { inline: true }, token })
      .then(({ url }) => fetch(url))
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `파일을 열지 못했어요 (${res.status})`);
        baseRef.current = res.headers.get('X-File-Version');
        return res.blob();
      })
      .then((b) => !cancelled && setBlob(b))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [file.id, token]);

  const onDirty = useCallback(() => {
    setDirty(true);
    setStatus('');
  }, []);

  const save = useCallback(async () => {
    if (readOnly || saving || !saverRef.current) return;
    setSaving(true);
    setStatus('저장하는 중…');
    try {
      const out = await saverRef.current();
      if (!out) throw new Error('저장할 내용을 만들지 못했어요.');
      const form = new FormData();
      form.append('baseVersion', baseRef.current ?? ''); // 글자 칸을 파일보다 먼저 (서버가 순서대로 읽음)
      form.append('file', out, file.name);
      const res = await fetch(`/api/drive/files/${file.id}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? `저장하지 못했어요 (${res.status})`);
      baseRef.current = data.file.version;
      setDirty(false);
      setStatus('저장했어요 ✓');
    } catch (err) {
      console.error('[editor save]', err);
      setStatus(err.message);
    } finally {
      setSaving(false);
    }
  }, [readOnly, saving, file.id, file.name, token]);

  // Ctrl+S / ⌘S 저장, 저장 안 한 채로 탭을 닫으면 브라우저가 한 번 묻게
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    const onLeave = (e) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [save, dirty]);

  const close = () => (dirty ? setConfirmClose(true) : onClose());
  const why = !editor?.canSave ? '이 형식은 아직 보기만 돼요' : !canEdit ? '편집 권한이 없어 보기만 돼요' : '';
  const Editor = editor?.Component;

  return (
    <div className="file-viewer">
      <header className="viewer-header">
        <button type="button" onClick={close} aria-label="목록으로">← 목록</button>
        <strong className="viewer-name" title={file.name}>{file.name}</strong>
        {editor && <span className="viewer-badge">{editor.label}</span>}
        {why && <span className="viewer-badge muted-badge">{why}</span>}
        <span className="viewer-status" role="status">{dirty && !status ? '저장 안 됨 •' : status}</span>
        <div className="viewer-actions">
          {!readOnly && (
            <button type="button" className="primary" onClick={save} disabled={saving || !dirty || !blob} title="저장 (Ctrl+S)">
              저장
            </button>
          )}
          <button type="button" onClick={() => downloadFile(file, token).catch((err) => setStatus(err.message))}>⬇ 내려받기</button>
        </div>
      </header>

      <div className="viewer-body">
        {loadError && <p className="form-error viewer-message">{loadError}</p>}
        {!loadError && !blob && <p className="muted viewer-message">여는 중…</p>}
        {!loadError && blob && Editor && (
          <EditorBoundary>
            <Suspense fallback={<p className="muted viewer-message">편집기를 불러오는 중…</p>}>
              <Editor blob={blob} file={file} readOnly={readOnly} saverRef={saverRef} onDirty={onDirty} />
            </Suspense>
          </EditorBoundary>
        )}
      </div>

      {confirmClose && (
        <Dialog title="저장하지 않은 내용" onClose={() => setConfirmClose(false)}>
          <p>고친 내용을 저장하지 않았어요. 그냥 닫을까요?</p>
          <div className="dialog-buttons">
            <button type="button" onClick={() => setConfirmClose(false)}>계속 편집</button>
            <button type="button" className="danger-fill" onClick={onClose}>저장 안 하고 닫기</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// 편집기 라이브러리가 이 파일을 못 읽고 멈추면 앱 전체가 하얗게 되지 않게 여기서 막는다
class EditorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error('[editor]', error);
  }
  render() {
    if (this.state.error) {
      return <p className="form-error viewer-message">이 파일을 편집기에서 열지 못했어요. ⬇ 내려받기로 받아 주세요. ({String(this.state.error.message ?? this.state.error)})</p>;
    }
    return this.props.children;
  }
}
