import { Outlet, useParams } from 'react-router-dom';
import RoomSidebar from '../components/rooms/RoomSidebar.jsx';

// 채팅 화면 틀
// - PC(넓은 화면): 왼쪽 방 목록 + 오른쪽 대화
// - 모바일(좁은 화면): 방을 안 열었으면 목록만, 열었으면 대화만 (← 로 목록 돌아가기)
export default function ChatLayout() {
  const { roomId } = useParams();
  return (
    <div className={`chat-layout ${roomId ? 'room-open' : ''}`}>
      <aside className="chat-sidebar">
        <RoomSidebar />
      </aside>
      <section className="chat-pane">
        <Outlet />
      </section>
    </div>
  );
}

export function NoRoomSelected() {
  return (
    <div className="no-room">
      <p>💬</p>
      <p>왼쪽에서 채팅방을 고르거나 새로 만들어 보세요.</p>
    </div>
  );
}
