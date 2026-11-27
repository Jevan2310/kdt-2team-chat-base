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
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
};
