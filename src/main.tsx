import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {installFetchWrapper} from './api.ts';
import App from './App.tsx';
import './index.css';

installFetchWrapper();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
