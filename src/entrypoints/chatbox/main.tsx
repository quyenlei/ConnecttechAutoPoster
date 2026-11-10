import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider } from '@/ui/confirm';
import { Chatbox } from '@/ui/Chatbox';
import '@/ui/styles/app.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <Chatbox />
    </ConfirmProvider>
  </StrictMode>,
);
