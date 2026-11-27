// REST API 코드에서도 소켓으로 알림을 보낼 수 있게 io 를 보관해 둔다.
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  if (!ioInstance) throw new Error('Socket.IO가 아직 준비되지 않았어요.');
  return ioInstance;
}
