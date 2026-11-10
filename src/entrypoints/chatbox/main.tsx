import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Chatbox } from '@/ui/Chatbox';
import '@/ui/styles/app.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Chatbox />
  </StrictMode>,
);
