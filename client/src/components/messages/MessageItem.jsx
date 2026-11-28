import { useRef, useState } from 'react';
import Avatar from '../users/Avatar.jsx';

// 메시지 종류(type)마다 그리는 컴포넌트를 고른다.
// 새 종류(예: 챗봇 bot, 휴가 vacation)를 추가하려면 컴포넌트를 만들고 아래 표에 한 줄 추가한다.

const timeOf = (createdAt) => createdAt?.slice(11, 16) ?? ''; // "2026-11-27 13:19:58" → "13:19"

// 수정 입력칸: Enter 저장, Shift+Enter 줄바꿈, Esc 취소
function EditBox({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    const result = await onSave(text);
    if (result.ok) return onCancel(); // 저장됐으면 수정칸 닫기
    setSaving(false);
    setError(result.message);
  };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter 는 글자 확정용 (Safari 는 229 로 확인)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="msg-edit">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} autoFocus rows={1} />
      {error && <p className="form-error">{error}</p>}
      <div className="msg-edit-buttons">
        <button type="button" onClick={onCancel}>취소</button>
        <button type="button" className="primary" onClick={save} disabled={saving || !text.trim()}>저장</button>
      </div>
    </div>
  );
}

// 말풍선 아래 반응 칩: 👍 2 (내가 누른 건 강조). 누르면 같은 반응 추가/취소
function Reactions({ reactions, myId, nameOf, onReact }) {
  if (!reactions?.length) return null;
  return (
    <div className="msg-reactions">
      {reactions.map((r) => (
        <button
          type="button"
          key={r.emoji}
          className={`reaction ${r.userIds.includes(myId) ? 'reaction-mine' : ''}`}
          title={r.userIds.map(nameOf).join(', ')}
          onClick={() => onReact(r.emoji)}
        >
          {r.emoji} {r.userIds.length}
        </button>
      ))}
    </div>
  );
}

function TextMessage({ message, mine, continued, unread, selected, editing, ctx }) {
  const deleted = Boolean(message.deletedAt);
  const react = (emoji) => ctx.onReact(message, emoji);
  const pointerType = useRef('mouse'); // 마우스로 눌렀는지, 손가락(터치)으로 눌렀는지

  // 말풍선 아래에 메뉴 열기 (터치·키보드)
  const openBelow = (el) => {
    const r = el.getBoundingClientRect();
    ctx.onOpenMenu(message, { x: mine ? r.right : r.left, y: r.bottom + 4, aboveY: r.top - 4, alignRight: mine });
  };

  // PC: 우클릭한 자리에 메뉴 (키보드 메뉴 키는 좌표가 0이라 말풍선 아래에)
  const onContextMenu = (e) => {
    if (deleted) return; // 지운 글은 브라우저 기본 메뉴
    e.preventDefault();
    if (e.clientX === 0 && e.clientY === 0) return openBelow(e.currentTarget);
    ctx.onOpenMenu(message, { x: e.clientX, y: e.clientY, aboveY: e.clientY, alignRight: false });
  };

  // 휴대폰: 탭하면 메뉴 열기/닫기. 마우스 왼쪽 클릭은 글자 선택용으로 비워 둔다
  const onClick = (e) => {
    if (deleted || pointerType.current === 'mouse') return;
    if (selected) return ctx.onCloseMenu();
    openBelow(e.currentTarget);
  };

  return (
    <div className={`msg ${mine ? 'msg-mine' : ''} ${continued ? 'msg-continued' : ''}`}>
      {/* 남의 글: 왼쪽에 프로필 (이어 보낸 글은 자리만 비워 둠) */}
      {!mine && <div className="msg-avatar">{!continued && <Avatar user={message.user} />}</div>}
      <div className="msg-body">
        {!mine && !continued && (
          <div className="msg-author">
            {message.user?.nickname ?? '알 수 없음'}
            {message.user?.department && <small> · {message.user.department}</small>}
          </div>
        )}
        <div className="msg-row">
          {editing ? (
            <EditBox
              initial={message.content}
              onSave={(text) => ctx.onEdit(message, text)}
              onCancel={() => ctx.onStartEdit(null)}
            />
          ) : deleted ? (
            <div className="msg-bubble msg-deleted">삭제된 메시지예요.</div>
          ) : (
            <div
              className={`msg-bubble ${selected ? 'msg-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={selected}
              title="우클릭(휴대폰은 탭)하면 반응·읽음 확인·수정·삭제"
              onPointerDown={(e) => (pointerType.current = e.pointerType)}
              onClick={onClick}
              onContextMenu={onContextMenu}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (selected) ctx.onCloseMenu();
                  else openBelow(e.currentTarget);
                }
              }}
            >
              {message.content}
              {message.editedAt && <span className="msg-edited"> (수정됨)</span>}
            </div>
          )}
          <span className="msg-side">
            {unread > 0 && (
              <button
                type="button"
                className="msg-unread"
                title={`${unread}명이 아직 안 읽음 — 눌러서 누가 읽었는지 보기`}
                onClick={() => ctx.onShowReaders(message)}
              >
                {unread}
              </button>
            )}
            <span className="msg-time">{timeOf(message.createdAt)}</span>
          </span>
        </div>
        {!deleted && <Reactions reactions={message.reactions} myId={ctx.myId} nameOf={ctx.nameOf} onReact={react} />}
      </div>
    </div>
  );
}

function SystemMessage({ message }) {
  return <div className="msg-system">{message.content}</div>;
}

const RENDERERS = {
  text: TextMessage,
  system: SystemMessage,
};

// continued: 같은 사람이 이어 보낸 글이면 프로필·이름 생략 / selected: 메뉴가 열린 글
// ctx: myId, nameOf, onOpenMenu, onCloseMenu, onStartEdit, onEdit, onDelete, onReact, onShowReaders
export default function MessageItem(props) {
  const Renderer = RENDERERS[props.message.type] ?? TextMessage; // 모르는 종류는 일반 글처럼
  return <Renderer {...props} />;
}
