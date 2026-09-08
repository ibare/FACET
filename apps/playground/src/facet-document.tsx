/**
 * 조각 하나를 불러와 글과 함께 그리는 부분.
 *
 * 같은 조각을 두 자리에서 본다 — 목록 위에 뜨는 모달과, 링크로 바로 들어온
 * 독자 페이지. 불러오기와 렌더가 두 벌로 갈리면 한쪽만 고치는 일이 생기므로
 * 여기 모아 둔다. 바깥 껍데기(헤더·닫기·여백)만 각자 정한다.
 */

import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension, renderFacetMarkdown } from '@ffacet/host-tiptap';
import { Warning } from '@phosphor-icons/react';
import {
  getDescription,
  hasFacetLoader,
  loadFacet,
  resolveLocale,
  type FacetJson,
} from '@ffacet/core/runtime';
import { usePreferences } from './preferences.js';

export type FacetDocState =
  | { kind: 'loading' }
  | { kind: 'ready'; facet: FacetJson; html: string }
  | { kind: 'error'; message: string };

export type FacetDocument = {
  state: FacetDocState;
  /** 저작자가 정한 제목. 아직 안 왔으면 빈 문자열. */
  title: string;
  /** 글 + 조각을 담은 에디터. 마운트 전이면 null. */
  editor: Editor | null;
};

export function useFacetDocument(facetId: string): FacetDocument {
  const { locale, theme, messagesEpoch } = usePreferences();
  const [state, setState] = useState<FacetDocState>({ kind: 'loading' });

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
        const body = md ?? `*(설명 없음)*\n\n{${facetId}}`;
        setState({ kind: 'ready', facet, html: renderFacetMarkdown(body) });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [facetId]);

  const html = state.kind === 'ready' ? state.html : '';

  // locale/theme 가 바뀌면 facet NodeView 가 새 옵션으로 다시 마운트되도록
  // editor 자체를 재생성한다(deps 에 포함). FacetExtension.configure 로 옵션 주입.
  const editor = useEditor(
    {
      editable: false,
      extensions: [StarterKit, FacetExtension.configure({ locale, theme })],
      content: html,
    },
    // messagesEpoch — 문구 번들이 도착하면 다시 마운트해 라벨을 새로 그린다.
    [html, locale, theme, messagesEpoch],
  );

  const title = useMemo(() => {
    if (state.kind !== 'ready') return '';
    return resolveLocale(state.facet.title, locale);
  }, [state, locale]);

  return { state, title, editor };
}

/** 로딩 · 오류 · 본문 — 껍데기 없이 알맹이만. */
export function FacetDocumentBody({ doc }: { doc: FacetDocument }) {
  if (doc.state.kind === 'loading') {
    return (
      <div className="rounded-2xl bg-surface-raised p-8 text-center text-sm text-fg-muted ring-1 ring-border">
        로딩…
      </div>
    );
  }
  if (doc.state.kind === 'error') {
    return <ErrorBox title="시각화 로드 실패" detail={doc.state.message} />;
  }
  return (
    <article className="facet-doc">
      <EditorContent editor={doc.editor} />
    </article>
  );
}

export function ErrorBox({ title, detail }: { title: string; detail: string }) {
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
