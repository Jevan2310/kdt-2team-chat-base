import { createContext, useContext } from 'react';

// 오른쪽 아래 채팅 팝업 상태: 열림/닫힘, 보고 있는 방. 값은 ChatWidgetProvider 가 넣어 준다.
export const ChatWidgetContext = createContext(null);

export function useChatWidget() {
  return useContext(ChatWidgetContext);
}
