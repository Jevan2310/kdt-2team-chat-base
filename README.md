# 사내 채팅 — 필수 기능 베이스

KDT 풀스택 4회차 기본 프로젝트 2팀 · 주제: **실시간 채팅 웹 애플리케이션** (회사에서 쓰는 채팅)

과업표의 **필수 기능**(사용자 인증·채팅룸 생성 / 실시간 메시지 / 읽음 표시·알림 / 반응형)을 구현한 베이스예요. 추가 기능(휴가 관리, 챗봇, 주간보고, 회의실 예약 등)은 이 위에 붙일 수 있게 구조를 열어 뒀어요. 필요하면 Fork해서 베이스로 쓰셔도 돼요.

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 폴더 구조, 서버·화면 뼈대, DB 테이블 | ✅ |
| 2 | 회원가입·로그인 (JWT) | ✅ |
| 3 | 채팅방 만들기·목록·입장 | ✅ |
| 4 | 실시간 메시지 + 저장·이전 대화 | ✅ |
| 5 | 읽음 숫자 + 안 읽은 개수 알림 | ✅ |
| 6 | 반응형 화면 | ✅ |
| 7 | 읽음 확인(누가 읽었는지), 메시지 수정·삭제, 반응(이모지), 프로필 동그라미 | ✅ |
| 8 | 내 프로필: 사진 올리기·지우기, 이름·부서 수정 (바꾸면 모두의 화면에 바로 반영) | ✅ |
| 9 | 공유 드라이브 기본: 폴더 트리, 파일 올리기(여러 개·끌어다 놓기)·내려받기·이름 바꾸기·옮기기, 휴지통, 활동 기록 / 부서 목록 | ✅ |
| 10 | 드라이브 권한: 폴더별 보기·편집·관리 (사람·부서·전체), 위 폴더에서 상속·끊기(🔒), 관리자 / 내려받기 서명 주소 | ✅ |

## 화면

**메인 화면은 드라이브, 채팅은 어느 화면에서든 오른쪽 아래 💬 버튼으로 여는 팝업**이에요.

| | 넓은 화면 (768px 이상) | 좁은 화면 (모바일) |
|---|---|---|
| 드라이브 (`/drive`, 첫 화면) | 왼쪽 폴더 트리 + 가운데 파일 목록 | 파일 목록만 (위쪽 경로 › 로 이동) |
| 채팅 팝업 | 오른쪽 아래 380px 창: 방 목록 ↔ 대화 (← 로 목록, — 로 내리기) | 화면 전체로 열림 |

- 채팅 팝업은 페이지를 옮겨도 유지되고, 새로고침해도 열림 상태·보던 방을 기억해요 (브라우저 저장)
- 💬 버튼의 빨간 배지 = 안 읽은 메시지 수, 방 목록의 배지 = 방별 안 읽은 수
- 메시지: 내 글은 오른쪽(파란색), 남의 글은 왼쪽(이름·부서), 입장·퇴장 안내는 가운데
- 메시지 옆 노란 숫자 = 아직 안 읽은 사람 수
- 팝업에 떠 있지 않은 방에 새 메시지가 오면 💬 버튼 위에 알림 (누르면 팝업이 그 방으로 열림)
- 노란 숫자를 누르면 **읽은 사람** 창 (프로필 + 이름·부서)
- **드라이브** (`/drive`): 왼쪽 폴더 트리, 가운데 파일 목록. 파일 이름을 누르면 내려받기, 행을 우클릭(또는 ⋯)하면 내려받기·이름 바꾸기·옮기기·휴지통으로. 파일을 끌어다 놓으면 그 폴더에 올라감 (한 번에 20개, 하나 50MB까지, 실행 파일 금지). 휴지통에서 복원·영구 삭제. **폴더 권한(10단계)**: 내가 볼 수 있는 폴더만 보이고, 등급(보기·편집·관리)에 따라 버튼·메뉴가 달라짐. 관리 권한이 있으면 🔐 권한 설정 창에서 사람·부서·전체에게 등급을 주고, "위 폴더 권한 이어받기"를 끄면 🔒 (그 목록에 있는 사람만). 맨 위 폴더는 관리자만 만듦
- 부서는 목록에서 고름 (회원가입·프로필). 10단계 폴더 권한의 기준
- 상단 오른쪽 내 이름을 누르면 **내 프로필** (`/profile`): 사진 올리기·지우기, 이름·부서 수정. 사진은 화면에서 가운데를 정사각형으로 잘라 256px JPEG로 줄여 올림
- 프로필: 사진이 없으면 이름 첫 글자 + 사람마다 정해진 색 (`components/users/Avatar.jsx`). 같은 사람이 5분 안에 이어 보낸 글은 프로필·이름을 한 번만
- 메시지 메뉴: **PC는 말풍선 우클릭**(그 자리에 뜸), **휴대폰은 탭**(말풍선 아래에 뜸). 반응 6개(👍 ❤️ 😂 😮 😢 🙏) · 읽음 확인 · 복사 · (내 글만) 수정 · 삭제. 다른 곳을 누르거나 Esc·스크롤하면 닫힘. 마우스 왼쪽 클릭은 글자 선택용
- 반응 칩을 누르면 같은 반응 추가/취소
- 움직임: 새 메시지·메뉴·반응·읽은 사람 창·알림이 슬라이드로 나타남, 참여자 목록(👥)은 열고 닫을 때 높이가 부드럽게 바뀜, 채팅 팝업은 아래에서 떠오르고 방 ↔ 목록은 옆으로 밀려 들어옴. 시스템의 "동작 줄이기"를 켜면 효과 없음
- 수정한 글은 "(수정됨)", 지운 글은 "삭제된 메시지예요."로 자리가 남아요

## 기술

| 영역 | 기술 |
|---|---|
| 화면 | React 19 (Vite), React Router, socket.io-client |
| 서버 | Node.js + Express 5 (REST API) |
| 실시간 | Socket.IO (Express와 같은 서버·포트) |
| DB | MySQL 8.4 (mysql2) |
| 로그인 | JWT + bcryptjs (토큰은 브라우저 localStorage에 저장) |

## 폴더 구조

```text
client/                 React 화면 (localhost:5173)
  src/pages/            화면 단위 (드라이브, 로그인, 가입, 프로필, 상태)
  src/chat/             채팅 팝업 (ChatWidget, 방 목록 RoomList, 대화 ChatRoom, 팝업 상태 ChatWidgetProvider)
  src/components/drive/ 드라이브 부품 (폴더 트리, 이름·옮기기 창)
  src/components/common/ 공용 부품 (떠 있는 메뉴 ContextMenu, 가운데 창 Dialog)
  src/components/messages/  메시지 목록·입력, 종류별 메시지 그리기(MessageItem)
  src/features/         추가 기능 화면을 기능별 폴더로
  src/lib/api.js        REST API 호출 도우미
  src/lib/socket.js     소켓 연결 (앱 전체에서 하나)
  src/auth/             로그인 상태(AuthProvider, useAuth), 로그인 필요한 화면 보호(RequireAuth)
  src/notifications/    안 읽은 개수(UnreadProvider, useUnread), 새 메시지 토스트
server/                 Express + Socket.IO (localhost:3000)
  src/modules/<기능>/   기능별 API (health, auth, rooms, messages …)
  src/middleware/       requireAuth (로그인 확인)
  uploads/              올린 파일 (프로필 사진). GitHub에 올리지 않음, 처음 올릴 때 자동으로 생김
  storage/files/        드라이브 파일 (무작위 이름). GitHub에 올리지 않음, 주소로 바로 열 수 없고 API로만 내려받음
  scripts/              테스트 데이터 스크립트
  src/socket/           소켓 이벤트 (io.js: API 코드에서도 소켓 알림을 보낼 때)
  src/db.js             MySQL 연결 풀
db/schema.sql           테이블 (⚠️ 실행하면 기존 데이터 삭제)
db/seed.sql             기본 데이터 (기본 채팅방 2개)
db/migrations/          이미 만든 DB에 바뀐 점만 반영 (데이터 유지, npm run db:migrate 로 실행)
docs/                   API·소켓 이벤트 약속 문서 → [REST API](docs/REST-API.md), [소켓 이벤트](docs/소켓-이벤트.md)
```

## 실행 방법

### 1) 준비물
- Node.js 20 이상
- MySQL 8.4 (수업 때 설치한 것) + DBeaver (선택)

### 2) DB 만들기
DBeaver에서 `db/schema.sql` → `db/seed.sql` 순서로 전체 실행하거나, 터미널에서:

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql
```

**이미 DB를 쓰고 있다면** (`schema.sql`을 다시 실행하면 데이터가 지워지니 하지 말고) 서버 폴더에서:

```bash
cd server
npm run db:migrate -- --status   # 무엇을 했고 무엇이 남았는지
npm run db:migrate               # 아직 안 한 DB 변경만 번호 순서대로 실행 (데이터 유지)
```

> 예전에 `db/migrations/` 파일을 **손으로** 실행했다면 기록이 없어서 다시 실행하려다 실패해요 (안내 문구가 나옴). 그때는 손으로 한 마지막 번호까지 "한 것"으로 표시만 하세요: `npm run db:migrate -- --baseline 009`

### 3) 서버
```bash
cd server
cp .env.example .env      # Windows: copy .env.example .env
# .env 의 DB_USER / DB_PASSWORD 를 내 MySQL 계정으로 고친다 (root 써도 됨)
npm install
npm run seed:users        # 테스트 계정 4개 (아래 표)
npm run dev               # http://localhost:3000/api/health
```

| 테스트 계정 | 비밀번호 | 이름 · 부서 | 드라이브에서 |
|---|---|---|---|
| `test1` | `test1234` | 김테스트 · 개발팀 | 개발팀 폴더 **관리** (팀장 역할), 공통 보기 |
| `test2` | `test1234` | 이테스트 · 디자인팀 | 디자인팀 편집, 공통 보기 |
| `test3` | `test1234` | 박테스트 · 인사팀 | 인사팀 🔒 편집 (다른 팀은 못 봄), 공통 보기 |
| `admin` | `test1234` | 관리자 · 경영지원팀 | **모든 폴더 관리**, 맨 위 폴더 만들기 |

(개발용 계정이에요. 실제 서비스에서는 쓰지 않아요.)

### 4) 화면 (새 터미널)
```bash
cd client
npm install
npm run dev               # http://localhost:5173
```

첫 화면에 **서버 ✅ / DB ✅**가 보이고, 로그인하면 **소켓 ✅ 연결**까지 보이면 준비 끝이에요.

## 추가 기능 붙이는 법

| 어디 | 어떻게 |
|---|---|
| 서버 API | `server/src/modules/<기능>/` 폴더를 만들고 `app.js`에 `app.use('/api/<기능>', …)` 한 줄 추가 |
| 화면 | `client/src/features/<기능>/` 에 컴포넌트, 필요하면 `App.jsx`에 Route 추가 |
| 새 메시지 종류 | `MessageItem.jsx`의 `RENDERERS` 표에 `type: 컴포넌트` 한 줄 추가 (예: `bot: BotMessage`) |
| DB | 새 테이블은 따로 만들고, 기존 테이블의 **확장 칸**을 활용 |

**확장 칸** (처음부터 넣어 둔 칸)

| 칸 | 지금 | 이렇게 쓸 수 있어요 |
|---|---|---|
| `users.role` | `user` | `admin`(관리자), `bot`(챗봇 계정) |
| `users.department` | 부서 | 부서별 방, 조직도 |
| `rooms.type` | `group` | `direct`(1:1), `notice`(공지방) |
| `messages.type` + `metadata` | `text` | `vacation`(휴가 신청 카드), `report`(주간보고), `reservation`(회의실 예약) — 추가 데이터는 `metadata` JSON에 |

## 자주 나는 오류

| 증상 | 확인할 것 |
|---|---|
| DB ❌ `ER_ACCESS_DENIED_ERROR` | `server/.env`의 DB 사용자·비밀번호 |
| 서버가 `JWT_SECRET … 넣어 주세요`로 안 켜짐 | `server/.env`에 `JWT_SECRET`(16자 이상 아무 긴 문자열)이 있는지 — 없으면 일부러 안 켜짐 (로그인 위조 방지) |
| 로그인할 때 `로그인 시도가 너무 많아요` (429) | 15분 안에 같은 아이디로 10번(같은 곳 전체 50번) 틀림 → 기다리거나, 개발 중이면 서버를 다시 켜면 초기화 |
| DB ❌ `Unknown column` / `doesn't exist` (기능을 새로 받은 뒤) | `cd server && npm run db:migrate` 로 DB 변경 반영 |
| DB ❌ `ER_BAD_DB_ERROR` / `ER_NO_SUCH_TABLE` | `db/schema.sql`을 실행했는지 |
| 서버 ❌ `요청 실패 (500/504)` | 서버(`npm run dev`)가 켜져 있는지, 포트 3000 |
| 소켓이 계속 "연결 중…" | 서버가 켜져 있는지, 화면을 5173으로 열었는지 |
| 소켓 ❌ `unauthorized` | 로그인 토큰이 없거나 만료 → 로그아웃 후 다시 로그인 |
| 서버를 다시 켜면 모두 로그아웃됨 | `.env`의 `JWT_SECRET`이 없거나 바뀜 → 값을 채워 고정 |
