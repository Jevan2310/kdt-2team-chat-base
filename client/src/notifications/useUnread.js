import { createContext, useContext } from 'react';

// 방별 안 읽은 개수 + 알림 토스트. 값은 UnreadProvider 가 넣어 준다.
export const UnreadContext = createContext(null);

export function useUnread() {
  return useContext(UnreadContext);
}
