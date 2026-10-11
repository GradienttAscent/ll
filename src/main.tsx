import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {installFetchWrapper} from './api.ts';
import {frontendRuntimeInfo} from './apiBase.ts';
import {ThemeProvider} from './context/ThemeContext.tsx';
import App from './App.tsx';
import './index.css';

installFetchWrapper();
console.info('[lazylift-runtime]', frontendRuntimeInfo());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
