import { useEffect, useReducer } from 'react';

// [편집기 시험판 A] 가운데 편집 영역의 배치: 나란히 놓인 "칸(group)" 여러 개, 칸마다 탭 여러 개 (VS Code 처럼)
// 탭: { key, kind: 'file' | 'trash', fileId?, folderId?, name? }
// 사람별로 브라우저(localStorage)에 기억 → 새로 고침해도 열어 둔 탭이 그대로
export const MAX_GROUPS = 3;

const newGroupId = () => `g${Math.random().toString(36).slice(2, 8)}`;
const emptyLayout = () => ({ groups: [{ id: 'g1', tabs: [], active: null }], activeGroup: 'g1', sizes: [1] });

export const fileTab = (file) => ({ key: `f${file.id}`, kind: 'file', fileId: file.id, folderId: file.folderId, name: file.name });
export const TRASH_TAB = { key: 'trash', kind: 'trash' };

// 저장해 둔 값이 이상하면(예전 형식·손으로 고침) 버리고 빈 배치로
function sanitize(raw) {
  try {
    const groups = (raw?.groups ?? [])
      .slice(0, MAX_GROUPS)
      .map((g) => {
        const tabs = (g.tabs ?? []).filter((t) => t?.key && (t.kind === 'trash' || (t.kind === 'file' && Number.isInteger(t.fileId) && Number.isInteger(t.folderId))));
        return { id: String(g.id), tabs, active: tabs.some((t) => t.key === g.active) ? g.active : (tabs[0]?.key ?? null) };
      })
      .filter((g, i, all) => g.tabs.length || all.length === 1);
    if (!groups.length) return emptyLayout();
    const sizes = groups.map((_, i) => (Number(raw.sizes?.[i]) > 0 ? Number(raw.sizes[i]) : 1));
    const activeGroup = groups.some((g) => g.id === raw.activeGroup) ? raw.activeGroup : groups[0].id;
    return { groups, activeGroup, sizes };
  } catch {
    return emptyLayout();
  }
}

// 칸 하나 바꾸기 도우미
const mapGroup = (state, id, fn) => ({ ...state, groups: state.groups.map((g) => (g.id === id ? fn(g) : g)) });

// 탭을 빼고, 칸이 비면(마지막 칸이 아니면) 칸도 없앤다
function removeTab(state, groupId, key) {
  const gi = state.groups.findIndex((g) => g.id === groupId);
  if (gi < 0) return state;
  const g = state.groups[gi];
  const idx = g.tabs.findIndex((t) => t.key === key);
  if (idx < 0) return state;
  const tabs = g.tabs.filter((t) => t.key !== key);
  if (!tabs.length && state.groups.length > 1) {
    const groups = state.groups.filter((x) => x.id !== groupId);
    const sizes = state.sizes.filter((_, i) => i !== gi);
    const activeGroup = state.activeGroup === groupId ? groups[Math.max(0, gi - 1)].id : state.activeGroup;
    return { groups, sizes, activeGroup };
  }
  const active = g.active === key ? (tabs[idx] ?? tabs[idx - 1])?.key ?? null : g.active;
  return mapGroup(state, groupId, () => ({ ...g, tabs, active }));
}

// 칸에 탭 넣기 (이미 있으면 그 탭으로). index 가 없으면 지금 탭 바로 뒤에
function addTab(state, groupId, tab, index) {
  return mapGroup(state, groupId, (g) => {
    if (g.tabs.some((t) => t.key === tab.key)) return { ...g, active: tab.key };
    const at = index ?? g.tabs.findIndex((t) => t.key === g.active) + 1;
    const tabs = [...g.tabs];
    tabs.splice(at < 0 ? tabs.length : at, 0, tab);
    return { ...g, tabs, active: tab.key };
  });
}

// afterGroupId 오른쪽에 새 칸을 만들고 탭 하나를 넣는다 (칸이 이미 최대면 가장 오른쪽 칸에)
function addGroupRight(state, afterGroupId, tab) {
  if (state.groups.length >= MAX_GROUPS) {
    const last = state.groups[state.groups.length - 1].id;
    return { ...addTab(state, last, tab), activeGroup: last };
  }
  const gi = state.groups.findIndex((g) => g.id === afterGroupId);
  const group = { id: newGroupId(), tabs: [tab], active: tab.key };
  const groups = [...state.groups];
  groups.splice(gi + 1, 0, group);
  const sizes = [...state.sizes];
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  sizes.splice(gi + 1, 0, avg);
  return { groups, sizes, activeGroup: group.id };
}

function reducer(state, action) {
  switch (action.type) {
    case 'open': {
      const groupId = action.groupId ?? state.activeGroup;
      return { ...addTab(state, groupId, action.tab, action.index), activeGroup: groupId };
    }
    case 'openToSide':
      return addGroupRight(state, action.fromGroupId ?? state.activeGroup, action.tab);
    case 'activate':
      return { ...mapGroup(state, action.groupId, (g) => ({ ...g, active: action.key })), activeGroup: action.groupId };
    case 'focusGroup':
      return state.activeGroup === action.groupId ? state : { ...state, activeGroup: action.groupId };
    case 'close':
      return removeTab(state, action.groupId, action.key);
    case 'closeOthers':
      return mapGroup(state, action.groupId, (g) => ({ ...g, tabs: g.tabs.filter((t) => t.key === action.key), active: action.key }));
    case 'move': {
      // 같은 칸 안에서는 순서만 바꿈
      const from = state.groups.find((g) => g.id === action.fromGroupId);
      const tab = from?.tabs.find((t) => t.key === action.key);
      if (!tab) return state;
      if (action.fromGroupId === action.toGroupId) {
        if (action.index === undefined) return state;
        return mapGroup(state, from.id, (g) => {
          const rest = g.tabs.filter((t) => t.key !== tab.key);
          const at = Math.min(action.index > g.tabs.indexOf(tab) ? action.index - 1 : action.index, rest.length);
          rest.splice(at, 0, tab);
          return { ...g, tabs: rest, active: tab.key };
        });
      }
      const added = { ...addTab(state, action.toGroupId, tab, action.index), activeGroup: action.toGroupId };
      return removeTab(added, action.fromGroupId, tab.key);
    }
    case 'moveToNewGroup': {
      const from = state.groups.find((g) => g.id === action.fromGroupId);
      const tab = from?.tabs.find((t) => t.key === action.key);
      if (!tab) return state;
      // 칸에 탭이 하나뿐인데 자기 오른쪽으로 → 바뀌는 것 없음
      if (from.tabs.length === 1 && action.afterGroupId === from.id) return state;
      if (state.groups.length >= MAX_GROUPS) return state;
      const added = addGroupRight(state, action.afterGroupId, tab);
      return removeTab(added, from.id, tab.key);
    }
    case 'split': {
      // 지금 탭을 오른쪽 새 칸에 하나 더 연다 (VS Code 의 "오른쪽으로 분할")
      const g = state.groups.find((x) => x.id === (action.groupId ?? state.activeGroup));
      const tab = g?.tabs.find((t) => t.key === g.active);
      if (!tab || state.groups.length >= MAX_GROUPS) return state;
      return addGroupRight(state, g.id, tab);
    }
    case 'resize':
      return { ...state, sizes: action.sizes };
    case 'updateFile':
      return {
        ...state,
        groups: state.groups.map((g) => ({ ...g, tabs: g.tabs.map((t) => (t.fileId === action.fileId ? { ...t, ...action.patch } : t)) })),
      };
    case 'closeFile': {
      let next = state;
      for (const g of state.groups) for (const t of g.tabs) if (t.fileId === action.fileId) next = removeTab(next, g.id, t.key);
      return next;
    }
    default:
      return state;
  }
}

export function useEditorLayout(storageKey) {
  const [layout, dispatch] = useReducer(reducer, storageKey, (key) => {
    try {
      return sanitize(JSON.parse(localStorage.getItem(key) ?? 'null'));
    } catch {
      return emptyLayout();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // 저장 못 해도(사생활 보호 모드 등) 화면은 그대로 동작
    }
  }, [storageKey, layout]);
  return [layout, dispatch];
}
