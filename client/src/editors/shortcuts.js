// [편집기 시험판 A] 단축키 알아보기
// 한글 입력 상태에서는 e.key 가 바뀐다 (⌘S → 'ㄴ', ⌘\ → '₩'). 그래서 키의 "자리"(e.code, keyCode)로 먼저 본다
const isMod = (e) => (e.ctrlKey || e.metaKey) && !e.altKey;

// ⌘S · Ctrl+S
export const isSaveKey = (e) => isMod(e) && (e.code === 'KeyS' || e.keyCode === 83 || e.key?.toLowerCase() === 's' || e.key === 'ㄴ');

// ⌘\ · Ctrl+\ (Shift 를 같이 누르면 아래로)
export const isSplitKey = (e) => isMod(e) && (e.code === 'Backslash' || e.keyCode === 220 || ['\\', '|', '₩'].includes(e.key));

// 화면에 보여 줄 키 이름: 맥은 ⌘⇧S 처럼, 윈도우는 Ctrl+Shift+S 처럼
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');
export const MOD = IS_MAC ? '⌘' : 'Ctrl';
export const ALT = IS_MAC ? '⌥' : 'Alt';
const SHIFT = IS_MAC ? '⇧' : 'Shift';
export const keys = (...parts) => parts.map((p) => (p === 'shift' ? SHIFT : p)).join(IS_MAC ? '' : '+');
export const SPLIT_RIGHT = keys(MOD, '\\');
export const SPLIT_DOWN = keys(MOD, 'shift', '\\');
export const SAVE = keys(MOD, 'S');
