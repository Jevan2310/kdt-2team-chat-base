import { useMemo, useState } from 'react';
import { fileIcon, formatDate, formatSize, groupByParent } from '../../lib/drive.js';

// 왼쪽 탐색기: 폴더와 그 안의 파일을 한 나무로 (VS Code 탐색기처럼)
// - 폴더를 누르면 고르고 펼침/접음. 파일을 누르면 가운데에서 열기 (Ctrl·⌘·Alt + 누르기 = 오른쪽에 나란히)
// - 파일은 폴더를 펼칠 때 그 폴더 것만 받아 온다 (folderData)
// - 컴퓨터의 파일을 폴더 줄에 끌어다 놓으면 그 폴더에 올리기, 트리의 파일을 가운데로 끌면 거기서 열기
export default function Explorer({
  folders,
  folderData,
  isOpen,
  onToggle,
  selectedFolderId,
  activeFileId,
  onSelectFolder,
  onOpenFile,
  onFolderMenu,
  onFileMenu,
  canUploadTo,
  onUploadDrop,
  dragFileType,
  toTab,
}) {
  const children = useMemo(() => groupByParent(folders), [folders]);
  const [dropOn, setDropOn] = useState(null); // 컴퓨터 파일을 끌어 올리려는 폴더 id

  const isOsFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const dropProps = (folderId) =>
    canUploadTo(folderId)
      ? {
          onDragOver: (e) => {
            if (!isOsFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            if (dropOn !== folderId) setDropOn(folderId);
          },
          onDragLeave: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDropOn((v) => (v === folderId ? null : v));
          },
          onDrop: (e) => {
            if (!isOsFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            setDropOn(null);
            onUploadDrop(folderId, e.dataTransfer.files);
          },
        }
      : {};

  const pad = (depth) => ({ paddingLeft: 6 + depth * 14 });

  const renderFolder = (f, depth) => {
    const open = isOpen(f.id);
    const data = folderData.get(f.id);
    const sub = children.get(f.id) ?? [];
    return (
      <div key={`d${f.id}`} role="none" className={dropOn === f.id ? 'tree-drop' : ''} {...dropProps(f.id)}>
        <div
          role="treeitem"
          aria-expanded={open}
          aria-selected={f.id === selectedFolderId}
          className={`tree-row folder ${f.id === selectedFolderId ? 'active' : ''}`}
          style={pad(depth)}
          onContextMenu={(e) => onFolderMenu(e, f)}
        >
          <button
            type="button"
            className="tree-main"
            onClick={() => {
              onSelectFolder(f.id);
              onToggle(f.id, !open);
            }}
            title={f.locked ? `${f.name} — 위 폴더 권한을 이어받지 않는 폴더` : f.name}
          >
            <span className="tree-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
            <span aria-hidden="true">{open ? '📂' : '📁'}</span>
            <span className="tree-name">{f.name}</span>
            {f.locked && <span aria-label="권한 끊김"> 🔒</span>}
          </button>
          <button type="button" className="tree-more" aria-label={`${f.name} 메뉴`} onClick={(e) => onFolderMenu(e, f)}>⋯</button>
        </div>
        {open && (
          <div role="group" className="tree-children">
            {sub.map((c) => renderFolder(c, depth + 1))}
            {!data && <div className="tree-note" style={pad(depth + 1)}>불러오는 중…</div>}
            {data?.error && <div className="tree-note error" style={pad(depth + 1)}>{data.error}</div>}
            {data?.files?.map((file) => renderFile(file, depth + 1))}
            {data?.files && !data.files.length && !sub.length && <div className="tree-note" style={pad(depth + 1)}>비어 있어요</div>}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file, depth) => (
    <div
      key={`f${file.id}`}
      role="treeitem"
      aria-selected={file.id === activeFileId}
      className={`tree-row file ${file.id === activeFileId ? 'active' : ''}`}
      style={pad(depth)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(dragFileType, JSON.stringify(toTab(file)));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onContextMenu={(e) => onFileMenu(e, file)}
    >
      <button
        type="button"
        className="tree-main"
        onClick={(e) => onOpenFile(file, { toSide: e.ctrlKey || e.metaKey || e.altKey })}
        title={`${file.name}\n${formatSize(file.size)} · ${formatDate(file.updatedAt)}${file.uploadedBy ? ` · ${file.uploadedBy.nickname}` : ''}`}
      >
        <span className="tree-chevron" aria-hidden="true" />
        <span aria-hidden="true">{fileIcon(file.name)}</span>
        <span className="tree-name">{file.name}</span>
      </button>
      <button type="button" className="tree-more" aria-label={`${file.name} 메뉴`} onClick={(e) => onFileMenu(e, file)}>⋯</button>
    </div>
  );

  return (
    <div className="explorer-tree" role="tree" aria-label="폴더와 파일">
      {(children.get(null) ?? []).map((f) => renderFolder(f, 0))}
    </div>
  );
}
