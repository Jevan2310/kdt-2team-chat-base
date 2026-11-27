import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './auth/useAuth.js';
import RequireAuth from './auth/RequireAuth.jsx';
import { useUnread } from './notifications/useUnread.js';
import Toasts from './notifications/Toasts.jsx';
import StatusPage from './pages/StatusPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import ChatLayout, { NoRoomSelected } from './pages/ChatLayout.jsx';
import ChatRoomPage from './pages/ChatRoomPage.jsx';

export default function App() {
  const { user, logout } = useAuth();
  const { total } = useUnread();

  return (
    <>
      <nav className="topnav">
        <Link to="/">상태</Link>
        <Link to="/rooms">
          채팅방{total > 0 && <span className="badge-unread" aria-label={`안 읽은 메시지 ${total}개`}>{total > 99 ? '99+' : total}</span>}
        </Link>
        <span className="topnav-right">
          {user ? (
            <>
              <span className="me">
                {user.nickname}
                {user.department && <span className="me-dept"> · {user.department}</span>}
              </span>
              <button type="button" className="link-button" onClick={logout}>로그아웃</button>
            </>
          ) : (
            <>
              <Link to="/login">로그인</Link>
              <Link to="/signup">회원가입</Link>
            </>
          )}
        </span>
      </nav>
      <Routes>
        <Route path="/" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/rooms" element={<RequireAuth><ChatLayout /></RequireAuth>}>
          <Route index element={<NoRoomSelected />} />
          <Route path=":roomId" element={<ChatRoomPage />} />
        </Route>
      </Routes>
      {user && <Toasts />}
    </>
  );
}
