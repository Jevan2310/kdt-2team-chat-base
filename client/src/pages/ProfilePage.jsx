import { useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { api } from '../lib/api.js';
import { toSquareJpeg } from '../lib/image.js';
import Avatar from '../components/users/Avatar.jsx';
import { useDepartments } from '../lib/useDepartments.js';

// 내 프로필: 사진 바꾸기·지우기, 이름·부서 수정. 바꾸면 서버가 user:updated 로 모두에게 알린다.
export default function ProfilePage() {
  const { token, user, updateUser } = useAuth();
  const [form, setForm] = useState({ nickname: user.nickname, department: user.department ?? '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const departments = useDepartments();

  const unchanged = form.nickname.trim() === user.nickname && form.department.trim() === (user.department ?? '');
  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // 서버 요청 하나를 돌리고 결과를 안내 문구로 보여 준다
  const run = async (doRequest, doneText) => {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      const data = await doRequest();
      updateUser(data.user);
      setMessage({ type: 'ok', text: doneText });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 동작하게
    if (!file) return;
    await run(async () => {
      const image = await toSquareJpeg(file);
      return api('/users/me/avatar', { method: 'PUT', body: image, token });
    }, '사진을 바꿨어요.');
  };

  const onRemovePhoto = () => run(() => api('/users/me/avatar', { method: 'DELETE', token }), '사진을 지웠어요.');

  const onSubmit = (e) => {
    e.preventDefault();
    run(
      () => api('/users/me', { method: 'PATCH', body: { nickname: form.nickname, department: form.department || null }, token }),
      '저장했어요.',
    );
  };

  return (
    <main className="page auth-page">
      <h1>내 프로필</h1>

      <section className="profile-photo">
        <Avatar user={user} size={96} />
        <div className="profile-photo-buttons">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            {user.avatarUrl ? '사진 바꾸기' : '사진 올리기'}
          </button>
          {user.avatarUrl && (
            <button type="button" className="secondary" onClick={onRemovePhoto} disabled={busy}>
              사진 지우기
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickPhoto} />
          <small className="muted">가운데를 정사각형으로 잘라 작게 줄여서 올려요.</small>
        </div>
      </section>

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          아이디 <small>바꿀 수 없어요</small>
          <input value={user.username} disabled />
        </label>
        <label>
          이름 <small>채팅에 보이는 이름, 20자까지</small>
          <input name="nickname" value={form.nickname} onChange={onChange} maxLength={20} required />
        </label>
        <label>
          부서 <small>선택</small>
          <select name="department" value={form.department} onChange={onChange}>
            <option value="">부서 없음</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || unchanged || !form.nickname.trim()}>저장</button>
      </form>

      {message.text && (
        <p className={message.type === 'error' ? 'form-error' : 'form-ok'} role="status">
          {message.text}
        </p>
      )}
    </main>
  );
}
