import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider } from '@/ui/confirm';
import { App } from '@/ui/App';
import '@/ui/styles/app.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </StrictMode>,
);
