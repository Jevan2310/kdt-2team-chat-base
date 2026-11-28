import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { socket } from '../lib/socket.js';
import { driveApi, downloadFile, fileIcon, rankOf, uploadToFolder } from '../lib/drive.js';
import Explorer from '../components/drive/Explorer.jsx';
import TrashView from '../components/drive/TrashView.jsx';
import NameDialog from '../components/drive/NameDialog.jsx';
import MoveDialog from '../components/drive/MoveDialog.jsx';
import ContextMenu from '../components/common/ContextMenu.jsx';
import Dialog from '../components/common/Dialog.jsx';
import PermissionDialog from '../components/drive/PermissionDialog.jsx';
import EditorArea, { DRAG_FILE } from '../editors/EditorArea.jsx';
import FileViewer from '../editors/FileViewer.jsx';
import { TRASH_TAB, fileTab, useEditorLayout } from '../editors/useEditorLayout.js';
import { ALT, MOD, SAVE, SPLIT_DOWN, SPLIT_RIGHT } from '../editors/shortcuts.js';

// 공유 드라이브 (VS Code 처럼): 왼쪽 = 폴더·파일 탐색기, 가운데 = 연 파일 (탭, 나란히 나누기)
// 주소: /drive (맨 위) · /drive/:folderId (고른 폴더) · ?file=ID (그 파일 열기) · /drive/trash (휴지통 탭 열기)
const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 못 해도 화면은 동작
  }
};

export default function DrivePage({ trash = false }) {
  const { folderId: param } = useParams();
  const invalid = !trash && param !== undefined && !/^[1-9]\d*$/.test(param);
  const selectedFolderId = trash || !param || invalid ? null : Number(param);
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? 'anon';

  const [layout, dispatch] = useEditorLayout(`drive.layout.${uid}`);
  const [tree, setTree] = useState(null); // 내가 볼 수 있는 폴더 [{ id, parentId, name, locked, level }] (null = 아직)
  const [canCreateRoot, setCanCreateRoot] = useState(false);
  const [folderData, setFolderData] = useState(() => new Map()); // 폴더 id → { files, myLevel, v } 또는 { error, v }
  const [toggled, setToggled] = useState(() => new Map(readJson(`drive.tree.${uid}`, []))); // 사람이 직접 펼치거나 접은 폴더
  const [sidebarWidth, setSidebarWidth] = useState(() => readJson(`drive.sidebar.${uid}`, 280));
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(null); // { anchor, item }
  const [dialog, setDialog] = useState(null);
  const [upload, setUpload] = useState(null); // { count, progress }
  const [drawer, setDrawer] = useState(false); // 휴대폰: 파일을 연 상태에서 탐색기 열기
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null); // ⬆ 로 고른 파일을 올릴 폴더
  const inflight = useRef(new Set());

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => writeJson(`drive.tree.${uid}`, [...toggled]), [uid, toggled]);
  useEffect(() => writeJson(`drive.sidebar.${uid}`, sidebarWidth), [uid, sidebarWidth]);

  // ── 폴더 나무 ──
  useEffect(() => {
    driveApi
      .tree(token)
      .then((d) => {
        setTree(d.folders);
        setCanCreateRoot(d.canCreateRoot);
      })
      .catch((err) => setNotice(`폴더 목록을 불러오지 못했어요. (${err.message})`));
  }, [token, reloadKey]);

  const folderById = useMemo(() => new Map((tree ?? []).map((f) => [f.id, f])), [tree]);
  const ancestorsOf = useCallback(
    (id) => {
      const ids = [];
      const seen = new Set();
      for (let cur = folderById.get(id); cur && !seen.has(cur.id); cur = folderById.get(cur.parentId)) {
        seen.add(cur.id);
        ids.push(cur.id);
      }
      return ids; // 자기 자신부터 위로
    },
    [folderById],
  );
  const pathName = (folderId) =>
    ancestorsOf(folderId)
      .reverse()
      .map((id) => folderById.get(id)?.name)
      .join(' › ');

  // 펼침: 직접 펼치거나 접은 것이 우선, 아니면 고른 폴더까지의 경로는 펼쳐 둔다
  const revealed = useMemo(() => new Set(selectedFolderId ? ancestorsOf(selectedFolderId) : []), [selectedFolderId, ancestorsOf]);
  const isOpen = useCallback((id) => toggled.get(id) ?? revealed.has(id), [toggled, revealed]);
  const setOpen = useCallback((id, open) => setToggled((prev) => new Map(prev).set(id, open)), []);

  // ── 폴더 안 파일: 펼친 폴더 + 열린 탭의 폴더만 받아 온다 ──
  const tabFolderIds = layout.groups.flatMap((g) => g.tabs.filter((t) => t.kind === 'file').map((t) => t.folderId));
  const neededKey = [...new Set([...(tree ?? []).filter((f) => isOpen(f.id)).map((f) => f.id), ...tabFolderIds])]
    .sort((a, b) => a - b)
    .join(',');
  useEffect(() => {
    const ids = neededKey ? neededKey.split(',').map(Number) : [];
    for (const id of ids) {
      const have = folderData.get(id);
      const tag = `${id}:${reloadKey}`;
      if ((have && have.v >= reloadKey) || inflight.current.has(tag)) continue;
      inflight.current.add(tag);
      const put = (value) => setFolderData((m) => ((m.get(id)?.v ?? -1) > reloadKey ? m : new Map(m).set(id, { ...value, v: reloadKey })));
      driveApi
        .contents(id, token)
        .then((r) => put({ files: r.files, myLevel: r.myLevel }))
        .catch((err) => put({ error: err.status === 404 ? '볼 수 없는 폴더예요.' : err.message }))
        .finally(() => inflight.current.delete(tag));
    }
  }, [neededKey, reloadKey, token, folderData]);

  // 누가 드라이브를 바꾸면(올리기·이름 바꾸기·저장 …) 다시 불러온다
  useEffect(() => {
    socket.on('drive:changed', reload);
    return () => socket.off('drive:changed', reload);
  }, [reload]);

  // 파일을 끌어다 놓을 곳(폴더 줄)이 아닌 데에 놓으면 브라우저가 파일을 열어 앱을 벗어나는 것 막기
  // (폴더 줄은 자기가 먼저 처리하고 위로 올려 보내지 않음)
  useEffect(() => {
    const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const onDragOver = (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (e) => isFileDrag(e) && e.preventDefault();
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // /drive/trash 로 오면 휴지통 탭을 열고 주소는 /drive 로
  useEffect(() => {
    if (!trash) return;
    dispatch({ type: 'open', tab: TRASH_TAB });
    navigate('/drive', { replace: true });
  }, [trash, dispatch, navigate]);

  // ?file=ID → 고른 폴더에서 그 파일을 찾아 연다 (채팅의 파일 카드 등에서 오는 주소)
  const wantFile = Number(searchParams.get('file')) || null;
  const selectedData = selectedFolderId ? folderData.get(selectedFolderId) : null;
  useEffect(() => {
    if (!wantFile || !selectedData) return;
    const file = selectedData.files?.find((f) => f.id === wantFile);
    if (file) dispatch({ type: 'open', tab: fileTab(file) });
    setSearchParams({}, { replace: true });
  }, [wantFile, selectedData, dispatch, setSearchParams]);

  // ── 요청 도우미 ──
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

  const folderRank = (id) => rankOf(folderById.get(id)?.level);
  const canUploadTo = (id) => id !== null && folderRank(id) >= 2;

  const startUpload = async (folderId, fileList) => {
    const files = [...fileList];
    if (!files.length || !canUploadTo(folderId)) return;
    if (upload) {
      setNotice('지금 올리는 중이에요. 끝난 뒤 다시 해 주세요.');
      return;
    }
    setUpload({ count: files.length, progress: 0 });
    try {
      const result = await uploadToFolder(folderId, files, token, (progress) => setUpload({ count: files.length, progress }));
      setNotice(`${folderById.get(folderId)?.name ?? '폴더'}에 ${result.files.length}개 올렸어요.`);
      setOpen(folderId, true);
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setUpload(null);
    }
  };
  const pickUpload = (folderId) => {
    setUploadTarget(folderId);
    fileInputRef.current?.click();
  };

  const download = (file) => downloadFile(file, token).catch((err) => setNotice(err.message));

  const openFile = (file, { toSide = false } = {}) => {
    const tab = fileTab(file);
    const wide = window.matchMedia('(min-width: 768px)').matches; // 휴대폰은 칸 하나만
    dispatch(toSide && wide ? { type: 'openToSide', tab } : { type: 'open', tab });
    if (file.folderId !== selectedFolderId) navigate(`/drive/${file.folderId}`, { replace: true });
    setDrawer(false);
  };
  const openTrash = () => {
    dispatch({ type: 'open', tab: TRASH_TAB });
    setDrawer(false);
  };

  // 지금 보고 있는 파일 (트리에서 강조)
  const activeGroup = layout.groups.find((g) => g.id === layout.activeGroup);
  const activeTab = activeGroup?.tabs.find((t) => t.key === activeGroup.active);
  const activeFileId = activeTab?.kind === 'file' ? activeTab.fileId : null;
  const hasTabs = layout.groups.some((g) => g.tabs.length);

  // ── 메뉴 ──
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
  const itemRank = (item) => folderRank(item.kind === 'folder' ? item.id : item.folderId);

  // 폴더를 휴지통으로 → 그 아래 파일 탭은 닫는다
  const trashFolder = async (folder) => {
    const message = await run(() => driveApi.trashFolder(folder.id, token), `"${folder.name}"을(를) 휴지통으로 옮겼어요.`);
    if (message) return setNotice(message);
    const inside = new Set((tree ?? []).filter((f) => ancestorsOf(f.id).includes(folder.id)).map((f) => f.id));
    for (const g of layout.groups) for (const t of g.tabs) if (t.kind === 'file' && inside.has(t.folderId)) dispatch({ type: 'closeFile', fileId: t.fileId });
    if (inside.has(selectedFolderId)) navigate('/drive', { replace: true });
  };
  const trashFile = async (file) => {
    const message = await run(() => driveApi.trashFile(file.id, token), `"${file.name}"을(를) 휴지통으로 옮겼어요.`);
    if (message) return setNotice(message);
    dispatch({ type: 'closeFile', fileId: file.id });
  };

  // ── 탭 내용 ──
  const tabInfo = (tab) => {
    if (tab.kind === 'trash') return { label: '휴지통', icon: '🗑️' };
    const data = folderData.get(tab.folderId);
    const file = data?.files?.find((f) => f.id === tab.fileId);
    const name = file?.name ?? tab.name;
    return { label: name, icon: fileIcon(name), title: `${pathName(tab.folderId)} › ${name}`, missing: Boolean(data && !file) };
  };
  const renderTab = (tab, { focused, onDirtyChange }) => {
    if (tab.kind === 'trash') {
      return (
        <TrashView
          token={token}
          reloadKey={reloadKey}
          onRestore={(item) => runAndShow(() => driveApi.restore(`${item.kind}s`, item.id, token), `"${item.name}"을(를) 복원했어요.`)}
          onPurge={(item) => setDialog({ type: 'purge', item })}
        />
      );
    }
    const data = folderData.get(tab.folderId);
    if (!data) return <p className="muted viewer-message">불러오는 중…</p>;
    const file = data.files?.find((f) => f.id === tab.fileId);
    if (!file) {
      return (
        <div className="no-preview">
          <div className="no-preview-icon" aria-hidden="true">🫥</div>
          <strong>{tab.name}</strong>
          <p className="muted">이 파일을 찾을 수 없어요. 옮겨졌거나 지워졌거나, 볼 권한이 바뀌었어요.</p>
        </div>
      );
    }
    return <FileViewer key={file.id} file={file} canEdit={rankOf(data.myLevel) >= 2} token={token} focused={focused} onDirtyChange={onDirtyChange} />;
  };

  // ── 왼쪽 칸 너비 조절 ──
  const startSidebarResize = (e) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = e.clientX;
    const base = sidebarWidth;
    const onMove = (ev) => setSidebarWidth(Math.min(520, Math.max(200, base + ev.clientX - start)));
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      window.dispatchEvent(new Event('resize'));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  const selectedFolder = selectedFolderId ? folderById.get(selectedFolderId) : null;
  const canNewFolder = selectedFolderId === null ? canCreateRoot : folderRank(selectedFolderId) >= 2;
  const lostFolder = Boolean(tree && selectedFolderId && !selectedFolder); // 주소의 폴더가 없거나 볼 수 없음

  const emptyHint = (
    <div className="welcome">
      <div className="welcome-icon" aria-hidden="true">📂</div>
      <p><strong>왼쪽에서 파일을 고르면 여기에서 열려요</strong></p>
      <ul className="muted">
        <li>{MOD} 또는 {ALT} 누른 채 파일 클릭 → 오른쪽에 나란히</li>
        <li>탭 바의 ▥ · {SPLIT_RIGHT} → 오른쪽으로 나누기, ▤ · {SPLIT_DOWN} → 아래로 나누기 (최대 6칸)</li>
        <li>탭이나 파일을 칸의 위·아래·왼쪽·오른쪽 끝으로 끌면 그쪽에 새 칸</li>
        <li>칸 사이 경계선을 끌면 크기 조절</li>
        <li>컴퓨터의 파일을 왼쪽 폴더에 끌어다 놓으면 올리기</li>
        <li>{SAVE} → 저장</li>
      </ul>
    </div>
  );

  return (
    <div className={`drive-layout ${drawer || !hasTabs ? 'show-explorer' : ''}`}>
      <aside className="drive-sidebar" style={{ width: sidebarWidth }} aria-label="탐색기">
        <div className="explorer-header">
          <span className="explorer-title">드라이브</span>
          <div className="explorer-actions">
            <button
              type="button"
              disabled={!canNewFolder}
              title={canNewFolder ? `새 폴더 (${selectedFolder?.name ?? '맨 위'})` : '여기에 폴더를 만들 권한이 없어요'}
              aria-label="새 폴더"
              onClick={() => setDialog({ type: 'newFolder', parentId: selectedFolderId })}
            >
              ＋📁
            </button>
            <button
              type="button"
              disabled={!canUploadTo(selectedFolderId) || Boolean(upload)}
              title={canUploadTo(selectedFolderId) ? `올리기 (${selectedFolder.name})` : '올릴 폴더를 고르세요 (편집 권한 필요)'}
              aria-label="파일 올리기"
              onClick={() => pickUpload(selectedFolderId)}
            >
              ⬆
            </button>
            <button type="button" title="새로 고침" aria-label="새로 고침" onClick={reload}>⟳</button>
            <button type="button" title="모두 접기" aria-label="모두 접기" onClick={() => setToggled(new Map((tree ?? []).map((f) => [f.id, false])))}>⊟</button>
            {hasTabs && (
              <button type="button" className="only-sm" aria-label="탐색기 닫기" onClick={() => setDrawer(false)}>✕</button>
            )}
          </div>
        </div>

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
        {invalid && <p className="form-error drive-notice">잘못된 주소예요.</p>}
        {lostFolder && <p className="form-error drive-notice">그 폴더를 찾을 수 없어요 (지워졌거나 볼 권한이 없어요).</p>}

        <div className="explorer-scroll">
          <button type="button" className={`tree-root ${selectedFolderId === null ? 'active' : ''}`} onClick={() => navigate('/drive')}>
            🏠 드라이브
          </button>
          {!tree && <p className="muted tree-note">불러오는 중…</p>}
          {tree && !tree.length && <p className="muted tree-note">볼 수 있는 폴더가 없어요. 관리자에게 권한을 요청하세요.</p>}
          {tree && (
            <Explorer
              folders={tree}
              folderData={folderData}
              isOpen={isOpen}
              onToggle={setOpen}
              selectedFolderId={selectedFolderId}
              activeFileId={activeFileId}
              onSelectFolder={(id) => id !== selectedFolderId && navigate(`/drive/${id}`)}
              onOpenFile={openFile}
              onFolderMenu={(e, f) => openMenu(e, { ...f, kind: 'folder' })}
              onFileMenu={(e, f) => openMenu(e, { ...f, kind: 'file' })}
              canUploadTo={canUploadTo}
              onUploadDrop={startUpload}
              dragFileType={DRAG_FILE}
              toTab={fileTab}
            />
          )}
        </div>
        <button type="button" className={`tree-root trash-link ${activeTab?.kind === 'trash' ? 'active' : ''}`} onClick={openTrash}>
          🗑️ 휴지통
        </button>
      </aside>
      <div className="sidebar-splitter" role="separator" aria-orientation="vertical" aria-label="탐색기 너비 조절" onPointerDown={startSidebarResize} />

      <main className="drive-main">
        <EditorArea
          layout={layout}
          dispatch={dispatch}
          renderTab={renderTab}
          tabInfo={tabInfo}
          onNotice={setNotice}
          emptyHint={emptyHint}
          leftSlot={
            <button type="button" className="tab-bar-button only-sm" aria-label="탐색기 열기" onClick={() => setDrawer(true)}>☰</button>
          }
        />
      </main>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          startUpload(uploadTarget, e.target.files);
          e.target.value = '';
        }}
      />

      {menu && (
        <ContextMenu anchor={menu.anchor} onClose={closeMenu} label={`${menu.item.name} 메뉴`}>
          {menu.item.kind === 'folder'
            ? itemRank(menu.item) >= 2 && (
                <>
                  <button type="button" role="menuitem" onClick={menuAction(() => setDialog({ type: 'newFolder', parentId: menu.item.id }))}>＋ 새 폴더</button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      pickUpload(menu.item.id);
                    }}
                  >
                    ⬆ 파일 올리기
                  </button>
                </>
              )
            : (
                <>
                  <button type="button" role="menuitem" onClick={menuAction(() => openFile(menu.item))}>👁️ 열기</button>
                  <button type="button" role="menuitem" className="hide-sm" onClick={menuAction(() => openFile(menu.item, { toSide: true }))}>⫿ 오른쪽에 나란히 열기</button>
                  <button type="button" role="menuitem" onClick={menuAction(() => download(menu.item))}>⬇️ 내려받기</button>
                </>
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
              onClick={menuAction(() => (menu.item.kind === 'folder' ? trashFolder(menu.item) : trashFile(menu.item)))}
            >
              🗑️ 휴지통으로
            </button>
          )}
          {menu.item.kind === 'folder' && itemRank(menu.item) < 2 && <p className="menu-note muted">보기 권한만 있어요</p>}
        </ContextMenu>
      )}

      {dialog?.type === 'newFolder' && (
        <NameDialog
          title={dialog.parentId === null ? '새 폴더 (맨 위)' : `새 폴더 — ${folderById.get(dialog.parentId)?.name ?? ''}`}
          maxLength={100}
          submitLabel="만들기"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const message = await run(() => driveApi.createFolder(dialog.parentId, name, token));
            if (!message) {
              if (dialog.parentId !== null) setOpen(dialog.parentId, true);
              setDialog(null);
            }
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
            if (!message) {
              if (item.kind === 'file') dispatch({ type: 'updateFile', fileId: item.id, patch: { name } });
              setDialog(null);
            }
            return message;
          }}
        />
      )}
      {dialog?.type === 'move' && (
        <MoveDialog
          item={dialog.item}
          folders={tree ?? []}
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
            if (!message) {
              if (item.kind === 'file') dispatch({ type: 'updateFile', fileId: item.id, patch: { folderId: target } });
              if (target !== null) setOpen(target, true);
              setDialog(null);
            }
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
