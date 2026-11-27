import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './auth/useAuth.js';
import RequireAuth from './auth/RequireAuth.jsx';
import StatusPage from './pages/StatusPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import RoomListPage from './pages/RoomListPage.jsx';
import ChatRoomPage from './pages/ChatRoomPage.jsx';

export default function App() {
  const { user, logout } = useAuth();

  return (
    <>
      <nav className="topnav">
        <Link to="/">상태</Link>
        <Link to="/rooms">채팅방</Link>
        <span className="topnav-right">
          {user ? (
            <>
              <span className="me">{user.nickname}{user.department && ` · ${user.department}`}</span>
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
        <Route path="/rooms" element={<RequireAuth><RoomListPage /></RequireAuth>} />
        <Route path="/rooms/:roomId" element={<RequireAuth><ChatRoomPage /></RequireAuth>} />
      </Routes>
    </>
  );
}
