import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { socket } from '../lib/socket.js';
import { driveApi, downloadFile, fileIcon, formatDate, formatSize, uploadToFolder } from '../lib/drive.js';
import FolderTree from '../components/drive/FolderTree.jsx';
import NameDialog from '../components/drive/NameDialog.jsx';
import MoveDialog from '../components/drive/MoveDialog.jsx';
import ContextMenu from '../components/common/ContextMenu.jsx';
import Dialog from '../components/common/Dialog.jsx';

// 공유 드라이브: /drive (맨 위) · /drive/:folderId (폴더) · /drive/trash (휴지통)
// 9단계: 로그인한 사람 모두 같은 폴더를 본다. 폴더별 권한은 10단계.
export default function DrivePage({ trash = false }) {
  const { folderId: param } = useParams();
  const folderId = trash || !param ? null : Number(param);
  const { token } = useAuth();
  const navigate = useNavigate();

  const [tree, setTree] = useState([]);
  const [contents, setContents] = useState(null); // { folder, path, folders, files } 또는 휴지통 { folders, files }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0); // 바꾸면 다시 불러옴
  const [menu, setMenu] = useState(null); // { anchor, item }
  const [dialog, setDialog] = useState(null); // { type: 'newFolder' | 'rename' | 'move' | 'purge', item }
  const [upload, setUpload] = useState(null); // { count, progress }
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // 왼쪽 트리
  useEffect(() => {
    driveApi.tree(token).then((d) => setTree(d.folders)).catch(() => {});
  }, [token, reloadKey]);

  // 가운데 내용 (폴더 또는 휴지통)
  useEffect(() => {
    let cancelled = false;
    (trash ? driveApi.trash(token) : driveApi.contents(folderId, token))
      .then((d) => {
        if (cancelled) return;
        setContents(d);
        setError('');
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token, folderId, trash, reloadKey]);

  // 누가 드라이브를 바꾸면(올리기·이름 바꾸기·삭제 …) 다시 불러온다
  useEffect(() => {
    socket.on('drive:changed', reload);
    return () => socket.off('drive:changed', reload);
  }, [reload]);

  // 요청 하나 실행 → 실패하면 안내 문구, 성공하면 다시 불러오기. 창에서 쓰면 오류 문구를 돌려준다
  const run = async (request, doneText = '') => {
    try {
      await request();
      setNotice(doneText);
      reload();
      return null;
    } catch (err) {
      return err.message;
    }
  };
  const runAndShow = async (request, doneText) => {
    const message = await run(request, doneText);
    if (message) setNotice(message);
  };

  const startUpload = async (fileList) => {
    const files = [...fileList];
    if (!files.length || folderId === null) return;
    setUpload({ count: files.length, progress: 0 });
    try {
      const result = await uploadToFolder(folderId, files, token, (progress) => setUpload({ count: files.length, progress }));
      setNotice(`${result.files.length}개 올렸어요.`);
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setUpload(null);
    }
  };

  const download = (file) => downloadFile(file, token).catch((err) => setNotice(err.message));

  // 메뉴 열기: 우클릭은 그 자리, ⋯ 버튼은 버튼 아래
  const openMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'contextmenu' && (e.clientX || e.clientY)) {
      setMenu({ item, anchor: { x: e.clientX, y: e.clientY } });
    } else {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ item, anchor: { x: r.right, y: r.bottom + 4, aboveY: r.top - 4, alignRight: true } });
    }
  };
  const menuAction = (fn) => () => {
    setMenu(null);
    fn();
  };

  // ── 드래그해서 올리기 (폴더 안에서만) ──
  const canUpload = !trash && folderId !== null;
  const dragProps = canUpload
    ? {
        onDragEnter: (e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (e) => e.preventDefault(),
        onDragLeave: () => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        },
        onDrop: (e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          startUpload(e.dataTransfer.files);
        },
      }
    : {};

  const path = contents?.path ?? [];
  const rows = contents
    ? [
        ...contents.folders.map((f) => ({ ...f, kind: 'folder' })),
        ...contents.files.map((f) => ({ ...f, kind: 'file' })),
      ]
    : [];

  return (
    <div className="drive-layout">
      <aside className="drive-sidebar">
        <Link to="/drive" className={`tree-root ${!trash && folderId === null ? 'active' : ''}`}>🏠 드라이브</Link>
        <FolderTree
          folders={tree}
          currentId={folderId}
          openIds={path.map((p) => p.id)}
          onFolderMenu={(e, f) => openMenu(e, { ...f, kind: 'folder' })}
        />
        <Link to="/drive/trash" className={`tree-root trash-link ${trash ? 'active' : ''}`}>🗑️ 휴지통</Link>
      </aside>

      <section className="drive-main" {...dragProps}>
        <header className="drive-header">
          <nav className="breadcrumb" aria-label="현재 위치">
            {trash ? (
              <>
                <Link to="/drive">드라이브</Link>
                <span className="crumb-sep">›</span>
                <span>🗑️ 휴지통</span>
              </>
            ) : (
              <>
                <Link to="/drive">드라이브</Link>
                {path.map((p) => (
                  <span key={p.id}>
                    <span className="crumb-sep">›</span>
                    <Link to={`/drive/${p.id}`}>{p.name}</Link>
                  </span>
                ))}
              </>
            )}
          </nav>
          {!trash && (
            <div className="drive-actions">
              {/* 휴대폰은 왼쪽 트리(휴지통 링크 포함)가 숨겨지므로 여기에도 휴지통 */}
              <Link to="/drive/trash" className="only-sm drive-trash-button" aria-label="휴지통">🗑️</Link>
              <button type="button" onClick={() => setDialog({ type: 'newFolder' })}>＋ 폴더</button>
              {canUpload && (
                <button type="button" className="primary" onClick={() => fileInputRef.current?.click()} disabled={Boolean(upload)}>
                  ⬆ 올리기
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  startUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </header>

        {upload && (
          <div className="upload-bar" role="status">
            <span>{upload.count}개 올리는 중… {Math.round(upload.progress * 100)}%</span>
            <div className="upload-track">
              <div className="upload-fill" style={{ width: `${upload.progress * 100}%` }} />
            </div>
          </div>
        )}
        {notice && (
          <p className="drive-notice" role="status">
            {notice} <button type="button" className="link-button" onClick={() => setNotice('')}>닫기</button>
          </p>
        )}
        {error && <p className="form-error drive-error">{error} <Link to="/drive">드라이브 맨 위로</Link></p>}

        {!error && contents && (
          <div className="drive-table-wrap">
            <table className="drive-table">
              <thead>
                {trash ? (
                  <tr><th>이름</th><th className="hide-sm">원래 위치</th><th className="hide-sm">지운 사람</th><th>지운 날짜</th><th aria-label="동작" /></tr>
                ) : (
                  <tr><th>이름</th><th className="hide-sm">올린 사람</th><th>수정일</th><th className="hide-sm">크기</th><th aria-label="메뉴" /></tr>
                )}
              </thead>
              <tbody>
                {rows.map((item) =>
                  trash ? (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td className="name-cell">{item.kind === 'folder' ? '📁' : fileIcon(item.name)} {item.name}</td>
                      <td className="hide-sm muted">{item.from}</td>
                      <td className="hide-sm">{item.deletedBy ?? '—'}</td>
                      <td>{formatDate(item.deletedAt)}</td>
                      <td className="row-actions">
                        <button type="button" onClick={() => runAndShow(() => driveApi.restore(`${item.kind}s`, item.id, token), `"${item.name}"을(를) 복원했어요.`)}>복원</button>
                        <button type="button" className="danger" onClick={() => setDialog({ type: 'purge', item })}>영구 삭제</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`${item.kind}-${item.id}`} onContextMenu={(e) => openMenu(e, item)}>
                      <td className="name-cell">
                        {item.kind === 'folder' ? (
                          <Link to={`/drive/${item.id}`}>📁 {item.name}</Link>
                        ) : (
                          <button type="button" className="file-name" onClick={() => download(item)} title="눌러서 내려받기">
                            {fileIcon(item.name)} {item.name}
                          </button>
                        )}
                      </td>
                      <td className="hide-sm">{item.uploadedBy?.nickname ?? '—'}</td>
                      <td>{formatDate(item.updatedAt)}</td>
                      <td className="hide-sm">{item.kind === 'file' ? formatSize(item.size) : '—'}</td>
                      <td className="row-actions">
                        <button type="button" className="more" aria-label={`${item.name} 메뉴`} onClick={(e) => openMenu(e, item)}>⋯</button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="drive-empty muted">
                {trash ? '휴지통이 비어 있어요.' : canUpload ? '비어 있어요. 파일을 여기로 끌어다 놓거나 ⬆ 올리기를 누르세요.' : '폴더가 없어요. ＋ 폴더로 만들어 보세요.'}
              </p>
            )}
          </div>
        )}

        {dragging && <div className="drop-overlay">여기에 놓으면 이 폴더에 올려요</div>}
      </section>

      {menu && (
        <ContextMenu anchor={menu.anchor} onClose={closeMenu} label={`${menu.item.name} 메뉴`}>
          {menu.item.kind === 'folder' ? (
            <button type="button" role="menuitem" onClick={menuAction(() => navigate(`/drive/${menu.item.id}`))}>📂 열기</button>
          ) : (
            <button type="button" role="menuitem" onClick={menuAction(() => download(menu.item))}>⬇️ 내려받기</button>
          )}
          <button type="button" role="menuitem" onClick={menuAction(() => setDialog({ type: 'rename', item: menu.item }))}>✏️ 이름 바꾸기</button>
          <button type="button" role="menuitem" onClick={menuAction(() => setDialog({ type: 'move', item: menu.item }))}>📦 옮기기</button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={menuAction(() =>
              runAndShow(
                () => (menu.item.kind === 'folder' ? driveApi.trashFolder(menu.item.id, token) : driveApi.trashFile(menu.item.id, token)),
                `"${menu.item.name}"을(를) 휴지통으로 옮겼어요.`,
              ),
            )}
          >
            🗑️ 휴지통으로
          </button>
        </ContextMenu>
      )}

      {dialog?.type === 'newFolder' && (
        <NameDialog
          title={folderId === null ? '새 폴더 (맨 위)' : '새 폴더'}
          submitLabel="만들기"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const message = await run(() => driveApi.createFolder(folderId, name, token));
            if (!message) setDialog(null);
            return message;
          }}
        />
      )}
      {dialog?.type === 'rename' && (
        <NameDialog
          title="이름 바꾸기"
          initial={dialog.item.name}
          submitLabel="바꾸기"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const { item } = dialog;
            const message = await run(() =>
              item.kind === 'folder' ? driveApi.updateFolder(item.id, { name }, token) : driveApi.updateFile(item.id, { name }, token),
            );
            if (!message) setDialog(null);
            return message;
          }}
        />
      )}
      {dialog?.type === 'move' && (
        <MoveDialog
          item={dialog.item}
          folders={tree}
          onClose={() => setDialog(null)}
          onSubmit={async (target) => {
            const { item } = dialog;
            const message = await run(
              () =>
                item.kind === 'folder'
                  ? driveApi.updateFolder(item.id, { parentId: target }, token)
                  : driveApi.updateFile(item.id, { folderId: target }, token),
              `"${item.name}"을(를) 옮겼어요.`,
            );
            if (!message) setDialog(null);
            return message;
          }}
        />
      )}
      {dialog?.type === 'purge' && (
        <Dialog title="영구 삭제" onClose={() => setDialog(null)}>
          <p>
            <strong>{dialog.item.name}</strong>
            {dialog.item.kind === 'folder' ? ' 폴더와 그 안의 모든 폴더·파일' : ''}을(를) 영구 삭제할까요?
            <br />
            <span className="form-error">되돌릴 수 없어요.</span>
          </p>
          <div className="dialog-buttons">
            <button type="button" onClick={() => setDialog(null)}>취소</button>
            <button
              type="button"
              className="danger-fill"
              onClick={async () => {
                const { item } = dialog;
                setDialog(null);
                await runAndShow(() => driveApi.purge(`${item.kind}s`, item.id, token), `"${item.name}"을(를) 영구 삭제했어요.`);
              }}
            >
              영구 삭제
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
