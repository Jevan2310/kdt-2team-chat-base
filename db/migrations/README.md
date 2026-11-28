# DB 변경 파일 (migrations)

이미 쓰고 있는 DB에 **바뀐 점만** 반영하는 SQL 파일들이에요. `schema.sql`은 처음 설치용(실행하면 데이터가 지워짐)이고, 이 폴더는 데이터를 지키면서 고치는 용도예요.

## 실행
```bash
cd server
npm run db:migrate -- --status      # ✅ 한 것 / ⏳ 남은 것
npm run db:migrate                  # 남은 것만 번호 순서대로 실행하고 schema_migrations 표에 기록
npm run db:migrate -- --baseline 009  # (예전에 손으로 실행했던 경우) 009 까지는 한 것으로 표시만
```

## 새 변경 파일을 만들 때 (규칙)
1. 이름: `<다음 번호 3자리>_<설명>.sql` (예: `010_폴더_권한.sql`)
2. 맨 위에 `USE team_chat;` (DBeaver에서 손으로 실행할 때용. `db:migrate`는 이 줄을 빼고 .env 의 DB에 실행)
3. **`db/schema.sql`에도 같은 내용을 반영**하고, 맨 아래 `schema_migrations` INSERT 에 그 번호를 한 줄 추가
   → 새로 설치한 DB와, 예전 DB를 올린 결과가 똑같아야 해요
4. MySQL 은 표 구조 변경(ALTER·CREATE)을 되돌리지 못해요. 한 파일은 작게, 실패해도 다시 고쳐 실행하기 쉽게 쓰기
