import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goTo = location.state?.from ?? '/drive';
  if (user) return <Navigate to={goTo} replace />;

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.username.trim(), form.password);
      navigate(goTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page auth-page">
      <h1>로그인</h1>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          아이디
          <input name="username" value={form.username} onChange={onChange} autoComplete="username" required />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" value={form.password} onChange={onChange} autoComplete="current-password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? '로그인 중…' : '로그인'}</button>
      </form>
      <p className="auth-switch">
        계정이 없나요? <Link to="/signup">회원가입</Link>
      </p>
    </main>
  );
}
