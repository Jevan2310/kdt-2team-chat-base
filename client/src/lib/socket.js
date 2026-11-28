import { useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';

// 앱 전체에서 소켓 하나만 쓴다. autoConnect: false → 필요할 때 socket.connect() 로 연결.
// 주소를 비워 두면 지금 페이지 주소(5173)로 연결하고, Vite 프록시가 서버(3000)로 넘긴다.
export const socket = io({ autoConnect: false });

// 연결 상태를 화면에 쓸 때: const connected = useSocketConnected();
// 소켓의 실제 상태를 바로 읽기 때문에, 화면이 그려지는 사이에 연결돼도 놓치지 않는다.
function subscribe(onChange) {
  socket.on('connect', onChange);
  socket.on('disconnect', onChange);
  return () => {
    socket.off('connect', onChange);
    socket.off('disconnect', onChange);
  };
}

export function useSocketConnected() {
  return useSyncExternalStore(subscribe, () => socket.connected);
}

// 서버 응답(ack)을 기다리되 ms 안에 안 오면 실패로 끝낸다.
// 보내는 순간 연결이 끊기면 응답이 영영 안 와서 보내기 버튼·화면이 멈춰 있던 문제를 막는다.
export function emitAck(event, data, ms = 8000) {
  return new Promise((resolve) => {
    socket.timeout(ms).emit(event, data, (err, res) => {
      resolve(err ? { ok: false, message: '서버 응답이 없어요. 연결을 확인하고 다시 시도해 주세요.' } : (res ?? { ok: true }));
    });
  });
}
