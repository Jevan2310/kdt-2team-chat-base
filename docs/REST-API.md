# REST API

- 주소 앞부분: `/api` (화면에서는 `api('/auth/login', …)`처럼 `/api` 뒤만 쓴다)
- 로그인이 필요한 API는 헤더 `Authorization: Bearer <토큰>`
- 오류 응답은 모두 `{ "message": "사람이 읽는 설명" }`

| 메서드 | 주소 | 로그인 | 보내는 값 | 받는 값 | 오류 |
|---|---|---|---|---|---|
| GET | `/api/health` | — | — | `{ ok, db, rooms, time }` | — |
| POST | `/api/auth/signup` | — | `{ username, password, nickname, department? }` | `201 { token, user }` | 400 입력 규칙, 409 아이디 중복 |
| POST | `/api/auth/login` | — | `{ username, password }` | `{ token, user }` | 401 아이디·비밀번호 틀림 |
| GET | `/api/auth/me` | ✅ | — | `{ user }` | 401 토큰 없음·만료 |
| GET | `/api/rooms` | ✅ | — | `{ rooms: [{ id, name, type, createdAt, memberCount, joined }] }` | — |
| POST | `/api/rooms` | ✅ | `{ name }` (1~30자) | `201 { room }` + 소켓 `room:created` | 400 이름 규칙 |
| GET | `/api/rooms/:roomId` | ✅ | — | `{ room, members: [{ id, nickname, department, role, joinedAt }], joined }` | 404 없는 방 |
| POST | `/api/rooms/:roomId/join` | ✅ | — | `{ joined: true, isNew }` + 처음이면 소켓 `room:members` | 404 |
| POST | `/api/rooms/:roomId/leave` | ✅ | — | `{ left }` + 소켓 `room:members` | 404 |

## user 모양

```json
{ "id": 1, "username": "test1", "nickname": "김테스트", "department": "개발팀", "role": "user", "createdAt": "2026-11-27 12:56:34" }
```

## 입력 규칙
- `username`: 영어 소문자·숫자·`_` 4~20자, 중복 불가
- `password`: 6자 이상 (DB에는 bcrypt로 암호화해서 저장)
- `nickname`: 1~20자 · `department`: 선택, 50자 이하

## 채팅방 규칙
- 지금은 공개 그룹 방(`type = 'group'`)만 있어요. 목록에 모든 그룹 방이 보이고, 방에 들어가면 자동으로 참여돼요.
- 방을 만든 사람은 자동으로 참여해요 (방 만들기 + 참여를 트랜잭션으로 묶음).
