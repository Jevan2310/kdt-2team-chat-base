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

  const [retry, setRetry] = useState(0); // 서버·네트워크 문제로 내 정보를 못 받았을 때 다시 시도한 횟수

  // 새로고침 후: 저장된 토큰으로 내 정보 다시 받기
  // 토큰이 틀렸거나 만료(401)일 때만 로그아웃. 서버가 잠깐 꺼졌거나 네트워크 문제면 로그인을 유지한 채 3초 뒤 다시 시도
  useEffect(() => {
    if (!token || user) return;
    let timer;
    api('/auth/me', { token })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          writeToken(null);
          setToken(null);
          setLoading(false);
        } else {
          timer = setTimeout(() => setRetry((n) => n + 1), 3000);
        }
      });
    return () => clearTimeout(timer);
  }, [token, user, retry]);

  // 로그인돼 있으면 소켓 연결, 로그아웃하면 끊기
  useEffect(() => {
    if (!token) return;
    socket.auth = { token };
    socket.connect();
    // 서버가 연결을 거절했을 때: 토큰 문제면 로그아웃, 서버 문제(server_busy)면 3초 뒤 다시 연결
    // (네트워크가 끊긴 경우는 socket.io 가 알아서 다시 연결한다)
    let timer;
    const onConnectError = (err) => {
      if (err.message === 'unauthorized') {
        writeToken(null);
        setToken(null);
        setUser(null);
      } else if (!socket.active) {
        timer = setTimeout(() => socket.connect(), 3000);
      }
    };
    socket.on('connect_error', onConnectError);
    return () => {
      clearTimeout(timer);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
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

  // 프로필을 바꿨을 때 (이 탭에서)
  const updateUser = useCallback((next) => setUser((prev) => (prev ? { ...prev, ...next } : prev)), []);

  // 다른 탭·기기에서 내 프로필을 바꿨을 때도 맞춘다
  const myId = user?.id;
  useEffect(() => {
    if (!myId) return;
    const onUserUpdated = (changed) => {
      if (changed.id === myId) updateUser(changed);
    };
    socket.on('user:updated', onUserUpdated);
    return () => socket.off('user:updated', onUserUpdated);
  }, [myId, updateUser]);

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
