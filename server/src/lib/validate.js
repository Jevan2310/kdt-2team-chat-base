// 주소·쿼리·소켓으로 들어온 값을 숫자로 바꿀 때 쓰는 공통 검사.
// Number('1.5'), Number('1e400') 같은 값이 SQL 에 그대로 들어가 오류(500)가 나지 않게 한다.

// 양의 정수 id → 숫자, 아니면 null
export function toId(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// 범위 안의 정수 → 숫자, 비었거나 잘못됐으면 fallback
export function toIntInRange(value, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
