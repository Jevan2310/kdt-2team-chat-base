import { useEffect, useReducer } from 'react';

// [편집기 시험판 A] 가운데 편집 영역의 배치 (VS Code 처럼)
// - 칸(group) 여러 개, 칸마다 탭 여러 개. 칸은 좌우·위아래로 나눌 수 있고 최대 6칸
// - groups: [{ id, tabs, active }]   (화면 위치와 상관없는 목록 — 순서가 바뀌지 않아 편집기가 다시 그려지지 않음)
// - tree:   칸들이 놓인 모양. { dir: 'row'(좌우) | 'col'(위아래), children: [칸 id 또는 또 다른 묶음], sizes: [비율] }
//           예) 왼쪽 A, 오른쪽은 위 B·아래 C → { dir:'row', children:['A', { dir:'col', children:['B','C'], sizes:[1,1] }], sizes:[1,1] }
// 탭: { key, kind: 'file' | 'trash', fileId?, folderId?, name? }
// 사람별로 브라우저(localStorage)에 기억 → 새로 고침해도 열어 둔 탭이 그대로
export const MAX_GROUPS = 6;

const newGroupId = () => `g${Math.random().toString(36).slice(2, 8)}`;
const emptyLayout = () => ({ groups: [{ id: 'g1', tabs: [], active: null }], tree: { dir: 'row', children: ['g1'], sizes: [1] }, activeGroup: 'g1' });

export const fileTab = (file) => ({ key: `f${file.id}`, kind: 'file', fileId: file.id, folderId: file.folderId, name: file.name });
export const TRASH_TAB = { key: 'trash', kind: 'trash' };

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const isLeaf = (n) => typeof n === 'string';
const clone = (n) => (isLeaf(n) ? n : { dir: n.dir, children: n.children.map(clone), sizes: [...n.sizes] });

// 칸 id 를 화면 순서(왼쪽 위 → 오른쪽 아래)로
export function leaves(node) {
  return isLeaf(node) ? [node] : node.children.flatMap(leaves);
}

// 모양 정리: 한 칸짜리 묶음은 풀고, 같은 방향 묶음 안의 같은 방향 묶음은 한 줄로 펼친다
function normalize(node, isRoot = true) {
  const children = [];
  const sizes = [];
  node.children.forEach((c, i) => {
    let child = isLeaf(c) ? c : normalize(c, false);
    if (!child) return;
    if (!isLeaf(child) && child.children.length === 1) child = child.children[0];
    const size = node.sizes[i] > 0 ? node.sizes[i] : 1;
    if (!isLeaf(child) && child.dir === node.dir) {
      const total = sum(child.sizes);
      child.children.forEach((cc, j) => {
        children.push(cc);
        sizes.push((size * child.sizes[j]) / total);
      });
    } else {
      children.push(child);
      sizes.push(size);
    }
  });
  if (!children.length) return isRoot ? { dir: node.dir, children: [], sizes: [] } : null;
  if (isRoot && children.length === 1 && !isLeaf(children[0])) return children[0];
  return { dir: node.dir, children, sizes };
}

// targetId 칸 옆(side: right·left·down·up)에 새 칸 newId 를 끼운다
function insertLeaf(root, targetId, newId, side) {
  const dir = side === 'left' || side === 'right' ? 'row' : 'col';
  const after = side === 'right' || side === 'down';
  const tree = clone(root);
  const visit = (node) => {
    const i = node.children.indexOf(targetId);
    if (i >= 0) {
      if (node.children.length === 1) node.dir = dir;
      if (node.dir === dir) {
        // 같은 방향이면 그 줄에 끼우고 원래 칸 크기를 반으로 나눔
        const half = node.sizes[i] / 2;
        node.sizes.splice(i, 1, half, half);
        node.children.splice(after ? i + 1 : i, 0, newId);
      } else {
        // 다른 방향이면 그 칸 자리를 두 칸짜리 새 묶음으로
        node.children[i] = { dir, children: after ? [targetId, newId] : [newId, targetId], sizes: [1, 1] };
      }
      return true;
    }
    return node.children.some((c) => !isLeaf(c) && visit(c));
  };
  visit(tree);
  return normalize(tree);
}

// 칸 하나를 빼고 그 자리는 이웃 칸이 차지
function removeLeaf(root, id) {
  const tree = clone(root);
  const visit = (node) => {
    const i = node.children.indexOf(id);
    if (i >= 0) {
      const freed = node.sizes[i];
      node.children.splice(i, 1);
      node.sizes.splice(i, 1);
      if (node.sizes.length) node.sizes[Math.max(0, i - 1)] += freed;
      return true;
    }
    return node.children.some((c) => !isLeaf(c) && visit(c));
  };
  visit(tree);
  return normalize(tree);
}

// 저장해 둔 값이 이상하면(손으로 고침 등) 버리고 빈 배치로. 예전 형식(칸 나란히 + sizes)은 좌우 한 줄로 바꿔 읽음
function validTree(node, depth = 0) {
  if (isLeaf(node)) return true;
  return (
    depth < 8 &&
    (node?.dir === 'row' || node?.dir === 'col') &&
    Array.isArray(node.children) &&
    Array.isArray(node.sizes) &&
    node.children.length === node.sizes.length &&
    node.children.every((c) => validTree(c, depth + 1))
  );
}

function sanitize(raw) {
  try {
    let groups = (raw?.groups ?? []).slice(0, MAX_GROUPS).map((g) => {
      const tabs = (g.tabs ?? []).filter((t) => t?.key && (t.kind === 'trash' || (t.kind === 'file' && Number.isInteger(t.fileId) && Number.isInteger(t.folderId))));
      return { id: String(g.id), tabs, active: tabs.some((t) => t.key === g.active) ? g.active : (tabs[0]?.key ?? null) };
    });
    const ids = groups.map((g) => g.id);
    let tree = raw?.tree;
    const treeIds = validTree(tree) && !isLeaf(tree) ? leaves(tree) : [];
    if (treeIds.length !== ids.length || new Set(treeIds).size !== ids.length || !treeIds.every((id) => ids.includes(id))) {
      tree = { dir: 'row', children: ids, sizes: ids.map((_, i) => (Number(raw?.sizes?.[i]) > 0 ? Number(raw.sizes[i]) : 1)) };
    }
    // 빈 칸은 없앰 (전부 비었으면 하나만 남김)
    for (const g of groups) if (!g.tabs.length && groups.length > 1) {
      groups = groups.filter((x) => x.id !== g.id);
      tree = removeLeaf(tree, g.id);
    }
    if (!groups.length) return emptyLayout();
    tree = normalize(clone(tree));
    const activeGroup = groups.some((g) => g.id === raw.activeGroup) ? raw.activeGroup : groups[0].id;
    return { groups, tree, activeGroup };
  } catch {
    return emptyLayout();
  }
}

// 칸 하나 바꾸기 도우미
const mapGroup = (state, id, fn) => ({ ...state, groups: state.groups.map((g) => (g.id === id ? fn(g) : g)) });

// 탭을 빼고, 칸이 비면(마지막 칸이 아니면) 칸도 없앤다
function removeTab(state, groupId, key) {
  const g = state.groups.find((x) => x.id === groupId);
  const idx = g?.tabs.findIndex((t) => t.key === key) ?? -1;
  if (idx < 0) return state;
  const tabs = g.tabs.filter((t) => t.key !== key);
  if (!tabs.length && state.groups.length > 1) {
    const order = leaves(state.tree);
    const i = order.indexOf(groupId);
    const activeGroup = state.activeGroup === groupId ? (order[i - 1] ?? order[i + 1]) : state.activeGroup;
    return { groups: state.groups.filter((x) => x.id !== groupId), tree: removeLeaf(state.tree, groupId), activeGroup };
  }
  const active = g.active === key ? ((tabs[idx] ?? tabs[idx - 1])?.key ?? null) : g.active;
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

// targetId 칸 옆(side)에 새 칸을 만들고 탭 하나를 넣는다. 이미 6칸이면 이웃 칸에 연다
function addGroup(state, targetId, tab, side = 'right') {
  if (state.groups.length >= MAX_GROUPS) {
    const order = leaves(state.tree);
    const i = order.indexOf(targetId);
    const other = order[i + 1] ?? order[i - 1] ?? targetId;
    return { ...addTab(state, other, tab), activeGroup: other };
  }
  const group = { id: newGroupId(), tabs: [tab], active: tab.key };
  return { groups: [...state.groups, group], tree: insertLeaf(state.tree, targetId, group.id, side), activeGroup: group.id };
}

function reducer(state, action) {
  switch (action.type) {
    case 'open': {
      const groupId = action.groupId ?? state.activeGroup;
      return { ...addTab(state, groupId, action.tab, action.index), activeGroup: groupId };
    }
    case 'openToSide':
      return addGroup(state, action.fromGroupId ?? state.activeGroup, action.tab, action.side);
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
      // 탭을 targetGroupId 칸 옆(side)의 새 칸으로 옮김
      const from = state.groups.find((g) => g.id === action.fromGroupId);
      const tab = from?.tabs.find((t) => t.key === action.key);
      if (!tab) return state;
      // 칸에 탭이 하나뿐인데 자기 옆으로 → 바뀌는 것 없음
      if (from.tabs.length === 1 && action.targetGroupId === from.id) return state;
      if (state.groups.length >= MAX_GROUPS) return state;
      const added = addGroup(state, action.targetGroupId, tab, action.side);
      return removeTab(added, from.id, tab.key);
    }
    case 'split': {
      // 지금 탭을 옆(오른쪽·아래) 새 칸에 하나 더 연다 (VS Code 의 "분할")
      const g = state.groups.find((x) => x.id === (action.groupId ?? state.activeGroup));
      const tab = g?.tabs.find((t) => t.key === g.active);
      if (!tab || state.groups.length >= MAX_GROUPS) return state;
      return addGroup(state, g.id, tab, action.side ?? 'right');
    }
    case 'resize': {
      // path: 뿌리에서 그 묶음까지 children 번호들
      const tree = clone(state.tree);
      let node = tree;
      for (const i of action.path) node = node.children[i];
      if (!node || isLeaf(node) || node.sizes.length !== action.sizes.length) return state;
      node.sizes = action.sizes;
      return { ...state, tree };
    }
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

// 모양(tree)을 칸마다 화면 위치(0~1 비율)로 바꾼다 + 칸 사이 경계선 위치
// 칸은 모두 같은 부모 안에 절대 위치로 그린다 → 나누거나 합쳐도 칸이 새로 만들어지지 않아 고치던 내용이 그대로
export function computeRects(tree) {
  const panes = {};
  const splitters = [];
  const walk = (node, r, path) => {
    if (isLeaf(node)) {
      panes[node] = r;
      return;
    }
    const total = sum(node.sizes) || 1;
    let off = 0;
    node.children.forEach((c, i) => {
      const f = node.sizes[i] / total;
      const cr = node.dir === 'row' ? { x: r.x + r.w * off, y: r.y, w: r.w * f, h: r.h } : { x: r.x, y: r.y + r.h * off, w: r.w, h: r.h * f };
      if (i > 0) splitters.push({ key: `${path.join('.')}/${i}`, path, index: i - 1, dir: node.dir, node: r, at: node.dir === 'row' ? cr.x : cr.y });
      walk(c, cr, [...path, i]);
      off += f;
    });
  };
  walk(tree, { x: 0, y: 0, w: 1, h: 1 }, []);
  return { panes, splitters };
}

export function sizesAt(tree, path) {
  let node = tree;
  for (const i of path) node = node.children[i];
  return node.sizes;
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
