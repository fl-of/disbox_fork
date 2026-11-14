import 'bootstrap/dist/css/bootstrap.css';
import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';

const App = lazy(() => import('./App'));
const FilePage = lazy(() => import('./File'));
const Home = lazy(() => import('./Home'));
const Setup = lazy(() => import('./Setup'));

const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

function HomeOrApp() {
  if (localStorage.getItem('webhookUrl') === null) {
    return <Home />;
  }
  return <App />;
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter basename={basename}>
        <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
          <Routes>
            <Route path="" element={<HomeOrApp />} />
            <Route path="home" element={<Home />} />
            <Route path="setup" element={<Setup />} />
            <Route path="file" element={<FilePage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);
