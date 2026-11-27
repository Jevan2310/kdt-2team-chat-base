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

## 화면

| 넓은 화면 (768px 이상) | 좁은 화면 (모바일) |
|---|---|
| 왼쪽 방 목록 + 오른쪽 대화 | 방 목록 ↔ 대화를 바꿔 보여 줌 (← 로 목록) |

- 메시지: 내 글은 오른쪽(파란색), 남의 글은 왼쪽(이름·부서), 입장·퇴장 안내는 가운데
- 메시지 옆 노란 숫자 = 아직 안 읽은 사람 수, 방 목록·상단 메뉴 빨간 배지 = 안 읽은 메시지 수
- 다른 방에 새 메시지가 오면 오른쪽 아래 알림 (누르면 그 방으로)

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
  src/pages/            화면 단위 (로그인, 가입, 채팅 틀 ChatLayout, 채팅방)
  src/components/rooms/ 방 목록 사이드바
  src/components/messages/  메시지 목록·입력, 종류별 메시지 그리기(MessageItem)
  src/features/         추가 기능 화면을 기능별 폴더로
  src/lib/api.js        REST API 호출 도우미
  src/lib/socket.js     소켓 연결 (앱 전체에서 하나)
  src/auth/             로그인 상태(AuthProvider, useAuth), 로그인 필요한 화면 보호(RequireAuth)
  src/notifications/    안 읽은 개수(UnreadProvider, useUnread), 새 메시지 토스트
server/                 Express + Socket.IO (localhost:3000)
  src/modules/<기능>/   기능별 API (health, auth, rooms, messages …)
  src/middleware/       requireAuth (로그인 확인)
  scripts/              테스트 데이터 스크립트
  src/socket/           소켓 이벤트 (io.js: API 코드에서도 소켓 알림을 보낼 때)
  src/db.js             MySQL 연결 풀
db/schema.sql           테이블 (⚠️ 실행하면 기존 데이터 삭제)
db/seed.sql             기본 데이터 (기본 채팅방 2개)
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

### 3) 서버
```bash
cd server
cp .env.example .env      # Windows: copy .env.example .env
# .env 의 DB_USER / DB_PASSWORD 를 내 MySQL 계정으로 고친다 (root 써도 됨)
npm install
npm run seed:users        # 테스트 계정 3개 (아래 표)
npm run dev               # http://localhost:3000/api/health
```

| 테스트 계정 | 비밀번호 | 이름 · 부서 |
|---|---|---|
| `test1` | `test1234` | 김테스트 · 개발팀 |
| `test2` | `test1234` | 이테스트 · 디자인팀 |
| `test3` | `test1234` | 박테스트 · 인사팀 |

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
| DB ❌ `ER_BAD_DB_ERROR` / `ER_NO_SUCH_TABLE` | `db/schema.sql`을 실행했는지 |
| 서버 ❌ `요청 실패 (500/504)` | 서버(`npm run dev`)가 켜져 있는지, 포트 3000 |
| 소켓이 계속 "연결 중…" | 서버가 켜져 있는지, 화면을 5173으로 열었는지 |
| 소켓 ❌ `unauthorized` | 로그인 토큰이 없거나 만료 → 로그아웃 후 다시 로그인 |
| 서버를 다시 켜면 모두 로그아웃됨 | `.env`의 `JWT_SECRET`이 없거나 바뀜 → 값을 채워 고정 |
