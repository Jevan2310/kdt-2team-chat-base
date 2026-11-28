// 이름·부서 입력 규칙 (회원가입과 프로필 수정이 같이 쓴다)
export function checkProfile({ nickname, department }) {
  if (typeof nickname !== 'string' || !nickname.trim() || nickname.trim().length > 20) return '이름은 1~20자예요.';
  if (department != null && String(department).length > 50) return '부서는 50자 이하예요.';
  return null;
}
