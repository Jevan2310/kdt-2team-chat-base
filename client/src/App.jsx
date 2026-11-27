import { Routes, Route, Link } from 'react-router-dom';
import StatusPage from './pages/StatusPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import RoomListPage from './pages/RoomListPage.jsx';
import ChatRoomPage from './pages/ChatRoomPage.jsx';

export default function App() {
  return (
    <>
      <nav className="topnav">
        <Link to="/">상태</Link>
        <Link to="/login">로그인</Link>
        <Link to="/signup">회원가입</Link>
        <Link to="/rooms">채팅방</Link>
      </nav>
      <Routes>
        <Route path="/" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/rooms" element={<RoomListPage />} />
        <Route path="/rooms/:roomId" element={<ChatRoomPage />} />
      </Routes>
    </>
  );
}
