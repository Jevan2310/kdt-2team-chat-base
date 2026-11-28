import { useEffect, useState } from 'react';
import { api } from './api.js';

// 부서 목록 (회원가입·프로필에서 고르기). 처음 한 번 받아 둔 걸 같이 쓴다
let cache = null;

export function useDepartments() {
  const [departments, setDepartments] = useState(cache ?? []);
  useEffect(() => {
    if (cache) return;
    api('/departments')
      .then((d) => {
        cache = d.departments;
        setDepartments(d.departments);
      })
      .catch(() => {});
  }, []);
  return departments;
}
