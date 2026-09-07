import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { bootstrapFacet } from '@ffacet/bootstrap';
import './styles.css';

// facet loader / view / transpiler 등록. 문구 번들은 여기서 부르지 않는다 —
// PreferencesProvider 가 현재 locale 에 맞춰 불러온다. 브라우저 언어로 한 번만
// 부르면 사용자가 언어를 바꿔도 그 번들이 없어 영어 fallback 으로 남는다.
bootstrapFacet();

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
