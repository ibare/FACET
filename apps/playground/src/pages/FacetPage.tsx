import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Warning } from '@phosphor-icons/react';
import { getFacetById, runFacet, type FacetRunHandle } from '@facet/core/runtime';
import { findTopicByFacetId } from '../catalog.js';

export function FacetPage() {
  const { id } = useParams<{ id: string }>();
  const facetId = id ? decodeURIComponent(id) : '';
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FacetRunHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facetJson = facetId ? getFacetById(facetId) : undefined;
  const location = facetId ? findTopicByFacetId(facetId) : null;

  useEffect(() => {
    setError(null);
    if (!mountRef.current || !facetJson) return;

    try {
      const handle = runFacet(facetJson, mountRef.current);
      handleRef.current = handle;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }

    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [facetJson]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft weight="bold" className="h-3.5 w-3.5" />
            카탈로그
          </Link>

          <div className="min-w-0 flex-1">
            {location ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  <span>{location.domain.name}</span>
                  <span className="text-white/20">/</span>
                  <span>{location.subdomain.name}</span>
                </div>
                <h1 className="mt-0.5 truncate text-lg font-semibold text-white">
                  {facetJson?.title ?? location.topic.name}
                </h1>
              </>
            ) : (
              <h1 className="truncate text-lg font-semibold text-white">{facetId}</h1>
            )}
          </div>

          {facetJson?.description && (
            <p className="hidden max-w-md truncate text-sm text-white/50 lg:block">
              {facetJson.description}
            </p>
          )}
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
            <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-6">
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
    <div className="rounded-2xl bg-rose-500/10 p-6 ring-1 ring-rose-400/30">
      <div className="flex items-center gap-2 text-rose-200">
        <Warning weight="duotone" className="h-5 w-5" />
        <span className="font-semibold">{title}</span>
      </div>
      <p className="mt-2 text-sm text-rose-100/80">{detail}</p>
    </div>
  );
}
