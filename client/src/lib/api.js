// 서버 REST API 호출 도우미. 주소는 /api/... 만 쓰면 Vite 프록시가 서버로 넘겨 준다.
export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `요청 실패 (${res.status})`);
  return data;
}
