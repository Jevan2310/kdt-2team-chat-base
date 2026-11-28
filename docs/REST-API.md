# REST API

- 주소 앞부분: `/api` (화면에서는 `api('/auth/login', …)`처럼 `/api` 뒤만 쓴다)
- 로그인이 필요한 API는 헤더 `Authorization: Bearer <토큰>`
- 오류 응답은 모두 `{ "message": "사람이 읽는 설명" }`

| 메서드 | 주소 | 로그인 | 보내는 값 | 받는 값 | 오류 |
|---|---|---|---|---|---|
| GET | `/api/health` | — | — | `{ ok, db, rooms, time }` | 503 `{ ok: false, db: false, message }` (오류 내용은 서버 로그에만) |
| POST | `/api/auth/signup` | — | `{ username, password, nickname, department? }` | `201 { token, user }` | 400 입력 규칙, 409 아이디 중복 |
| POST | `/api/auth/login` | — | `{ username, password }` | `{ token, user }` | 401 아이디·비밀번호 틀림 |
| GET | `/api/auth/me` | ✅ | — | `{ user }` | 401 토큰 없음·만료 (화면은 401 일 때만 로그아웃, 500·네트워크 오류면 3초 뒤 다시 시도) |
| PATCH | `/api/users/me` | ✅ | `{ nickname?, department? }` 보낸 칸만 바뀜 (`department: null` = 부서 없음) | `{ user }` + 소켓 `user:updated` | 400 입력 규칙·바꿀 내용 없음 |
| PUT | `/api/users/me/avatar` | ✅ | 본문 = 이미지 파일 그대로, `Content-Type: image/jpeg \| image/png \| image/webp` (2MB 이하) | `{ user }` + 소켓 `user:updated` | 400 사진이 아님, 413 너무 큼 |
| DELETE | `/api/users/me/avatar` | ✅ | — | `{ user }` (`avatarUrl: null`) + 소켓 `user:updated` | — |
| GET | `/api/departments` | — | — | `{ departments: [{ id, name }] }` | — |
| GET | `/api/rooms` | ✅ | — | `{ rooms: [{ id, name, type, createdAt, memberCount, joined, unreadCount }] }` | — |
| POST | `/api/rooms` | ✅ | `{ name }` (1~30자) | `201 { room }` + 소켓 `room:created` | 400 이름 규칙 |
| GET | `/api/rooms/:roomId` | ✅ | — | `{ room, members: [{ id, nickname, department, role, avatarUrl, joinedAt, lastReadMessageId }], joined }` | 404 없는 방 |
| POST | `/api/rooms/:roomId/join` | ✅ | — | `{ joined: true, isNew }` + 처음이면 소켓 `room:members` | 404 |
| POST | `/api/rooms/:roomId/leave` | ✅ | — | `{ left }` + 소켓 `room:members` | 404 |
| GET | `/api/rooms/:roomId/messages?before=&after=&limit=` | ✅ 참여자만 | `before`: 이 id보다 이전 (이전 대화 불러오기) / `after`: 이 id보다 뒤 (다시 연결됐을 때 빈틈 채우기) / 둘 다 없으면 최근. `limit` 1~100 (기본 50). 정수가 아닌 값은 무시 | `{ messages, hasMore }` (오래된 것 → 최근 순) | 403 참여 안 함, 404 |

## user 모양

```json
{ "id": 1, "username": "test1", "nickname": "김테스트", "department": "개발팀", "role": "user",
  "avatarUrl": "/uploads/avatars/1-3f9a0c2b7d1e.jpg", "createdAt": "2026-11-27 12:56:34" }
```

## 입력 규칙
- `username`: 영어 소문자·숫자·`_` 4~20자, 중복 불가
- `password`: 6자 이상 (DB에는 bcrypt로 암호화해서 저장)
- `nickname`: 1~20자 · `department`: 선택, 50자 이하 (회원가입·프로필 수정 공통, `modules/users/users.rules.js`)

## 공유 드라이브 API (9단계, 모두 로그인 필요)

| 메서드 | 주소 | 보내는 값 | 받는 값 | 오류 |
|---|---|---|---|---|
| GET | `/api/drive/tree` | — | `{ folders: [{ id, parentId, name }] }` (휴지통·휴지통 안 폴더 제외) | — |
| GET | `/api/drive/folders/:id/contents` | `:id` = 폴더 id 또는 `root` | `{ folder, path: [{ id, name }], folders, files }` (맨 위에는 폴더만) | 404 |
| POST | `/api/drive/folders` | `{ parentId: null\|id, name }` (1~100자, `/ \` 금지, 같은 위치 같은 이름 금지) | `201 { folder }` | 400 이름 규칙, 404 위 폴더 없음, 409 이름 겹침 |
| PATCH | `/api/drive/folders/:id` | `{ name?, parentId? }` (`parentId: null` = 맨 위로) | `{ folder }` | 400 자기 안으로 옮기기, 404, 409 이름 겹침 |
| DELETE | `/api/drive/folders/:id` | — | `{ ok }` → 휴지통 (아래 폴더·파일도 같이 숨겨짐) | 404 |
| POST | `/api/drive/folders/:id/files` | multipart, 칸 이름 `files` (최대 20개, 하나 50MB) | `201 { files: [{ id, name, size }] }` | 400 실행 파일, 404 폴더 없음(올리는 중 휴지통 포함, 이미 쓴 파일은 지움), 413 너무 큼 |
| GET | `/api/drive/files/:id/download` | — | 파일 (`Content-Disposition: attachment`, `application/octet-stream`, `nosniff`). 다 보낸 뒤에 기록 | 404 (DB에도 디스크에도 없으면) |
| PATCH | `/api/drive/files/:id` | `{ name?, folderId? }` | `{ file }` | 400 이름 규칙·실행 파일 확장자로 바꾸기, 404 |
| DELETE | `/api/drive/files/:id` | — | `{ ok }` → 휴지통 | 404 |
| GET | `/api/drive/trash` | — | `{ folders, files }` (직접 지운 것만, `from` = 원래 위치) | — |
| POST | `/api/drive/trash/folders\|files/:id/restore` | — | `{ ok }` | 409 위 폴더가 휴지통에 있음·이름 겹침 |
| DELETE | `/api/drive/trash/folders\|files/:id` | — | `{ ok }` 영구 삭제 (폴더면 아래 전부, 디스크 파일까지) | 404 휴지통에 없음 |

- file 모양: `{ id, folderId, name, mimeType, size, createdAt, updatedAt, uploadedBy: { id, nickname } }`
- 바뀔 때마다 소켓 `drive:changed` → 화면이 다시 불러옴
- 모든 동작은 `file_activity` 표에 기록 (누가, 무엇을, 언제)
- 파일은 `server/storage/files/<무작위 32자>`에 저장하고 원래 이름은 DB에만 둔다
- 실행 파일(exe·msi·bat·cmd·ps1·vbs·js·hta·lnk·reg·jar·apk·dmg·sh 등)은 **올리기와 이름 바꾸기 둘 다** 막는다. 끝의 점·공백은 지운다(`a.exe.` 우회 방지), 이름은 NFC로 맞춘다
- 폴더 트리를 바꾸는 작업(만들기·옮기기·휴지통·복원·영구 삭제)은 DB 이름 잠금(`GET_LOCK`)으로 한 번에 하나씩 → 이름 중복·순환 방지
- 영구 삭제는 파일 → 가장 깊은 폴더부터 한 단계씩 지운다 (MySQL CASCADE 15단계 제한 때문)
- 10단계에서 모든 주소에 폴더 권한 확인이 들어간다

## 프로필 사진 규칙
- `avatarUrl`: 없으면 `null` → 화면은 이름 첫 글자 + id별 색으로 그림
- 서버는 파일 앞부분(매직 넘버)으로 JPG·PNG·WEBP인지 확인한다. 파일 이름·`Content-Type`은 믿지 않는다
- 파일 이름은 서버가 정한다 (`<사용자 id>-<무작위>.jpg`). 바꿀 때마다 주소가 달라져 브라우저 캐시 문제가 없고, 예전 파일은 지운다
- 저장 위치 `server/uploads/avatars/`, 주소 `/uploads/avatars/…` (개발 중엔 Vite 프록시가 서버로 넘김). `X-Content-Type-Options: nosniff`로 내려준다

## message 모양

```json
{
  "id": 3, "roomId": 2, "type": "text", "content": "안녕하세요 👋", "metadata": null,
  "createdAt": "2026-11-27 13:19:58",
  "editedAt": null, "deletedAt": null,
  "reactions": [{ "emoji": "👍", "userIds": [2, 3] }],
  "user": { "id": 1, "nickname": "김테스트", "department": "개발팀", "role": "user", "avatarUrl": null }
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
- **안 읽은 개수** (방 목록 배지) = 내 책갈피보다 뒤에 온, 남이 보낸 일반 메시지 수 (`system`·지운 글 제외, 보낸 사람이 탈퇴한 글은 포함)
- **메시지 옆 숫자** (카톡식) = 보낸 사람을 뺀 참여자 중 책갈피가 그 메시지보다 앞인 사람 수 → 화면에서 `members`로 계산
- 처음 참여하면 책갈피 = 그 방의 마지막 메시지 → 들어오기 전 메시지는 "안 읽음"으로 세지 않음
- 메시지를 보내면 보낸 사람의 책갈피도 그 메시지로 이동
- **읽은 사람 창** = 보낸 사람을 뺀 참여자 중 책갈피가 그 메시지 이상인 사람. 메시지가 온 뒤 들어온 사람(`joinedAt`이 더 늦음)은 뺀다 (서버 요청 없이 화면의 `members`로 계산)
