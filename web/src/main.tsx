import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker in production builds (and in dev when ?sw is present, for testing offline behaviour).
const wantSw = process.env.NODE_ENV === 'production' || new URLSearchParams(location.search).has('sw');
if ('serviceWorker' in navigator && wantSw) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker registration failed', e));
  });
}
