/**
 * 조각의 독자 페이지.
 *
 * 주소를 복사해 새 탭에서 열거나, 목록을 거치지 않고 바로 들어왔을 때의 자리다.
 * 목록에서 카드를 눌러 들어올 때는 모달이 뜨고 이 페이지는 그려지지 않는다
 * (App 의 배경 위치 참조). 알맹이는 둘이 같은 것을 쓴다.
 */

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { findTopicByFacetId } from '../catalog.js';
import { PreferencesToolbar } from '../components/PreferencesToolbar.js';
import { useFacetDocument, FacetDocumentBody } from '../facet-document.js';

export function FacetPage() {
  const { id } = useParams<{ id: string }>();
  const facetId = id ? decodeURIComponent(id) : '';
  const location = facetId ? findTopicByFacetId(facetId) : null;
  const doc = useFacetDocument(facetId);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-1.5 text-sm text-fg-muted ring-1 ring-border transition hover:bg-surface-raised-hover hover:text-fg"
          >
            <ArrowLeft weight="bold" className="h-3.5 w-3.5" />
            카탈로그
          </Link>

          <div className="min-w-0 flex-1">
            {location ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                  <span>{location.domain.name}</span>
                  <span className="opacity-50">/</span>
                  <span>{location.subdomain.name}</span>
                </div>
                <h1 className="mt-0.5 truncate text-lg font-semibold text-fg">
                  {doc.title || location.topic.name}
                </h1>
              </>
            ) : (
              <h1 className="truncate text-lg font-semibold text-fg">{facetId}</h1>
            )}
          </div>

          <PreferencesToolbar />
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl">
          {doc.state.kind === 'ready' ? (
            <div className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border sm:p-10">
              <FacetDocumentBody doc={doc} />
            </div>
          ) : (
            <FacetDocumentBody doc={doc} />
          )}
        </div>
      </main>
    </div>
  );
}
