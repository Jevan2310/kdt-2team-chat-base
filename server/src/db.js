import mysql from 'mysql2/promise';
import { config } from './config.js';

// 연결을 미리 몇 개 만들어 두고 돌려 쓰는 "풀". 요청마다 새로 연결하지 않아 빠르다.
export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  dateStrings: true, // DATETIME을 문자열 그대로 받는다 (시간대 변환 혼란 방지)
});

// 트랜잭션: fn 안의 쿼리가 전부 성공하면 반영(commit), 하나라도 실패하면 전부 취소(rollback)
// fn 은 conn 으로 쿼리해야 같은 트랜잭션에 묶인다.
export async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 이름 붙은 잠금: 같은 이름으로 잠그는 작업은 한 번에 하나씩만 돈다 (동시에 폴더를 옮기다 꼬이는 것 방지)
// 잠금 안에서 트랜잭션을 열고, 반영(commit)한 뒤에 잠금을 푼다.
export async function withLock(name, fn, { timeoutSec = 10 } = {}) {
  const conn = await pool.getConnection();
  try {
    const [[{ ok }]] = await conn.query('SELECT GET_LOCK(?, ?) AS ok', [name, timeoutSec]);
    if (ok !== 1) throw Object.assign(new Error('다른 작업이 끝나기를 기다리다 시간이 지났어요. 다시 시도해 주세요.'), { status: 503 });
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [name]);
    }
  } finally {
    conn.release();
  }
}
