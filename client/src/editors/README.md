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

## 화면 (VS Code 처럼)
- 왼쪽 **탐색기**: 폴더와 파일을 한 나무로. 폴더를 펼치면 그 폴더 파일만 받아 옴. 너비 조절(경계선 끌기)
  - 위 버튼: ＋📁 새 폴더 · ⬆ 올리기(고른 폴더에) · ⟳ 새로 고침 · ⊟ 모두 접기
  - 우클릭/⋯ 메뉴: 폴더 = 새 폴더·올리기·이름·옮기기·권한·휴지통 / 파일 = 열기·오른쪽에 열기·내려받기·이름·옮기기·휴지통
  - 컴퓨터의 파일을 폴더 줄에 끌어다 놓으면 그 폴더에 올리기
- 가운데 **편집 칸**: 파일 목록 없이 연 파일만. 탭 여러 개, 칸은 좌우·위아래로 최대 6개
  - 나누기: 탭 바 ▥(오른쪽)·▤(아래) · Ctrl+\ (오른쪽)·Ctrl+Shift+\ (아래) · Ctrl(⌘)/Alt+클릭 (오른쪽) · 탭이나 트리 파일을 칸의 위·아래·왼쪽·오른쪽 끝(25%)에 놓기
  - 칸 사이 경계선을 끌어 너비·높이 조절 (너무 작아지지 않게 최소 크기에서 멈춤)
  - 탭 끌어서 다른 칸으로 옮기기·순서 바꾸기, 가운데 클릭으로 닫기, 우클릭 메뉴(닫기·다른 탭 닫기·오른쪽에 열기·아래에 열기)
  - 저장 안 한 탭은 ● 표시, 닫을 때 확인. 저장 안 한 탭은 다른 칸으로 못 옮김(내용 사라짐 방지)
  - 열어 둔 탭·칸·너비는 사람별로 브라우저에 기억 (새로 고침해도 그대로)
  - 휴지통도 탭으로 열림
- 휴대폰: 탐색기와 편집 칸 중 하나만 (☰ 로 탐색기), 칸 나누기 없음

## 구조
- `registry.js` — 확장자 → 편집기. 각 편집기는 처음 열 때만 내려받는다 (드라이브 첫 화면은 가벼움)
- `useEditorLayout.js` — 칸·탭 배치 상태 (열기·닫기·옮기기·나누기·크기) + 브라우저에 기억. 칸 모양은 나무 구조(`tree`: 좌우 묶음 안에 위아래 묶음 …), 칸 목록(`groups`)은 따로
  - 칸은 모두 한 부모 안에 절대 위치(%)로 그림 → 나누거나 합쳐도 편집기가 새로 만들어지지 않아 고치던 내용이 그대로
- `shortcuts.js` — ⌘S·⌘\ 알아보기. 한글 입력 상태에서도 되게 키 이름(e.key) 대신 키 자리(e.code)로 봄
- `EditorArea.jsx` — 칸·탭 화면, 끌어다 놓기, 경계선 끌기, 저장 안 한 탭 닫기 확인
- `FileViewer.jsx` — 탭 하나의 내용: 열기(서명 주소), 저장(Ctrl+S, 보고 있는 탭만), 보기 전용 표시, 다른 사람이 저장하면 알림(새 내용 불러오기), 미리보기 없는 형식은 정보+내려받기, 편집기 오류 막기
- 왼쪽 탐색기: `components/drive/Explorer.jsx`, 휴지통 탭: `components/drive/TrashView.jsx`
- 편집기 약속: props `blob, file, readOnly, saverRef, onDirty` — 고치면 `onDirty()`, `saverRef.current = async () => Blob`
- 서버: `server/src/modules/drive/content.routes.js` — `PUT /api/drive/files/:id/content` (편집 권한, 판 확인으로 덮어쓰기 방지, DB 바뀜 없음)

## 알려진 한계 (시험하면서 확인할 것)
- 엑셀: 피벗·매크로·차트 등 복잡한 서식은 빠지거나 바뀔 수 있음. 계산값이 저장 안 된 수식(엑셀 말고 다른 프로그램이 만든 파일)은 열 때 빈칸 → 그 줄을 고치면 계산됨
- 워드·PPT: 보기만. 원래 모양과 다르게 보일 수 있음 (특히 PPT)
- 버전 기록 없음: 저장하면 예전 내용은 지워진다 (정식으로 가면 `file_versions` 표로 보관)
- 동시 편집 없음: 두 사람이 같은 파일을 열면 먼저 저장한 사람만 저장되고, 늦은 사람은 "다른 사람이 먼저 저장했어요" (409)
- pptx-preview 가 쓰는 echarts·uuid 에 npm audit 보통(moderate) 경고가 있음

## 끄기 (코드는 그대로)
`client/.env.local` 에 `VITE_EDITORS=off` → 탭에서 파일 정보 + 내려받기만 (편집기 라이브러리를 안 부름). 탐색기·탭·나누기는 그대로.

## 버리기
브랜치째 버리면 끝: `git switch main && git branch -D try/editor-a` (main 에는 아무것도 안 들어가 있음)
- 주의: 이 브랜치에는 **탐색기(파일까지 보이는 트리)·탭·화면 나누기**도 들어 있어서 같이 사라진다. 편집기만 버리고 화면 구조는 남기려면 `VITE_EDITORS=off` 로 끄거나, 아래 4번(패키지)·편집기 파일만 지우고 `registry.js` 의 KINDS 를 비운다

main 에 합친 뒤에 버린다면:
1. `client/src/editors/` 폴더 삭제
2. `client/src/pages/DrivePage.jsx`·`components/drive/Explorer.jsx`·`TrashView.jsx` 를 main 의 것으로 되돌리기 (`git checkout main -- client/src/pages/DrivePage.jsx client/src/components/drive client/src/index.css`) — 화면 구조 전체가 예전(가운데 파일 목록)으로 돌아감
3. `server/src/modules/drive/content.routes.js` 삭제, `drive.routes.js` 의 `[편집기 시험판 A]` 3줄(import, `X-File-Version`, `router.use`) 삭제
4. `cd client && npm uninstall @fortune-sheet/react @corbe30/fortune-excel pdfjs-dist react-filerobot-image-editor react-konva styled-components docx-preview pptx-preview`
5. DB 는 바꾼 것이 없음 (`file_activity` 에 `edit` 기록만 남음)
- `client/src/index.css` 의 `html:root { color-scheme: light; }` 는 남겨도 됨 (다크 모드 PC에서 버튼이 어둡게 바뀌는 것 막음)
