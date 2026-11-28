// [편집기 시험판 A] 파일 종류 → 가운데 화면에서 쓸 편집기
// 폐기할 때: editors/ 폴더 + DrivePage.jsx 의 "[편집기 시험판 A]" 표시 줄 + package.json 의 편집기 패키지 (README 참고)
// 끄기만 할 때: client/.env.local 에 VITE_EDITORS=off → 파일을 누르면 예전처럼 내려받기
import { lazy } from 'react';

export const EDITORS_ON = import.meta.env.VITE_EDITORS !== 'off';

// 각 편집기는 처음 열 때만 내려받는다 (lazy) → 드라이브 첫 화면이 무거워지지 않음
// canSave: 고친 내용을 원래 파일에 저장할 수 있는지 (false 면 보기만)
const KINDS = [
  { kind: 'text', label: '글', exts: ['txt', 'md', 'json', 'log', 'xml', 'yml', 'yaml', 'html', 'css'], canSave: true, Component: lazy(() => import('./TextEditor.jsx')) },
  { kind: 'image', label: '사진', exts: ['png', 'jpg', 'jpeg', 'webp'], canSave: true, Component: lazy(() => import('./ImageEditor.jsx')) },
  { kind: 'picture', label: '그림', exts: ['svg', 'gif', 'bmp'], canSave: false, Component: lazy(() => import('./PictureViewer.jsx')) },
  { kind: 'pdf', label: 'PDF', exts: ['pdf'], canSave: true, Component: lazy(() => import('./PdfEditor.jsx')) },
  { kind: 'sheet', label: '엑셀', exts: ['xlsx', 'csv'], canSave: true, Component: lazy(() => import('./SheetEditor.jsx')) },
  { kind: 'docx', label: '워드', exts: ['docx'], canSave: false, Component: lazy(() => import('./DocxViewer.jsx')) },
  { kind: 'pptx', label: 'PPT', exts: ['pptx'], canSave: false, Component: lazy(() => import('./PptxViewer.jsx')) },
];

const extOf = (name) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();

// 이 파일을 가운데 화면에서 열 수 있으면 편집기 정보, 아니면 null (→ 내려받기)
export function editorFor(name) {
  if (!EDITORS_ON) return null;
  const ext = extOf(name);
  const found = KINDS.find((k) => k.exts.includes(ext));
  return found ? { ...found, ext } : null;
}
