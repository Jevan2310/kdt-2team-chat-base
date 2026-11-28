import Avatar from './Avatar.jsx';

// 프로필 + 이름 + 부서 한 줄 (읽은 사람 목록, 참여자 목록)
export default function PersonRow({ user, size = 36 }) {
  return (
    <div className="person">
      <Avatar user={user} size={size} />
      <div className="person-text">
        <div className="person-name">{user.nickname}</div>
        {user.department && <div className="person-dept">{user.department}</div>}
      </div>
    </div>
  );
}
