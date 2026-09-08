/**
 * 조각을 목록 위에 띄우는 모달.
 *
 * 조각을 하나씩 확인할 때는 독자 페이지로 나갔다 뒤로 오는 왕복이 비싸다 —
 * 목록이 다시 그려지고, 펼침과 스크롤을 되찾아야 한다. 모달은 목록을 마운트한
 * 채로 위에 얹으므로 닫으면 보던 자리 그대로다.
 *
 * 라우팅은 그대로 둔다. 카드가 `state.background` 에 지금 자리를 실어 보내고,
 * 그것이 있으면 App 이 목록을 배경으로 깔고 이 모달을 얹는다. 그래서
 *
 *   - 뒤로 가기가 곧 닫기다 (히스토리를 새로 쌓지 않는다)
 *   - 주소를 복사해 새 탭에서 열면 독자 페이지가 그대로 뜬다
 *
 * 스크롤 잠금은 `overflow: hidden` 대신 `scrollbar-gutter` 를 함께 쓴다 —
 * 그냥 잠그면 스크롤바 폭만큼 배경이 옆으로 튄다.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ArrowSquareOut } from '@phosphor-icons/react';
import { findTopicByFacetId } from '../catalog.js';
import { useFacetDocument, FacetDocumentBody } from '../facet-document.js';

export function FacetModal({ facetId }: { facetId: string }) {
  const navigate = useNavigate();
  const doc = useFacetDocument(facetId);
  const location = findTopicByFacetId(facetId);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => navigate(-1);

  // Escape 로 닫는다. 모달이 열려 있는 동안만 듣는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        navigate(-1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  // 배경 스크롤 잠금. 스크롤바가 사라지며 배경이 튀지 않게 자리를 남겨 둔다.
  useEffect(() => {
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevGutter = body.style.scrollbarGutter;
    body.style.overflow = 'hidden';
    body.style.scrollbarGutter = 'stable';
    return () => {
      body.style.overflow = prevOverflow;
      body.style.scrollbarGutter = prevGutter;
    };
  }, []);

  // 열리면 패널로 초점을 옮긴다 — 키보드가 뒤쪽 목록에 남아 있지 않게.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // 바깥을 눌러 닫는다. 안에서 드래그해 밖에서 뗀 경우는 닫지 않는다.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={doc.title || facetId}
        tabIndex={-1}
        className="flex h-[80vh] w-[80vw] flex-col overflow-hidden rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-border outline-none"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            {location && (
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                <span>{location.domain.name}</span>
                <span className="opacity-50">/</span>
                <span>{location.subdomain.name}</span>
              </div>
            )}
            <h2 className="mt-0.5 truncate text-lg font-semibold text-fg">
              {doc.title || location?.topic.name || facetId}
            </h2>
            <p className="truncate font-mono text-[11px] text-fg-subtle">
              {location ? `${location.topic.id} · ${facetId}` : facetId}
            </p>
          </div>

          <a
            href={`/facet/${encodeURIComponent(facetId)}`}
            target="_blank"
            rel="noreferrer"
            title="새 탭에서 열기"
            className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-surface-raised-hover hover:text-fg"
          >
            <ArrowSquareOut weight="bold" className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={close}
            title="닫기 (Esc)"
            className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-surface-raised-hover hover:text-fg"
          >
            <X weight="bold" className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <FacetDocumentBody doc={doc} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
