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

## user 모양

```json
{ "id": 1, "username": "test1", "nickname": "김테스트", "department": "개발팀", "role": "user", "createdAt": "2026-11-27 12:56:34" }
```

## 입력 규칙
- `username`: 영어 소문자·숫자·`_` 4~20자, 중복 불가
- `password`: 6자 이상 (DB에는 bcrypt로 암호화해서 저장)
- `nickname`: 1~20자 · `department`: 선택, 50자 이하
