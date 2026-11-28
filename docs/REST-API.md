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
| GET | `/api/rooms` | ✅ | — | `{ rooms: [{ id, name, type, createdAt, memberCount, joined, unreadCount }] }` | — |
| POST | `/api/rooms` | ✅ | `{ name }` (1~30자) | `201 { room }` + 소켓 `room:created` | 400 이름 규칙 |
| GET | `/api/rooms/:roomId` | ✅ | — | `{ room, members: [{ id, nickname, department, role, joinedAt, lastReadMessageId }], joined }` | 404 없는 방 |
| POST | `/api/rooms/:roomId/join` | ✅ | — | `{ joined: true, isNew }` + 처음이면 소켓 `room:members` | 404 |
| POST | `/api/rooms/:roomId/leave` | ✅ | — | `{ left }` + 소켓 `room:members` | 404 |
| GET | `/api/rooms/:roomId/messages?before=&limit=` | ✅ 참여자만 | `before`: 이 메시지 id보다 이전 (없으면 최근), `limit`: 1~100 (기본 50) | `{ messages, hasMore }` (오래된 것 → 최근 순) | 403 참여 안 함, 404 |

## user 모양

```json
{ "id": 1, "username": "test1", "nickname": "김테스트", "department": "개발팀", "role": "user", "createdAt": "2026-11-27 12:56:34" }
```

## 입력 규칙
- `username`: 영어 소문자·숫자·`_` 4~20자, 중복 불가
- `password`: 6자 이상 (DB에는 bcrypt로 암호화해서 저장)
- `nickname`: 1~20자 · `department`: 선택, 50자 이하

## message 모양

```json
{
  "id": 3, "roomId": 2, "type": "text", "content": "안녕하세요 👋", "metadata": null,
  "createdAt": "2026-11-27 13:19:58",
  "editedAt": null, "deletedAt": null,
  "reactions": [{ "emoji": "👍", "userIds": [2, 3] }],
  "user": { "id": 1, "nickname": "김테스트", "department": "개발팀", "role": "user" }
}
```

- `type`: `text` 일반 글, `system` 입장·퇴장 안내 (`user`가 `null`). 확장: `bot`, `vacation` 등 + `metadata`
- `editedAt`: 수정했으면 시각 (화면에 "(수정됨)")
- `deletedAt`: 지웠으면 시각. 이때 `content`는 `""`, `metadata`·`reactions`는 비어 있음 (행은 남겨서 읽음 책갈피·순서가 안 꼬임)
- `reactions`: 반응별로 누른 사람 id, 먼저 누른 순서. 쓸 수 있는 반응은 👍 ❤️ 😂 😮 😢 🙏 (서버 `REACTION_EMOJIS`와 화면 `reactions.js`가 같아야 함)
- 메시지 보내기·수정·삭제·반응은 REST가 아니라 소켓 ([소켓 이벤트](소켓-이벤트.md))

## 채팅방 규칙
- 지금은 공개 그룹 방(`type = 'group'`)만 있어요. 목록에 모든 그룹 방이 보이고, 방에 들어가면 자동으로 참여돼요.
- 방을 만든 사람은 자동으로 참여해요 (방 만들기 + 참여를 트랜잭션으로 묶음).
- 처음 참여하거나 나가면 `system` 메시지("○○님이 들어왔어요.")가 저장되고 방에 전달돼요.

## 읽음·안 읽은 개수 규칙
- 방 참여자마다 **책갈피** `room_members.last_read_message_id` = 어디까지 읽었는지 (메시지 id)
- **안 읽은 개수** (방 목록 배지) = 내 책갈피보다 뒤에 온, 남이 보낸 일반 메시지 수 (`system` 제외)
- **메시지 옆 숫자** (카톡식) = 보낸 사람을 뺀 참여자 중 책갈피가 그 메시지보다 앞인 사람 수 → 화면에서 `members`로 계산
- 처음 참여하면 책갈피 = 그 방의 마지막 메시지 → 들어오기 전 메시지는 "안 읽음"으로 세지 않음
- 메시지를 보내면 보낸 사람의 책갈피도 그 메시지로 이동
- **읽은 사람 창** = 보낸 사람을 뺀 참여자 중 책갈피가 그 메시지 이상인 사람. 메시지가 온 뒤 들어온 사람(`joinedAt`이 더 늦음)은 뺀다 (서버 요청 없이 화면의 `members`로 계산)
