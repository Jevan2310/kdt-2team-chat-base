// 아주 단순한 "시간 창" 횟수 제한 (서버 한 대라 메모리에 둔다. 서버를 다시 켜면 초기화)
// 예: 15분 안에 10번 틀리면 막기
export function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key → { count, resetAt }

  const entry = (key) => {
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.resetAt <= now) return null;
    return e;
  };

  // 오래된 기록 청소 (메모리가 계속 늘지 않게). unref: 이 타이머 때문에 서버가 안 꺼지는 일 없게
  setInterval(() => {
    const now = Date.now();
    for (const [key, e] of hits) if (e.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return {
    // 막혔으면 남은 초, 아니면 0
    blockedFor(key) {
      const e = entry(key);
      return e && e.count >= max ? Math.ceil((e.resetAt - Date.now()) / 1000) : 0;
    },
    hit(key) {
      const e = entry(key);
      if (e) e.count += 1;
      else hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

// 429 응답 (몇 분 뒤에 다시 하면 되는지 같이 알려 줌)
export function tooMany(res, seconds, what) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ message: `${what} 시도가 너무 많아요. ${minutes}분 뒤에 다시 해 주세요.` });
}
