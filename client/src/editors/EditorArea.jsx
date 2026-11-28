import { useCallback, useEffect, useRef, useState } from 'react';
import ContextMenu from '../components/common/ContextMenu.jsx';
import Dialog from '../components/common/Dialog.jsx';
import { MAX_GROUPS } from './useEditorLayout.js';

// [편집기 시험판 A] 가운데 편집 영역 (VS Code 처럼)
// - 칸(group)을 최대 3개까지 나란히. 칸마다 탭 여러 개
// - 나누기: 탭 바의 ⫿ 버튼, Ctrl+\ (⌘\), 탭을 칸 오른쪽 끝으로 끌어다 놓기, 왼쪽 트리의 파일을 끌어다 놓기
// - 칸 사이 경계선을 끌어 너비 조절
// - 탭 내용은 닫을 때까지 살려 둔다(숨김) → 다른 탭을 봤다 와도 고치던 내용이 그대로
// renderTab(tab, { groupId, focused, visible, onDirtyChange }) 로 탭 내용을, tabInfo(tab) → { label, icon, title } 로 탭 이름을 받는다
export const DRAG_TAB = 'application/x-drive-tab';
export const DRAG_FILE = 'application/x-drive-file';

export default function EditorArea({ layout, dispatch, renderTab, tabInfo, onNotice, emptyHint, leftSlot }) {
  const [dirty, setDirty] = useState({}); // { 'groupId:key': true }
  const [confirm, setConfirm] = useState(null); // { groupId, key } 저장 안 한 탭 닫기 확인
  const [menu, setMenu] = useState(null); // { anchor, groupId, key }
  const [dropHint, setDropHint] = useState(null); // { groupId, zone: 'center' | 'right' | 'tabs' }
  const areaRef = useRef(null);
  const canSplit = layout.groups.length < MAX_GROUPS;

  const dirtyKey = (groupId, key) => `${groupId}:${key}`;
  const setTabDirty = useCallback((groupId, key, value) => {
    setDirty((prev) => {
      const k = dirtyKey(groupId, key);
      if (Boolean(prev[k]) === value) return prev;
      const next = { ...prev };
      if (value) next[k] = true;
      else delete next[k];
      return next;
    });
  }, []);

  const requestClose = (groupId, key) => {
    if (dirty[dirtyKey(groupId, key)]) setConfirm({ groupId, key });
    else close(groupId, key);
  };
  const close = (groupId, key) => {
    setTabDirty(groupId, key, false);
    dispatch({ type: 'close', groupId, key });
  };

  // Ctrl+\ (⌘\) → 지금 탭을 오른쪽에 하나 더
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        dispatch({ type: 'split' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // 숨겨 두었던 탭이 다시 보이면 편집기들이 크기를 다시 재게 (표·사진 편집기는 숨김 상태에서 크기를 0으로 잼)
  const visibleKey = layout.groups.map((g) => `${g.id}:${g.active}`).join('|') + layout.sizes.join(',');
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, [visibleKey]);

  // ── 끌어다 놓기 ──
  const dragKind = (e) => {
    const types = [...(e.dataTransfer?.types ?? [])];
    if (types.includes(DRAG_TAB)) return 'tab';
    if (types.includes(DRAG_FILE)) return 'file';
    return null;
  };
  const read = (e, type) => {
    try {
      return JSON.parse(e.dataTransfer.getData(type));
    } catch {
      return null;
    }
  };
  const isDirtyDrag = (data) => data && dirty[dirtyKey(data.groupId, data.key)];

  // 놓을 자리: 탭 바 = 그 칸에, 본문 오른쪽 30% = 오른쪽에 새 칸, 나머지 본문 = 그 칸에
  const zoneOf = (e, area) => {
    if (area !== 'body') return 'tabs';
    const r = e.currentTarget.getBoundingClientRect();
    return canSplit && e.clientX > r.right - r.width * 0.3 ? 'right' : 'center';
  };
  const onGroupDragOver = (e, groupId, area) => {
    if (!dragKind(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const zone = zoneOf(e, area);
    if (dropHint?.groupId !== groupId || dropHint?.zone !== zone) setDropHint({ groupId, zone });
  };
  const onGroupDrop = (e, groupId, area, index) => {
    const kind = dragKind(e);
    if (!kind) return;
    e.preventDefault();
    e.stopPropagation();
    const zone = zoneOf(e, area);
    setDropHint(null);
    if (kind === 'tab') {
      const data = read(e, DRAG_TAB);
      if (!data) return;
      if (data.groupId !== groupId && isDirtyDrag(data)) {
        onNotice?.('저장하지 않은 탭은 다른 칸으로 옮길 수 없어요. 먼저 저장해 주세요.');
        return;
      }
      if (zone === 'right') {
        if (isDirtyDrag(data)) return onNotice?.('저장하지 않은 탭은 다른 칸으로 옮길 수 없어요. 먼저 저장해 주세요.');
        dispatch({ type: 'moveToNewGroup', fromGroupId: data.groupId, key: data.key, afterGroupId: groupId });
      } else {
        dispatch({ type: 'move', fromGroupId: data.groupId, key: data.key, toGroupId: groupId, index });
      }
    } else {
      const tab = read(e, DRAG_FILE);
      if (!tab) return;
      if (zone === 'right') dispatch({ type: 'openToSide', tab, fromGroupId: groupId });
      else dispatch({ type: 'open', tab, groupId, index });
    }
  };
  const onGroupDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropHint(null);
  };

  // ── 칸 너비 조절 (경계선 끌기) ──
  const startResize = (e, i) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const width = areaRef.current.getBoundingClientRect().width;
    const start = e.clientX;
    const base = [...layout.sizes];
    const total = base.reduce((a, b) => a + b, 0);
    const min = total * 0.15;
    const onMove = (ev) => {
      const delta = ((ev.clientX - start) / width) * total;
      const pair = base[i] + base[i + 1];
      const left = Math.min(pair - min, Math.max(min, base[i] + delta));
      const sizes = [...base];
      sizes[i] = left;
      sizes[i + 1] = pair - left;
      dispatch({ type: 'resize', sizes });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const onlyEmpty = layout.groups.length === 1 && layout.groups[0].tabs.length === 0;

  return (
    <div className="editor-area" ref={areaRef} onDragEnd={() => setDropHint(null)}>
      {layout.groups.map((g, gi) => {
        const focusedGroup = layout.activeGroup === g.id;
        return (
          <div key={g.id} className={`editor-group-wrap ${focusedGroup ? 'focused' : ''}`} style={{ flexGrow: layout.sizes[gi] ?? 1 }}>
            {gi > 0 && (
              <div
                className="group-splitter"
                role="separator"
                aria-orientation="vertical"
                aria-label="칸 너비 조절"
                onPointerDown={(e) => startResize(e, gi - 1)}
              />
            )}
            <section
              className={`editor-group ${focusedGroup ? 'focused' : ''}`}
              aria-label={`편집 칸 ${gi + 1}`}
              onPointerDownCapture={() => dispatch({ type: 'focusGroup', groupId: g.id })}
              onFocusCapture={() => dispatch({ type: 'focusGroup', groupId: g.id })}
            >
              <div
                className={`tab-bar ${dropHint?.groupId === g.id && dropHint.zone === 'tabs' ? 'drop-target' : ''}`}
                role="tablist"
                onDragOver={(e) => onGroupDragOver(e, g.id, 'tabs')}
                onDragLeave={onGroupDragLeave}
                onDrop={(e) => onGroupDrop(e, g.id, 'tabs')}
              >
                {leftSlot /* 휴대폰 ☰ (탐색기 열기) — 넓은 화면에서는 숨김 */}
                {g.tabs.map((t, ti) => {
                  const info = tabInfo(t);
                  const isDirty = dirty[dirtyKey(g.id, t.key)];
                  const active = g.active === t.key;
                  return (
                    <div
                      key={t.key}
                      role="tab"
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      className={`tab ${active ? 'active' : ''} ${info.missing ? 'missing' : ''}`}
                      title={info.title ?? info.label}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_TAB, JSON.stringify({ groupId: g.id, key: t.key }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => onGroupDragOver(e, g.id, 'tabs')}
                      onDrop={(e) => onGroupDrop(e, g.id, 'tabs', ti)}
                      onClick={() => dispatch({ type: 'activate', groupId: g.id, key: t.key })}
                      onAuxClick={(e) => e.button === 1 && requestClose(g.id, t.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'activate', groupId: g.id, key: t.key });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ anchor: { x: e.clientX, y: e.clientY }, groupId: g.id, key: t.key });
                      }}
                    >
                      <span className="tab-icon" aria-hidden="true">{info.icon}</span>
                      <span className="tab-label">{info.label}</span>
                      <button
                        type="button"
                        className={`tab-close ${isDirty ? 'dirty' : ''}`}
                        aria-label={isDirty ? `${info.label} 닫기 (저장 안 됨)` : `${info.label} 닫기`}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestClose(g.id, t.key);
                        }}
                      >
                        <span className="dot">●</span>
                        <span className="x">✕</span>
                      </button>
                    </div>
                  );
                })}
                <div className="tab-bar-fill" />
                {g.active && canSplit && (
                  <button type="button" className="tab-bar-button hide-sm" title="오른쪽으로 나누기 (Ctrl+\)" aria-label="오른쪽으로 나누기" onClick={() => dispatch({ type: 'split', groupId: g.id })}>
                    ⫿
                  </button>
                )}
              </div>

              <div
                className="group-body"
                onDragOver={(e) => onGroupDragOver(e, g.id, 'body')}
                onDragLeave={onGroupDragLeave}
                onDrop={(e) => onGroupDrop(e, g.id, 'body')}
              >
                {g.tabs.map((t) => {
                  const visible = g.active === t.key;
                  return (
                    <div key={t.key} className="tab-panel" role="tabpanel" hidden={!visible}>
                      {renderTab(t, {
                        groupId: g.id,
                        visible,
                        focused: visible && focusedGroup,
                        onDirtyChange: (value) => setTabDirty(g.id, t.key, value),
                      })}
                    </div>
                  );
                })}
                {!g.tabs.length && (
                  <div className="editor-empty">
                    {onlyEmpty ? emptyHint : <p className="muted">이 칸은 비어 있어요.</p>}
                  </div>
                )}
                {dropHint?.groupId === g.id && dropHint.zone !== 'tabs' && (
                  <div className={`drop-zone ${dropHint.zone}`}>{dropHint.zone === 'right' ? '오른쪽에 나란히' : '여기에 열기'}</div>
                )}
              </div>
            </section>
          </div>
        );
      })}

      {menu && (
        <ContextMenu anchor={menu.anchor} onClose={() => setMenu(null)} label="탭 메뉴">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              requestClose(menu.groupId, menu.key);
            }}
          >
            ✕ 닫기
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const g = layout.groups.find((x) => x.id === menu.groupId);
              const others = g?.tabs.filter((t) => t.key !== menu.key) ?? [];
              setMenu(null);
              if (others.some((t) => dirty[dirtyKey(menu.groupId, t.key)])) return onNotice?.('저장하지 않은 탭이 있어요. 하나씩 닫아 주세요.');
              dispatch({ type: 'closeOthers', groupId: menu.groupId, key: menu.key });
            }}
          >
            ✕ 다른 탭 모두 닫기
          </button>
          {canSplit && (
            <button
              type="button"
              role="menuitem"
              className="hide-sm"
              onClick={() => {
                const g = layout.groups.find((x) => x.id === menu.groupId);
                const tab = g?.tabs.find((t) => t.key === menu.key);
                setMenu(null);
                if (tab) dispatch({ type: 'openToSide', tab, fromGroupId: menu.groupId });
              }}
            >
              ⫿ 오른쪽에 나란히 열기
            </button>
          )}
        </ContextMenu>
      )}

      {confirm && (
        <Dialog title="저장하지 않은 내용" onClose={() => setConfirm(null)}>
          <p>고친 내용을 저장하지 않았어요. 그냥 닫을까요?</p>
          <div className="dialog-buttons">
            <button type="button" onClick={() => setConfirm(null)}>계속 편집</button>
            <button
              type="button"
              className="danger-fill"
              onClick={() => {
                close(confirm.groupId, confirm.key);
                setConfirm(null);
              }}
            >
              저장 안 하고 닫기
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
