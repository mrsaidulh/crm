import './lib/apiInterceptor.ts';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PublicForm from './components/PublicForm.tsx';
import './index.css';
import { AuthProvider } from './lib/AuthContext.tsx';

const isPublicForm = window.location.pathname.startsWith('/form');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicForm ? (
      <PublicForm />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
