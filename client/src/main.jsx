import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { UnreadProvider } from './notifications/UnreadProvider.jsx';
import { ChatWidgetProvider } from './chat/ChatWidgetProvider.jsx';

// 새로고침할 때 브라우저가 예전 스크롤 위치를 되살리지 않게 한다.
// 화면 높이는 창에 딱 맞고 스크롤은 메시지 목록 안에서만 하므로, 되살리면 상단 메뉴가 잠깐 가려진다.
try {
  window.history.scrollRestoration = 'manual';
} catch {
  // 지원하지 않는 브라우저면 무시
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ChatWidgetProvider>
          <UnreadProvider>
            <App />
          </UnreadProvider>
        </ChatWidgetProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
