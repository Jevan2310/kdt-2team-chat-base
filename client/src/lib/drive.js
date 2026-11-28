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

// 내려받기: 주소에 토큰을 실을 수 없어서(로그인 확인) fetch 로 받아 브라우저 저장으로 넘긴다
export async function downloadFile(file, token) {
  const res = await fetch(`/api/drive/files/${file.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? '내려받지 못했어요.');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
};
