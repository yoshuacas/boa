import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import App from './App';

// Apply theme class immediately to avoid flash of wrong theme
try {
  const theme = localStorage.getItem('boa-theme') ?? 'dark';
  if (theme === 'dark') document.documentElement.classList.add('dark');
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
