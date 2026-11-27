import mysql from 'mysql2/promise';
import { config } from './config.js';

// 연결을 미리 몇 개 만들어 두고 돌려 쓰는 "풀". 요청마다 새로 연결하지 않아 빠르다.
export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  dateStrings: true, // DATETIME을 문자열 그대로 받는다 (시간대 변환 혼란 방지)
});
