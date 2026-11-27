import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

export default function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', passwordCheck: '', nickname: '', department: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/rooms" replace />;

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.passwordCheck) {
      setError('비밀번호 확인이 달라요.');
      return;
    }
    setSubmitting(true);
    try {
      const { passwordCheck: _, ...body } = form;
      await signup({ ...body, username: body.username.trim() });
      navigate('/rooms', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page auth-page">
      <h1>회원가입</h1>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          아이디 <small>영어 소문자·숫자·_ 4~20자</small>
          <input name="username" value={form.username} onChange={onChange} autoComplete="username" required />
        </label>
        <label>
          비밀번호 <small>6자 이상</small>
          <input name="password" type="password" value={form.password} onChange={onChange} autoComplete="new-password" required />
        </label>
        <label>
          비밀번호 확인
          <input name="passwordCheck" type="password" value={form.passwordCheck} onChange={onChange} autoComplete="new-password" required />
        </label>
        <label>
          이름 <small>채팅에 보이는 이름</small>
          <input name="nickname" value={form.nickname} onChange={onChange} required />
        </label>
        <label>
          부서 <small>선택</small>
          <input name="department" value={form.department} onChange={onChange} placeholder="예: 개발팀" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? '가입 중…' : '가입하기'}</button>
      </form>
      <p className="auth-switch">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </main>
  );
}
