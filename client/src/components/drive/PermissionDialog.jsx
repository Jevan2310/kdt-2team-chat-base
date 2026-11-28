import { useEffect, useState } from 'react';
import Dialog from '../common/Dialog.jsx';
import { api } from '../../lib/api.js';
import { useDepartments } from '../../lib/useDepartments.js';
import { driveApi, LEVEL_LABELS } from '../../lib/drive.js';

const subjectLabel = (g) =>
  g.type === 'all' ? '🌐 전체 직원' : g.type === 'department' ? `🏢 ${g.department}` : `👤 ${g.user?.nickname ?? '(알 수 없음)'}${g.user?.department ? ` · ${g.user.department}` : ''}`;
const keyOf = (g) => (g.type === 'all' ? 'all' : g.type === 'department' ? `dept:${g.department}` : `user:${g.user?.id}`);

// 🔐 폴더 권한 창 (관리 권한이 있는 사람만 열 수 있음)
// 위에서 이어받는 권한은 회색으로 보여 주고, 이 폴더에 직접 준 권한만 고친다. 저장하면 통째로 바뀜
export default function PermissionDialog({ folderId, token, onClose, onSaved }) {
  const departments = useDepartments();
  const [data, setData] = useState(null); // 서버에서 받은 권한
  const [users, setUsers] = useState([]);
  const [inherit, setInherit] = useState(true);
  const [botEnabled, setBotEnabled] = useState(false);
  const [grants, setGrants] = useState([]); // [{ type, user?, department?, level }]
  const [add, setAdd] = useState({ type: 'user', target: '', level: 'view' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([driveApi.permissions(folderId, token), api('/users', { token })])
      .then(([p, u]) => {
        if (cancelled) return;
        setData(p);
        setInherit(p.folder.inherit);
        setBotEnabled(p.folder.botEnabled);
        setGrants(p.grants);
        setUsers(u.users);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [folderId, token]);

  const addGrant = () => {
    let g;
    if (add.type === 'all') g = { type: 'all', level: add.level };
    else if (add.type === 'department') {
      if (!add.target) return setError('부서를 골라 주세요.');
      g = { type: 'department', department: add.target, level: add.level };
    } else {
      const u = users.find((x) => String(x.id) === add.target);
      if (!u) return setError('사람을 골라 주세요.');
      g = { type: 'user', user: u, level: add.level };
    }
    setError('');
    setGrants((prev) => [...prev.filter((x) => keyOf(x) !== keyOf(g)), g]); // 같은 대상이 있으면 새 등급으로
    setAdd((a) => ({ ...a, target: '' }));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        inherit,
        botEnabled,
        grants: grants.map((g) => ({ type: g.type, userId: g.user?.id, department: g.department, level: g.level })),
      };
      await driveApi.setPermissions(folderId, body, token);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title={data ? `🔐 "${data.folder.name}" 권한` : '🔐 권한'} onClose={onClose} wide>
      {!data ? (
        error ? <p className="form-error">{error}</p> : <p className="muted">불러오는 중…</p>
      ) : (
        <div className="perm">
          {!data.folder.isRoot && (
            <label className="perm-check">
              <input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} />
              <span>
                위 폴더 권한 이어받기
                <small>{inherit ? '위 폴더에서 볼 수 있는 사람은 여기도 볼 수 있어요.' : '🔒 아래 목록에 있는 사람만 볼 수 있어요.'}</small>
              </span>
            </label>
          )}

          {inherit && data.inherited.length > 0 && (
            <section>
              <h3>이어받는 권한</h3>
              <ul className="perm-list inherited">
                {data.inherited.flatMap((block) =>
                  block.grants.map((g) => (
                    <li key={`${block.folderId}-${g.id}`}>
                      <span>{subjectLabel(g)}</span>
                      <span className="muted">
                        {LEVEL_LABELS[g.level]} · 📁 {block.folderName}에서
                      </span>
                    </li>
                  )),
                )}
              </ul>
            </section>
          )}

          <section>
            <h3>이 폴더에 준 권한</h3>
            {grants.length === 0 ? (
              <p className="muted">없음{!inherit && ' — 이대로면 관리자만 볼 수 있어요.'}</p>
            ) : (
              <ul className="perm-list">
                {grants.map((g) => (
                  <li key={keyOf(g)}>
                    <span>{subjectLabel(g)}</span>
                    <span className="perm-row-actions">
                      <select
                        value={g.level}
                        aria-label={`${subjectLabel(g)} 등급`}
                        onChange={(e) => setGrants((prev) => prev.map((x) => (keyOf(x) === keyOf(g) ? { ...x, level: e.target.value } : x)))}
                      >
                        {Object.entries(LEVEL_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <button type="button" className="link-button danger" onClick={() => setGrants((prev) => prev.filter((x) => keyOf(x) !== keyOf(g)))} aria-label={`${subjectLabel(g)} 빼기`}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="perm-add">
              <select value={add.type} onChange={(e) => setAdd({ type: e.target.value, target: '', level: add.level })} aria-label="대상 종류">
                <option value="user">사람</option>
                <option value="department">부서</option>
                <option value="all">전체 직원</option>
              </select>
              {add.type === 'user' && (
                <select value={add.target} onChange={(e) => setAdd({ ...add, target: e.target.value })} aria-label="사람">
                  <option value="">사람 고르기</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nickname}
                      {u.department ? ` · ${u.department}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {add.type === 'department' && (
                <select value={add.target} onChange={(e) => setAdd({ ...add, target: e.target.value })} aria-label="부서">
                  <option value="">부서 고르기</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              )}
              <select value={add.level} onChange={(e) => setAdd({ ...add, level: e.target.value })} aria-label="등급">
                {Object.entries(LEVEL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <button type="button" onClick={addGrant}>추가</button>
            </div>
            <p className="perm-help muted">보기: 목록·내려받기 · 편집: + 올리기·이름 바꾸기·옮기기·휴지통 · 관리: + 권한 바꾸기·영구 삭제</p>
          </section>

          <label className="perm-check">
            <input type="checkbox" checked={botEnabled} onChange={(e) => setBotEnabled(e.target.checked)} />
            <span>
              봇이 이 폴더 문서를 읽어도 됨
              <small>AI 봇(12단계)이 질문에 답할 때 이 폴더 문서를 참고해요. 문서 일부가 외부 AI 서비스로 전송돼요.</small>
            </span>
          </label>

          {error && <p className="form-error">{error}</p>}
          <div className="dialog-buttons">
            <button type="button" onClick={onClose}>취소</button>
            <button type="button" className="primary" onClick={save} disabled={busy}>저장</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
