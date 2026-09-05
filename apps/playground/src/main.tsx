import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { bootstrapFacet, loadFrameworkMessages } from '@ffacet/bootstrap';
import './styles.css';

bootstrapFacet();
// 프레임워크 공통 문구 번들. facet 문안은 FacetJson.messages 에서 오므로 별도 로드가 없다.
void loadFrameworkMessages(navigator.language.split('-')[0]);

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
