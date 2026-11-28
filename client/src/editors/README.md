# 편집기 시험판 A (브라우저 전용)

드라이브에서 파일을 누르면 가운데 큰 화면에서 바로 보거나 고친다. 서버 프로그램을 따로 두지 않는다 (Docker 없음).
**시험판**이라 `try/editor-a` 브랜치에만 있다. 써 보고 괜찮으면 main 에 합치고, 별로면 버린다.

## 파일 종류별

| 종류 | 확장자 | 할 수 있는 것 | 라이브러리 (라이선스) |
|---|---|---|---|
| 글 | txt md json log xml yml yaml html css | 편집·저장 | 없음 (textarea) |
| 사진 | png jpg jpeg webp | 자르기·회전·밝기·필터·글자/도형·크기 → 같은 형식으로 저장 | react-filerobot-image-editor (MIT, 5.0 beta) |
| 그림 | svg gif bmp | 보기만 (svg 안 스크립트는 실행 안 됨) | 없음 (`<img>`) |
| PDF | pdf | 보기 + 형광펜·글상자·그리기 → 저장하면 PDF 안에 주석으로 | pdfjs-dist (Apache-2.0) |
| 엑셀 | xlsx csv | 편집·저장 (여러 시트, 수식, 색·굵기) | @fortune-sheet/react + @corbe30/fortune-excel (MIT) |
| 워드 | docx | 보기만 | docx-preview (Apache-2.0) |
| PPT | pptx | 보기만 | pptx-preview (ISC — npm 패키지는 상업 사용 무료, 소스 비공개) |

그 밖의 파일은 예전처럼 누르면 내려받는다.

## 구조
- `registry.js` — 확장자 → 편집기. 각 편집기는 처음 열 때만 내려받는다 (드라이브 첫 화면은 가벼움)
- `FileViewer.jsx` — 가운데 화면 틀: 열기(서명 주소), 저장(Ctrl+S), 저장 안 하고 닫기 확인, 보기 전용 표시, 편집기 오류 막기
- 편집기 약속: props `blob, file, readOnly, saverRef, onDirty` — 고치면 `onDirty()`, `saverRef.current = async () => Blob`
- 서버: `server/src/modules/drive/content.routes.js` — `PUT /api/drive/files/:id/content` (편집 권한, 판 확인으로 덮어쓰기 방지, DB 바뀜 없음)

## 알려진 한계 (시험하면서 확인할 것)
- 엑셀: 피벗·매크로·차트 등 복잡한 서식은 빠지거나 바뀔 수 있음. 계산값이 저장 안 된 수식(엑셀 말고 다른 프로그램이 만든 파일)은 열 때 빈칸 → 그 줄을 고치면 계산됨
- 워드·PPT: 보기만. 원래 모양과 다르게 보일 수 있음 (특히 PPT)
- 버전 기록 없음: 저장하면 예전 내용은 지워진다 (정식으로 가면 `file_versions` 표로 보관)
- 동시 편집 없음: 두 사람이 같은 파일을 열면 먼저 저장한 사람만 저장되고, 늦은 사람은 "다른 사람이 먼저 저장했어요" (409)
- pptx-preview 가 쓰는 echarts·uuid 에 npm audit 보통(moderate) 경고가 있음

## 끄기 (코드는 그대로)
`client/.env.local` 에 `VITE_EDITORS=off` → 파일을 누르면 예전처럼 내려받기. 서버 API 는 남아 있어도 화면에서 안 부름.

## 버리기
브랜치째 버리면 끝: `git switch main && git branch -D try/editor-a` (main 에는 아무것도 안 들어가 있음)

main 에 합친 뒤에 버린다면:
1. `client/src/editors/` 폴더 삭제
2. `client/src/pages/DrivePage.jsx` 에서 `[편집기 시험판 A]` 표시 줄 되돌리기 (import 2줄, `useSearchParams`, `openFile`/`closeFile`, `openId`/`openedFile`, `<FileViewer>` 부분, 메뉴의 👁️ 열기, 파일 이름 버튼의 `openFile`)
3. `server/src/modules/drive/content.routes.js` 삭제, `drive.routes.js` 의 `[편집기 시험판 A]` 3줄(import, `X-File-Version`, `router.use`) 삭제
4. `cd client && npm uninstall @fortune-sheet/react @corbe30/fortune-excel pdfjs-dist react-filerobot-image-editor react-konva styled-components docx-preview pptx-preview`
5. DB 는 바꾼 것이 없음 (`file_activity` 에 `edit` 기록만 남음)
- `client/src/index.css` 의 `html:root { color-scheme: light; }` 는 남겨도 됨 (다크 모드 PC에서 버튼이 어둡게 바뀌는 것 막음)
