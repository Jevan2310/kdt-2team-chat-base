// 프로필 동그라미. 사진(user.avatarUrl)이 있으면 사진, 없으면 이름 첫 글자 + 사람마다 정해진 색.
// 색은 id로 고르므로 같은 사람은 어디서나 같은 색이다.
const COLORS = ['#5865f2', '#3ba55c', '#eb459e', '#faa61a', '#ed4245', '#1abc9c', '#9b59b6', '#e67e22'];

export default function Avatar({ user, size = 36 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (user?.avatarUrl) {
    return <img className="avatar" src={user.avatarUrl} alt="" style={style} />;
  }
  const color = user?.id ? COLORS[user.id % COLORS.length] : '#9aa0a6';
  const initial = user?.nickname?.trim()?.[0] ?? '?';
  return (
    <span className="avatar" style={{ ...style, background: color }} aria-hidden="true">
      {initial}
    </span>
  );
}
