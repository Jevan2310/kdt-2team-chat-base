// [편집기 시험판 A] 단축키 알아보기
// 한글 입력 상태에서는 e.key 가 바뀐다 (⌘S → 'ㄴ', ⌘\ → '₩'). 그래서 키의 "자리"(e.code, keyCode)로 먼저 본다
const isMod = (e) => (e.ctrlKey || e.metaKey) && !e.altKey;

// ⌘S · Ctrl+S
export const isSaveKey = (e) => isMod(e) && (e.code === 'KeyS' || e.keyCode === 83 || e.key?.toLowerCase() === 's' || e.key === 'ㄴ');

// ⌘\ · Ctrl+\ (Shift 를 같이 누르면 아래로)
export const isSplitKey = (e) => isMod(e) && (e.code === 'Backslash' || e.keyCode === 220 || ['\\', '|', '₩'].includes(e.key));
