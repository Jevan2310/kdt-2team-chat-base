import { fileURLToPath } from 'node:url';

// 로그인 표(JWT)에 서명하는 비밀 값. 없으면 서버를 켜지 않는다
// (예전처럼 공개된 기본값을 쓰면 누구나 아무 사람으로 로그인 표를 위조할 수 있다)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  throw new Error('server/.env 에 JWT_SECRET(16자 이상 아무 긴 문자열)을 넣어 주세요. → .env.example 참고');
}

// 환경 변수(.env)를 한곳에서 읽는다. 값이 없으면 개발용 기본값을 쓴다.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'team_chat',
  },
  jwtSecret: process.env.JWT_SECRET,
  // 올린 파일(프로필 사진 등)을 저장하는 폴더: server/uploads (GitHub에 올리지 않음)
  uploadsDir: process.env.UPLOADS_DIR ?? fileURLToPath(new URL('../uploads', import.meta.url)),
  // 공유 드라이브 파일 저장 폴더: server/storage/files (GitHub에 올리지 않음, 주소로 바로 열 수 없음)
  storageDir: process.env.STORAGE_DIR ?? fileURLToPath(new URL('../storage/files', import.meta.url)),
  maxFileMb: Number(process.env.MAX_FILE_MB ?? 50), // 드라이브 파일 하나 최대 크기
};
