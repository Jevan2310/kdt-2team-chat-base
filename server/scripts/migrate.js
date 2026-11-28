// DB 변경 파일(db/migrations/*.sql) 중 아직 안 한 것만 번호 순서대로 실행하고 기록한다.
//   npm run db:migrate                  아직 안 한 것 실행
//   npm run db:migrate -- --status      무엇을 했고 무엇이 남았는지 보기
//   npm run db:migrate -- --baseline 009  009 까지는 (예전에 손으로 실행해서) 이미 한 것으로 표시만
// 기록은 DB 의 schema_migrations 표에 남는다. 새로 설치(schema.sql)하면 그때까지의 파일은 이미 한 것으로 들어 있다.
import { readdirSync, readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const DIR = new URL('../../db/migrations/', import.meta.url);
const args = process.argv.slice(2);

// server/.env 와 같은 값 (src/config.js 와 기본값을 맞춤. JWT 는 필요 없어서 따로 읽는다)
const db = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'team_chat',
  multipleStatements: true, // 파일 하나에 SQL 이 여러 개
};

const files = readdirSync(DIR)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort()
  .map((name) => ({ name, version: name.split('_')[0] }));

let conn;
try {
  conn = await mysql.createConnection(db);
} catch (err) {
  if (err.code === 'ER_BAD_DB_ERROR') console.error(`DB "${db.database}" 가 없어요. 처음이면 db/schema.sql → db/seed.sql 부터 실행해 주세요.`);
  else console.error('DB에 연결하지 못했어요:', err.code ?? err.message, '→ server/.env 의 DB_ 값을 확인해 주세요.');
  process.exit(1);
}

await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const [rows] = await conn.query('SELECT version FROM schema_migrations');
const applied = new Set(rows.map((r) => r.version));
const pending = files.filter((f) => !applied.has(f.version));

if (args[0] === '--status') {
  for (const f of files) console.log(`${applied.has(f.version) ? '✅' : '⏳'} ${f.name}`);
  console.log(pending.length ? `\n남은 것 ${pending.length}개 → npm run db:migrate` : '\n모두 적용됨');
} else if (args[0] === '--baseline') {
  const upto = args[1];
  if (!upto || !files.some((f) => f.version === upto)) {
    console.error('사용법: npm run db:migrate -- --baseline <번호>  (예: 009)');
    process.exit(1);
  }
  const marked = files.filter((f) => f.version <= upto && !applied.has(f.version));
  for (const f of marked) await conn.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [f.version, f.name]);
  console.log(marked.length ? `이미 한 것으로 표시: ${marked.map((f) => f.name).join(', ')}` : '표시할 것이 없어요 (이미 기록돼 있음).');
} else {
  if (!pending.length) console.log('새로 적용할 DB 변경이 없어요.');
  for (const f of pending) {
    // 파일 안의 "USE team_chat;" 은 빼고, .env 의 DB(DB_NAME)에 실행한다
    const sql = readFileSync(new URL(f.name, DIR), 'utf8').replace(/^\s*USE\s+[^;]+;\s*$/gim, '');
    try {
      await conn.query(sql);
    } catch (err) {
      console.error(`❌ ${f.name} 실행 실패: ${err.code ?? ''} ${err.sqlMessage ?? err.message}`);
      if (['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME', 'ER_DUP_ENTRY'].includes(err.code)) {
        console.error(`   예전에 이 파일을 손으로 실행했다면: npm run db:migrate -- --baseline ${f.version}`);
      }
      console.error('   (MySQL 은 표 구조 변경을 되돌리지 못해서, 실패한 파일의 앞부분은 이미 반영됐을 수 있어요)');
      await conn.end();
      process.exit(1);
    }
    await conn.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [f.version, f.name]);
    console.log(`✅ ${f.name}`);
  }
}
await conn.end();
