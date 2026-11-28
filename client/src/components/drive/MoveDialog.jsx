import { useMemo, useState } from 'react';
import Dialog from '../common/Dialog.jsx';
import { groupByParent } from '../../lib/drive.js';

// 옮길 위치 고르기. 폴더는 자기 자신·자기 아래로는 못 옮기고, 파일은 맨 위에 둘 수 없다(폴더 안에만)
export default function MoveDialog({ item, folders, onSubmit, onClose }) {
  const children = useMemo(() => groupByParent(folders), [folders]);
  const currentParent = item.kind === 'folder' ? (item.parentId ?? null) : item.folderId;
  const [target, setTarget] = useState(currentParent);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 폴더를 옮길 때 자기 자신과 그 아래는 고를 수 없음
  const blocked = useMemo(() => {
    if (item.kind !== 'folder') return new Set();
    const ids = new Set([item.id]);
    const walk = (id) => (children.get(id) ?? []).forEach((c) => (ids.add(c.id), walk(c.id)));
    walk(item.id);
    return ids;
  }, [item, children]);

  const option = (id, label, depth, disabled) => (
    <button
      type="button"
      key={id ?? 'root'}
      className={`move-option ${target === id ? 'selected' : ''}`}
      style={{ paddingLeft: 10 + depth * 16 }}
      disabled={disabled}
      onClick={() => setTarget(id)}
    >
      {label}
      {id === currentParent && <small> (지금 위치)</small>}
    </button>
  );

  const renderLevel = (parentId, depth) =>
    (children.get(parentId) ?? []).flatMap((f) => [
      option(f.id, `📁 ${f.name}`, depth, blocked.has(f.id)),
      ...(blocked.has(f.id) ? [] : renderLevel(f.id, depth + 1)),
    ]);

  const submit = async () => {
    setBusy(true);
    const message = await onSubmit(target);
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <Dialog title={`"${item.name}" 옮기기`} onClose={onClose}>
      <div className="move-list">
        {item.kind === 'folder' && option(null, '🏠 드라이브 맨 위', 0, false)}
        {renderLevel(null, item.kind === 'folder' ? 1 : 0)}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-buttons">
        <button type="button" onClick={onClose}>취소</button>
        <button type="button" className="primary" onClick={submit} disabled={busy || target === currentParent || target === undefined}>
          여기로 옮기기
        </button>
      </div>
    </Dialog>
  );
}
