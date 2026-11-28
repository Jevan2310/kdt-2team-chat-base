// 이름·부서 입력 규칙 (회원가입과 프로필 수정이 같이 쓴다)
// 부서가 목록(departments)에 있는지는 DB 외래 키가 확인한다 → isUnknownDepartment 로 오류를 알아본다
export function checkProfile({ nickname, department }) {
  if (typeof nickname !== 'string' || !nickname.trim() || nickname.trim().length > 20) return '이름은 1~20자예요.';
  if (department != null && typeof department !== 'string') return '부서를 목록에서 골라 주세요.';
  if (department != null && String(department).length > 50) return '부서는 50자 이하예요.';
  return null;
}

export const UNKNOWN_DEPARTMENT = '목록에 없는 부서예요.';
export const isUnknownDepartment = (err) => err?.code === 'ER_NO_REFERENCED_ROW_2';
