import { api } from './api.js';

// 부모 id → 자식 폴더 목록
export function groupByParent(folders) {
  const map = new Map();
  for (const f of folders) {
    const key = f.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  return map;
}

// 파일 크기 → "24KB", "1.2MB"
export function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// "2026-11-28 10:20:31" → "11-28 10:20" (올해가 아니면 연도까지)
export function formatDate(value) {
  if (!value) return '—';
  const year = String(new Date().getFullYear());
  return value.startsWith(year) ? value.slice(5, 16) : value.slice(0, 16);
}

const ICONS = [
  [/\.(pdf)$/i, '📕'],
  [/\.(png|jpe?g|gif|webp|svg|bmp)$/i, '🖼️'],
  [/\.(xlsx?|csv)$/i, '📊'],
  [/\.(pptx?|key)$/i, '📽️'],
  [/\.(docx?|hwpx?|txt|md|rtf)$/i, '📝'],
  [/\.(zip|7z|rar|tar|gz)$/i, '🗜️'],
  [/\.(mp4|mov|avi|mkv|webm)$/i, '🎞️'],
  [/\.(mp3|wav|m4a)$/i, '🎵'],
];
export const fileIcon = (name) => ICONS.find(([re]) => re.test(name))?.[1] ?? '📄';

// 파일 올리기: 진행률을 보여 주려고 fetch 대신 XMLHttpRequest 를 쓴다 (fetch 는 올리는 진행률을 알 수 없음)
export function uploadToFolder(folderId, files, token, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/drive/folders/${folderId}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // 응답이 JSON 이 아니면 빈 값
      }
      if (xhr.status < 300) resolve(data);
      else reject(new Error(data.message ?? `올리지 못했어요 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('연결이 끊겨 올리지 못했어요.'));
    xhr.send(form);
  });
}

// 등급 이름·순위 (서버 permissions.js 와 같음)
export const LEVEL_LABELS = { view: '보기', edit: '편집', manage: '관리' };
export const rankOf = (level) => ({ view: 1, edit: 2, manage: 3 })[level] ?? 0;

// 내려받기 (S5): 서버에서 60초짜리 서명 주소를 받아 브라우저가 그 주소로 바로 받는다
// (예전처럼 파일 전체를 메모리에 받아 두지 않음 → 큰 파일도 괜찮고, 브라우저 내려받기 진행률이 보임)
export async function downloadFile(file, token) {
  const { url } = await api(`/drive/files/${file.id}/link`, { method: 'POST', token });
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 드라이브 API 묶음 (화면 코드에서 주소를 직접 쓰지 않게)
export const driveApi = {
  tree: (token) => api('/drive/tree', { token }),
  contents: (folderId, token) => api(`/drive/folders/${folderId ?? 'root'}/contents`, { token }),
  createFolder: (parentId, name, token) => api('/drive/folders', { method: 'POST', body: { parentId, name }, token }),
  updateFolder: (id, body, token) => api(`/drive/folders/${id}`, { method: 'PATCH', body, token }),
  trashFolder: (id, token) => api(`/drive/folders/${id}`, { method: 'DELETE', token }),
  updateFile: (id, body, token) => api(`/drive/files/${id}`, { method: 'PATCH', body, token }),
  trashFile: (id, token) => api(`/drive/files/${id}`, { method: 'DELETE', token }),
  trash: (token) => api('/drive/trash', { token }),
  restore: (kind, id, token) => api(`/drive/trash/${kind}/${id}/restore`, { method: 'POST', token }),
  purge: (kind, id, token) => api(`/drive/trash/${kind}/${id}`, { method: 'DELETE', token }),
  permissions: (id, token) => api(`/drive/folders/${id}/permissions`, { token }),
  setPermissions: (id, body, token) => api(`/drive/folders/${id}/permissions`, { method: 'PUT', body, token }),
};
