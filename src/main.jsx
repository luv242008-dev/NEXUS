import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import NexusEnhancements from './nexusEnhancements';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <NexusEnhancements />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
