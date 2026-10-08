import './styles/global.css';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { shouldRetry } from './lib/http';
import { router } from './router';

// Refusals from the API (4xx) are final; only lost connections and server hiccups are retried.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
