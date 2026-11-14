import 'bootstrap/dist/css/bootstrap.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import FilePage from './File';
import Home from './Home';
import './index.css';
import Setup from './Setup';

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
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="" element={<HomeOrApp />} />
        <Route path="home" element={<Home />} />
        <Route path="setup" element={<Setup />} />
        <Route path="file" element={<FilePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
