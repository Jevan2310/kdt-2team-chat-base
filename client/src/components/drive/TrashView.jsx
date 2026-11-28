import { useEffect, useState } from 'react';
import { driveApi, fileIcon, formatDate } from '../../lib/drive.js';

// 휴지통 (가운데 칸의 탭 하나로 열림): 복원(편집 권한) · 영구 삭제(관리 권한, 확인 창은 부른 쪽)
export default function TrashView({ token, reloadKey, onRestore, onPurge }) {
  const [data, setData] = useState(null); // { key, folders, files } — key 로 "이번 불러오기" 결과인지 구분
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    driveApi
      .trash(token)
      .then((d) => {
        if (cancelled) return;
        setData({ key: reloadKey, ...d });
        setError(null);
      })
      .catch((err) => !cancelled && setError({ key: reloadKey, message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const rows = data ? [...data.folders.map((f) => ({ ...f, kind: 'folder' })), ...data.files.map((f) => ({ ...f, kind: 'file' }))] : [];

  return (
    <div className="trash-view">
      <header className="trash-header">
        <strong>🗑️ 휴지통</strong>
        <span className="muted">내가 편집할 수 있는 곳에서 지운 것만 보여요</span>
      </header>
      {error && <p className="form-error drive-error">{error.message}</p>}
      {!error && !data && <p className="muted drive-loading">불러오는 중…</p>}
      {data && (
        <div className="drive-table-wrap">
          <table className="drive-table">
            <thead>
              <tr><th>이름</th><th className="hide-sm">원래 위치</th><th className="hide-sm">지운 사람</th><th>지운 날짜</th><th aria-label="동작" /></tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={`${item.kind}-${item.id}`}>
                  <td className="name-cell">{item.kind === 'folder' ? '📁' : fileIcon(item.name)} {item.name}</td>
                  <td className="hide-sm muted">{item.from}</td>
                  <td className="hide-sm">{item.deletedBy ?? '—'}</td>
                  <td>{formatDate(item.deletedAt)}</td>
                  <td className="row-actions">
                    <button type="button" onClick={() => onRestore(item)}>복원</button>
                    {item.canPurge && <button type="button" className="danger" onClick={() => onPurge(item)}>영구 삭제</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="drive-empty muted">휴지통이 비어 있어요.</p>}
        </div>
      )}
    </div>
  );
}
