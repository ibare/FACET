/**
 * 라우팅.
 *
 * 조각은 두 가지로 열린다.
 *
 *   목록에서 카드를 누름  → 주소는 /facet/:id 로 바뀌지만 목록을 배경으로 깔고
 *                          그 위에 모달을 얹는다. 닫으면(뒤로 가기) 목록이
 *                          그대로다 — 다시 그리지 않았으니 펼침도 스크롤도 산다.
 *   주소로 바로 들어옴    → 배경이 없으므로 독자 페이지가 그대로 뜬다.
 *
 * 가르는 것은 `location.state.background` 하나다. 카드가 누를 때 지금 자리를
 * 거기 실어 보낸다 (IndexPage).
 */

import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { PreferencesProvider } from './preferences.js';
import { IndexPage } from './pages/IndexPage.js';
import { FacetPage } from './pages/FacetPage.js';
import { FacetModal } from './components/FacetModal.js';

type BackgroundState = { background?: Location } | null;

function Router() {
  const location = useLocation();
  const state = location.state as BackgroundState;
  const background = state?.background;

  const modalId = background ? decodeURIComponent(location.pathname.replace(/^\/facet\//, '')) : '';

  return (
    <>
      <Routes location={background ?? location}>
        <Route path="/" element={<IndexPage />} />
        <Route path="/facet/:id" element={<FacetPage />} />
      </Routes>
      {background && modalId !== '' && <FacetModal key={modalId} facetId={modalId} />}
    </>
  );
}

export function App() {
  return (
    <PreferencesProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
    </PreferencesProvider>
  );
}
