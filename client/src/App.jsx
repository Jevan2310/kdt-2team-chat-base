import { Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './auth/useAuth.js';
import RequireAuth from './auth/RequireAuth.jsx';
import Toasts from './notifications/Toasts.jsx';
import StatusPage from './pages/StatusPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import ChatWidget from './chat/ChatWidget.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DrivePage from './pages/DrivePage.jsx';
import Avatar from './components/users/Avatar.jsx';

export default function App() {
  const { user, logout } = useAuth();

  return (
    <>
      <nav className="topnav">
        <NavLink to="/drive" className="brand">📁 사내 드라이브</NavLink>
        <NavLink to="/status">상태</NavLink>
        <span className="topnav-right">
          {user ? (
            <>
              <Link to="/profile" className="me" title="내 프로필">
                <Avatar user={user} size={26} />
                <span>
                  {user.nickname}
                  {user.department && <span className="me-dept"> · {user.department}</span>}
                </span>
              </Link>
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
        {/* 메인 = 드라이브. 채팅은 어느 화면에서든 오른쪽 아래 팝업 (ChatWidget) */}
        <Route path="/" element={<Navigate to="/drive" replace />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/drive" element={<RequireAuth><DrivePage /></RequireAuth>} />
        <Route path="/drive/trash" element={<RequireAuth><DrivePage key="trash" trash /></RequireAuth>} />
        <Route path="/drive/:folderId" element={<RequireAuth><DrivePage /></RequireAuth>} />
        {/* 예전 채팅 페이지 주소로 오면 드라이브로 */}
        <Route path="/rooms/*" element={<Navigate to="/drive" replace />} />
      </Routes>
      {user && <Toasts />}
      <ChatWidget />
    </>
  );
}
