import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { downloadFile, fileIcon, formatDate, formatSize } from '../lib/drive.js';
import { editorFor } from './registry.js';
import './editors.css';

// [편집기 시험판 A] 탭 하나의 내용: 파일 보기·편집·저장
// 편집기 공통 약속 (props): blob(원래 내용), file, readOnly, saverRef, onDirty
//   - 고치면 onDirty() 를 부른다
//   - saverRef.current = async () => Blob  (지금 내용을 원래 형식의 파일로 만들어 돌려줌)
// focused: 지금 보고 있는 칸의 보이는 탭일 때만 true → Ctrl+S 는 이 탭만 저장
export default function FileViewer(props) {
  const editor = editorFor(props.file.name);
  return editor ? <EditorHost {...props} editor={editor} /> : <NoPreview file={props.file} token={props.token} />;
}

const fileMeta = (file) => [formatSize(file.size), formatDate(file.updatedAt), file.uploadedBy?.nickname].filter(Boolean).join(' · ');

function EditorHost({ file, editor, canEdit, token, focused, onDirtyChange }) {
  const [blob, setBlob] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadKey, setLoadKey] = useState(0); // 바꾸면 내용을 다시 받아 편집기를 새로 그림
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [known, setKnown] = useState(file.updatedAt); // 내가 본(또는 내가 저장한) 마지막 수정 시각
  const saverRef = useRef(null);
  const baseRef = useRef(null); // 연 내용의 판 (서버가 X-File-Version 으로 알려 줌) → 그사이 누가 저장했으면 서버가 409
  const dirtyCbRef = useRef(onDirtyChange);
  const readOnly = !editor.canSave || !canEdit;
  const changedOutside = file.updatedAt > known; // 다른 사람이 저장함 (목록을 다시 받아 알게 됨)

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
  }, [file.id, token, loadKey]);

  // "저장 안 됨" 상태를 탭(● 표시)에 알림. 탭이 닫히면 false
  useEffect(() => {
    dirtyCbRef.current = onDirtyChange;
  });
  useEffect(() => {
    dirtyCbRef.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => dirtyCbRef.current?.(false), []);

  const onDirty = useCallback(() => {
    setDirty(true);
    setStatus('');
  }, []);

  const reload = () => {
    setBlob(null);
    setLoadError('');
    setDirty(false);
    setStatus('');
    setKnown(file.updatedAt);
    setLoadKey((k) => k + 1);
  };

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
      setKnown(data.file.updatedAt);
      setDirty(false);
      setStatus('저장했어요 ✓');
    } catch (err) {
      console.error('[editor save]', err);
      setStatus(err.message);
    } finally {
      setSaving(false);
    }
  }, [readOnly, saving, file.id, file.name, token]);

  // Ctrl+S / ⌘S: 지금 보고 있는 탭만 저장. 저장 안 한 채로 브라우저 탭을 닫으면 한 번 묻게
  useEffect(() => {
    const onKey = (e) => {
      if (focused && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
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
  }, [save, dirty, focused]);

  const why = !editor.canSave ? '이 형식은 아직 보기만 돼요' : !canEdit ? '편집 권한이 없어 보기만 돼요' : '';
  const Editor = editor.Component;

  return (
    <div className="file-viewer">
      <header className="viewer-header">
        <span className="viewer-badge">{editor.label}</span>
        {why && <span className="viewer-badge muted-badge">{why}</span>}
        <span className="viewer-meta hide-sm">{fileMeta(file)}</span>
        <span className="viewer-status" role="status">{dirty && !status ? '저장 안 됨 •' : status}</span>
        <div className="viewer-actions">
          {!readOnly && (
            <button type="button" className="primary" onClick={save} disabled={saving || !dirty || !blob} title="저장 (Ctrl+S)">
              저장
            </button>
          )}
          <button type="button" onClick={() => downloadFile(file, token).catch((err) => setStatus(err.message))} title="내려받기">⬇</button>
        </div>
      </header>
      {changedOutside && (
        <p className="viewer-banner" role="status">
          다른 사람이 이 파일을 저장했어요.{dirty ? ' 지금 고친 내용과 겹칠 수 있어요.' : ''}{' '}
          <button type="button" className="link-button" onClick={reload}>새 내용 불러오기</button>
          {dirty && <span className="muted"> (고친 내용은 사라져요)</span>}
        </p>
      )}

      <div className="viewer-body">
        {loadError && <p className="form-error viewer-message">{loadError}</p>}
        {!loadError && !blob && <p className="muted viewer-message">여는 중…</p>}
        {!loadError && blob && (
          <EditorBoundary key={loadKey}>
            <Suspense fallback={<p className="muted viewer-message">편집기를 불러오는 중…</p>}>
              <Editor blob={blob} file={file} readOnly={readOnly} saverRef={saverRef} onDirty={onDirty} />
            </Suspense>
          </EditorBoundary>
        )}
      </div>
    </div>
  );
}

// 미리보기가 없는 종류 (zip·hwp·동영상 …): 정보 + 내려받기
function NoPreview({ file, token }) {
  const [error, setError] = useState('');
  return (
    <div className="file-viewer">
      <div className="no-preview">
        <div className="no-preview-icon" aria-hidden="true">{fileIcon(file.name)}</div>
        <strong>{file.name}</strong>
        <p className="muted">{fileMeta(file)}</p>
        <p className="muted">이 형식은 미리보기가 없어요.</p>
        <button type="button" className="primary-button" onClick={() => downloadFile(file, token).catch((err) => setError(err.message))}>⬇ 내려받기</button>
        {error && <p className="form-error">{error}</p>}
      </div>
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
