import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS } from './reactions.js';
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
    if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 글자 확정용
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

// 말풍선을 누르면 나오는 메뉴: 반응 · 읽음 확인 · (내 글) 수정 · 삭제
function Actions({ mine, onReact, onShowReaders, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const ref = useRef(null);
  // 맨 아래 메시지면 메뉴가 가려지지 않게. 중괄호 필수: 최신 Chrome의 scrollIntoView 는 Promise 를 돌려주는데,
  // 화살표 함수가 그걸 그대로 반환하면 React 가 정리 함수로 착각해 화면이 멈춘다
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  if (confirming) {
    return (
      <div className="msg-actions" ref={ref}>
        <span>삭제할까요?</span>
        <button type="button" className="danger" onClick={onDelete}>삭제</button>
        <button type="button" onClick={() => setConfirming(false)}>취소</button>
      </div>
    );
  }
  return (
    <div className="msg-actions" ref={ref}>
      {REACTION_EMOJIS.map((emoji) => (
        <button type="button" key={emoji} className="emoji" onClick={() => onReact(emoji)} aria-label={`${emoji} 반응`}>
          {emoji}
        </button>
      ))}
      <span className="sep" />
      <button type="button" onClick={onShowReaders}>읽음 확인</button>
      {mine && <button type="button" onClick={onEdit}>수정</button>}
      {mine && <button type="button" className="danger" onClick={() => setConfirming(true)}>삭제</button>}
    </div>
  );
}

function TextMessage({ message, mine, continued, unread, selected, editing, ctx }) {
  const deleted = Boolean(message.deletedAt);
  const react = (emoji) => {
    ctx.onReact(message, emoji);
    ctx.onSelect(null);
  };

  // 글자를 드래그해서 복사할 때는 메뉴를 열지 않는다
  const toggle = () => {
    if (deleted || window.getSelection()?.toString()) return;
    ctx.onSelect(selected ? null : message.id);
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
              aria-expanded={selected}
              onClick={toggle}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
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
        {selected && !editing && (
          <Actions
            mine={mine}
            onReact={react}
            onShowReaders={() => {
              ctx.onShowReaders(message);
              ctx.onSelect(null);
            }}
            onEdit={() => {
              ctx.onStartEdit(message.id);
              ctx.onSelect(null);
            }}
            onDelete={() => {
              ctx.onDelete(message);
              ctx.onSelect(null);
            }}
          />
        )}
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

// continued: 같은 사람이 이어 보낸 글이면 프로필·이름 생략 / ctx: 메시지 메뉴에 필요한 것들 (myId, nameOf, onSelect, onStartEdit, onEdit, onDelete, onReact, onShowReaders)
export default function MessageItem(props) {
  const Renderer = RENDERERS[props.message.type] ?? TextMessage; // 모르는 종류는 일반 글처럼
  return <Renderer {...props} />;
}
