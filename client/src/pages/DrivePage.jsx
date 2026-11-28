import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { socket } from '../lib/socket.js';
import { driveApi, downloadFile, fileIcon, formatDate, formatSize, rankOf, uploadToFolder } from '../lib/drive.js';
import FolderTree from '../components/drive/FolderTree.jsx';
import NameDialog from '../components/drive/NameDialog.jsx';
import MoveDialog from '../components/drive/MoveDialog.jsx';
import ContextMenu from '../components/common/ContextMenu.jsx';
import Dialog from '../components/common/Dialog.jsx';
import PermissionDialog from '../components/drive/PermissionDialog.jsx';

// 공유 드라이브: /drive (맨 위) · /drive/:folderId (폴더) · /drive/trash (휴지통)
// 9단계: 로그인한 사람 모두 같은 폴더를 본다. 폴더별 권한은 10단계.
export default function DrivePage({ trash = false }) {
  const { folderId: param } = useParams();
  // 5. /drive/abc 처럼 숫자가 아닌 주소는 "잘못된 주소"로 (서버에 묻지 않음)
  const invalid = !trash && param !== undefined && !/^[1-9]\d*$/.test(param);
  const folderId = trash || !param || invalid ? null : Number(param);
  const viewKey = trash ? 'trash' : invalid ? 'invalid' : String(folderId ?? 'root'); // 지금 보려는 화면
  const { token } = useAuth();
  const navigate = useNavigate();

  const [tree, setTree] = useState([]); // 내가 볼 수 있는 폴더 [{ id, parentId, name, locked, level }]
  const [canCreateRoot, setCanCreateRoot] = useState(false); // 관리자만
  // 받아 온 내용·오류에 "어느 화면 것인지(key)"를 붙여 둔다 → 다른 폴더로 옮기면 예전 내용 대신 "불러오는 중"
  const [contents, setContents] = useState(null); // { key, folder, path, folders, files } 또는 휴지통 { key, folders, files }
  const [error, setError] = useState(null); // { key, message }
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
    driveApi
      .tree(token)
      .then((d) => {
        setTree(d.folders);
        setCanCreateRoot(d.canCreateRoot);
      })
      .catch((err) => setNotice(`폴더 목록을 불러오지 못했어요. (${err.message})`));
  }, [token, reloadKey]);

  // 가운데 내용 (폴더 또는 휴지통)
  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    const at = Date.now(); // 더 나중에 온 결과(내용 또는 오류)가 이기게
    (trash ? driveApi.trash(token) : driveApi.contents(folderId, token))
      .then((d) => !cancelled && setContents({ key: viewKey, at, ...d }))
      .catch((err) => !cancelled && setError({ key: viewKey, at, message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token, folderId, trash, invalid, viewKey, reloadKey]);

  // 이 화면 것만 쓴다 (같은 화면을 다시 불러오는 동안에는 지금 내용을 그대로 보여 줌)
  // (보던 폴더를 누가 지워서 다시 불러오기가 404 면, 예전 내용 대신 오류를 보여 준다)
  const errorIsNewer = error?.key === viewKey && (!contents || contents.key !== viewKey || error.at >= contents.at);
  const current = contents?.key === viewKey && !errorIsNewer ? contents : null;
  const currentError = invalid ? '잘못된 주소예요.' : errorIsNewer ? error.message : '';

  // 4. 파일을 "끌어다 놓을 곳"이 아닌 데(트리·채팅 창 등)에 놓으면 브라우저가 파일을 열어 앱을 벗어나는 것 막기
  useEffect(() => {
    const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const onDragOver = (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (!e.target.closest?.('.drive-main')) e.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (e) => isFileDrag(e) && e.preventDefault();
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

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
    if (upload) {
      setNotice('지금 올리는 중이에요. 끝난 뒤 다시 놓아 주세요.'); // 4. 두 번 겹쳐 올리면 진행률이 섞임
      return;
    }
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
  // 4. 파일을 끌 때만 세고(글자·링크를 끌 때는 무시), 0 아래로 내려가지 않게
  // 내 등급에 따라 보이는 버튼이 다르다 (서버도 똑같이 확인하므로 화면은 안내용)
  const myRank = rankOf(current?.myLevel);
  const canUpload = !trash && !invalid && folderId !== null && myRank >= 2;
  const itemRank = (item) => rankOf(item.kind === 'folder' ? item.level : current?.myLevel);
  const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const dragProps = canUpload
    ? {
        onDragEnter: (e) => {
          if (!isFileDrag(e)) return;
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (e) => isFileDrag(e) && e.preventDefault(),
        onDragLeave: (e) => {
          if (!isFileDrag(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          startUpload(e.dataTransfer.files);
        },
      }
    : {};

  const path = current?.path ?? [];
  const treePath = contents?.path ?? []; // 트리는 불러오는 동안에도 펼친 상태 유지
  const rows = current
    ? [
        ...current.folders.map((f) => ({ ...f, kind: 'folder' })),
        ...current.files.map((f) => ({ ...f, kind: 'file' })),
      ]
    : [];

  return (
    <div className="drive-layout">
      <aside className="drive-sidebar">
        <Link to="/drive" className={`tree-root ${!trash && folderId === null ? 'active' : ''}`}>🏠 드라이브</Link>
        <FolderTree
          folders={tree}
          currentId={folderId}
          openIds={treePath.map((p) => p.id)}
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
          {!trash && !invalid && (
            <div className="drive-actions">
              {/* 휴대폰은 왼쪽 트리(휴지통 링크 포함)가 숨겨지므로 여기에도 휴지통 */}
              <Link to="/drive/trash" className="only-sm drive-trash-button" aria-label="휴지통">🗑️</Link>
              {current?.canCreateHere && <button type="button" onClick={() => setDialog({ type: 'newFolder' })}>＋ 폴더</button>}
              {folderId !== null && myRank >= 3 && (
                <button type="button" onClick={() => setDialog({ type: 'permissions', folderId })} title="이 폴더 권한 설정">🔐 권한</button>
              )}
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
        {currentError && <p className="form-error drive-error">{currentError} <Link to="/drive">드라이브 맨 위로</Link></p>}
        {!currentError && !current && <p className="muted drive-loading">불러오는 중…</p>}

        {!currentError && current && (
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
                        {item.canPurge && (
                          <button type="button" className="danger" onClick={() => setDialog({ type: 'purge', item })}>영구 삭제</button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={`${item.kind}-${item.id}`} onContextMenu={(e) => openMenu(e, item)}>
                      <td className="name-cell">
                        {item.kind === 'folder' ? (
                          <Link to={`/drive/${item.id}`}>
                            📁 {item.name}
                            {item.locked && <span title="위 폴더 권한을 이어받지 않는 폴더"> 🔒</span>}
                          </Link>
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
                {trash
                  ? '휴지통이 비어 있어요. (내가 편집할 수 있는 곳에서 지운 것만 보여요)'
                  : canUpload
                    ? '비어 있어요. 파일을 여기로 끌어다 놓거나 ⬆ 올리기를 누르세요.'
                    : current?.canCreateHere
                      ? '폴더가 없어요. ＋ 폴더로 만들어 보세요.'
                      : folderId === null
                        ? '볼 수 있는 폴더가 없어요. 관리자에게 권한을 요청하세요.'
                        : '비어 있어요.'}
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
          {itemRank(menu.item) >= 2 && (
            <>
              <button type="button" role="menuitem" onClick={menuAction(() => setDialog({ type: 'rename', item: menu.item }))}>✏️ 이름 바꾸기</button>
              <button type="button" role="menuitem" onClick={menuAction(() => setDialog({ type: 'move', item: menu.item }))}>📦 옮기기</button>
            </>
          )}
          {menu.item.kind === 'folder' && itemRank(menu.item) >= 3 && (
            <button type="button" role="menuitem" onClick={menuAction(() => setDialog({ type: 'permissions', folderId: menu.item.id }))}>🔐 권한 설정</button>
          )}
          {itemRank(menu.item) >= 2 && (
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
          )}
        </ContextMenu>
      )}

      {dialog?.type === 'newFolder' && (
        <NameDialog
          title={folderId === null ? '새 폴더 (맨 위)' : '새 폴더'}
          maxLength={100}
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
          maxLength={dialog.item.kind === 'folder' ? 100 : 255}
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
          canRoot={canCreateRoot}
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
      {dialog?.type === 'permissions' && (
        <PermissionDialog
          folderId={dialog.folderId}
          token={token}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            setNotice('권한을 저장했어요.');
            reload();
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
