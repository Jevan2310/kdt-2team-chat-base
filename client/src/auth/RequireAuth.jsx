import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.js';

// 로그인해야 볼 수 있는 화면을 감싼다. 로그인 안 했으면 로그인 화면으로 보내고, 로그인 후 원래 화면으로 돌아온다.
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <main className="page">불러오는 중…</main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
