import { createContext, useContext } from 'react';

// 로그인 상태를 담는 통로. 값은 AuthProvider(AuthContext.jsx)가 넣어 준다.
export const AuthContext = createContext(null);

// 어느 컴포넌트에서든 const { user, login, logout } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
