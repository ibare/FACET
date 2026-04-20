import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PreferencesProvider } from './preferences.js';
import { IndexPage } from './pages/IndexPage.js';
import { FacetPage } from './pages/FacetPage.js';

export function App() {
  return (
    <PreferencesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<IndexPage />} />
          <Route path="/facet/:id" element={<FacetPage />} />
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  );
}
