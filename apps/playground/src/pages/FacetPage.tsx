import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Warning } from '@phosphor-icons/react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension, renderFacetMarkdown } from '@facet/host-tiptap';
import {
  getDescription,
  hasFacetLoader,
  loadFacet,
  resolveLocale,
  type FacetJson,
} from '@facet/core/runtime';
import { findTopicByFacetId } from '../catalog.js';
import { usePreferences } from '../preferences.js';
import { PreferencesToolbar } from '../components/PreferencesToolbar.js';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; facet: FacetJson; html: string }
  | { kind: 'error'; message: string };

export function FacetPage() {
  const { id } = useParams<{ id: string }>();
  const facetId = id ? decodeURIComponent(id) : '';
  const { locale } = usePreferences();
  const location = facetId ? findTopicByFacetId(facetId) : null;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (!facetId) {
      setState({ kind: 'error', message: 'facet id 가 비었다' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });

    if (!hasFacetLoader(facetId)) {
      setState({
        kind: 'error',
        message: `등록되지 않은 facet: "${facetId}". registerFacetLoader 누락.`,
      });
      return;
    }

    void loadFacet(facetId).then(
      (facet) => {
        if (cancelled) return;
        if (!facet) {
          setState({ kind: 'error', message: `facet 로드 실패: ${facetId}` });
          return;
        }
        const md = getDescription(facetId);
        const body = md ?? `*(설명 없음)*\n\n{${facetId.replace(':', ':')}}`;
        const html = renderFacetMarkdown(body);
        setState({ kind: 'ready', facet, html });
      },
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message: msg });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [facetId]);

  const html = state.kind === 'ready' ? state.html : '';
  const editor = useEditor(
    {
      editable: false,
      extensions: [StarterKit, FacetExtension],
      content: html,
    },
    [html],
  );

  const title = useMemo(() => {
    if (state.kind !== 'ready') return '';
    return resolveLocale(state.facet.title, locale);
  }, [state, locale]);

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

          <PreferencesToolbar />
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl">
          {state.kind === 'loading' && (
            <div className="rounded-2xl bg-surface-raised p-8 text-center text-sm text-fg-muted ring-1 ring-border">
              로딩…
            </div>
          )}
          {state.kind === 'error' && (
            <ErrorBox title="시각화 로드 실패" detail={state.message} />
          )}
          {state.kind === 'ready' && (
            <article className="facet-doc rounded-2xl bg-surface-raised p-6 ring-1 ring-border sm:p-10">
              <EditorContent editor={editor} />
            </article>
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
