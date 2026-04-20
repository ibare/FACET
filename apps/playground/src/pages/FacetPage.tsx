import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Warning } from '@phosphor-icons/react';
import {
  getFacetById,
  resolveLocale,
  runFacet,
  type FacetRunHandle,
} from '@facet/core/runtime';
import { findTopicByFacetId } from '../catalog.js';
import { usePreferences } from '../preferences.js';
import { PreferencesToolbar } from '../components/PreferencesToolbar.js';

export function FacetPage() {
  const { id } = useParams<{ id: string }>();
  const facetId = id ? decodeURIComponent(id) : '';
  const { locale } = usePreferences();
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FacetRunHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facetJson = facetId ? getFacetById(facetId) : undefined;
  const location = facetId ? findTopicByFacetId(facetId) : null;

  // locale 변경 시 재마운트 (A안). useEffect 의존성에 locale 포함.
  useEffect(() => {
    setError(null);
    if (!mountRef.current || !facetJson) return;

    try {
      const handle = runFacet(facetJson, mountRef.current, { locale });
      handleRef.current = handle;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }

    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [facetJson, locale]);

  const title = facetJson ? resolveLocale(facetJson.title, locale) : '';
  const description = facetJson ? resolveLocale(facetJson.description, locale) : '';

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
                  {title || location.topic.name}
                </h1>
              </>
            ) : (
              <h1 className="truncate text-lg font-semibold text-fg">{facetId}</h1>
            )}
          </div>

          {description && (
            <p className="hidden max-w-md truncate text-sm text-fg-muted lg:block">
              {description}
            </p>
          )}

          <PreferencesToolbar />
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {!facetJson && (
            <ErrorBox
              title="등록되지 않은 facet"
              detail={`facet id "${facetId}" 가 레지스트리에 없다. registerXxx() 호출이 부트스트랩에 빠지지 않았는지 확인.`}
            />
          )}
          {error && <ErrorBox title="실행 오류" detail={error} />}
          {facetJson && !error && (
            <div className="rounded-2xl bg-surface-raised p-4 ring-1 ring-border sm:p-6">
              {/* facet 내부는 phase 3(코어 themable) 까지 항상 라이트 캔버스 유지 */}
              <div
                ref={mountRef}
                className="facet-mount min-h-[480px] rounded-xl bg-white p-4 text-[#2b2f44]"
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ErrorBox({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-rose-100 p-6 ring-1 ring-rose-300 dark:bg-rose-500/10 dark:ring-rose-400/30">
      <div className="flex items-center gap-2 text-rose-700 dark:text-rose-200">
        <Warning weight="duotone" className="h-5 w-5" />
        <span className="font-semibold">{title}</span>
      </div>
      <p className="mt-2 text-sm text-rose-700/80 dark:text-rose-100/80">{detail}</p>
    </div>
  );
}
