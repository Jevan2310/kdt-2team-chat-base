import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { groupByParent } from '../../lib/drive.js';

// 왼쪽 폴더 트리. 지금 보는 폴더까지의 경로는 항상 펼쳐 둔다
export default function FolderTree({ folders, currentId, openIds = [], onFolderMenu }) {
  const children = useMemo(() => groupByParent(folders), [folders]);
  const [toggled, setToggled] = useState(() => new Map()); // 사용자가 직접 펼치거나 접은 폴더
  const isOpen = (id) => toggled.get(id) ?? openIds.includes(id);
  const toggle = (id) => setToggled((prev) => new Map(prev).set(id, !isOpen(id)));

  const renderLevel = (parentId, depth) =>
    (children.get(parentId) ?? []).map((f) => {
      const hasChildren = children.has(f.id);
      const open = hasChildren && isOpen(f.id);
      return (
        <div key={f.id}>
          <div
            className={`tree-row ${f.id === currentId ? 'active' : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onContextMenu={(e) => onFolderMenu?.(e, f)}
          >
            {hasChildren ? (
              <button type="button" className="tree-toggle" onClick={() => toggle(f.id)} aria-label={open ? '접기' : '펼치기'}>
                {open ? '▾' : '▸'}
              </button>
            ) : (
              <span className="tree-toggle" />
            )}
            <Link to={`/drive/${f.id}`} title={f.locked ? '위 폴더 권한을 이어받지 않는 폴더' : undefined}>
              📁 {f.name}
              {f.locked && ' 🔒'}
            </Link>
          </div>
          {open && <div className="tree-children">{renderLevel(f.id, depth + 1)}</div>}
        </div>
      );
    });

  return <nav className="folder-tree" aria-label="폴더">{renderLevel(null, 0)}</nav>;
}
