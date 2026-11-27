import { useCallback, useEffect, useState } from 'react';
import { AuthContext } from './useAuth.js';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';

const TOKEN_KEY = 'chat.token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 저장이 막힌 브라우저(시크릿 모드 등)면 새로고침 때 로그인이 풀린다
  }
}

// 로그인 상태(토큰·사용자)를 앱 전체에 나눠 준다. 소켓 연결도 로그인 상태를 따라간다.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(readToken())); // 저장된 토큰이 있으면 확인하는 동안 로딩

  // 새로고침 후: 저장된 토큰으로 내 정보 다시 받기
  useEffect(() => {
    if (!token || user) return;
    api('/auth/me', { token })
      .then((data) => setUser(data.user))
      .catch(() => {
        writeToken(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token, user]);

  // 로그인돼 있으면 소켓 연결, 로그아웃하면 끊기
  useEffect(() => {
    if (!token) return;
    socket.auth = { token };
    socket.connect();
    return () => socket.disconnect();
  }, [token]);

  const saveLogin = useCallback((data) => {
    writeToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setLoading(false);
  }, []);

  const login = useCallback(
    async (username, password) => saveLogin(await api('/auth/login', { method: 'POST', body: { username, password } })),
    [saveLogin],
  );

  const signup = useCallback(
    async (form) => saveLogin(await api('/auth/signup', { method: 'POST', body: form })),
    [saveLogin],
  );

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
