import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { bootstrapFacet } from './facet-bootstrap.js';
import { IndexPage } from './pages/IndexPage.js';
import { FacetPage } from './pages/FacetPage.js';

export function App() {
  useEffect(() => {
    bootstrapFacet();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/facet/:id" element={<FacetPage />} />
      </Routes>
    </BrowserRouter>
  );
}
