import { useAuth } from './useAuth.js';
import { ChatWidgetProvider } from '../chat/ChatWidgetProvider.jsx';
import { UnreadProvider } from '../notifications/UnreadProvider.jsx';

// 로그인한 사람마다 따로 가지는 상태(채팅 팝업, 안 읽은 개수·알림).
// 사람이 바뀌면(로그아웃·다른 계정 로그인) key 가 바뀌어 앞사람 상태가 남지 않는다.
export default function PerUser({ children }) {
  const { user } = useAuth();
  const key = user?.id ?? 'guest';
  return (
    <ChatWidgetProvider key={key} userId={user?.id}>
      <UnreadProvider key={key}>{children}</UnreadProvider>
    </ChatWidgetProvider>
  );
}
