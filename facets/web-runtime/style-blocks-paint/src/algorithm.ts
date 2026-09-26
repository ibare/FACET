/**
 * 이벤트 (전부 silent 아님):
 *
 *   line:read     { index: number; at: number; domComplete: boolean }
 *                 문서의 한 줄을 읽었다. `index` 는 `data.lines` 의 자리,
 *                 `at` 은 그 줄을 다 읽은 ms (파서는 한 줄에 PARSE_MS). 마지막
 *                 줄이면 `domComplete: true` — DOM 이 다 됐다는 뜻.
 *   resource:arrived   { id: string; at: number }
 *                 site.css 가 도착했다.
 *   first-paint   { at: number; waitedMs: number }
 *                 화면이 처음 그려졌다. `waitedMs` 는 DOM 완성부터 이 순간까지
 *                 그려지지 않은 채 기다린 길이.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 파서가 한 줄을 읽는 데 쓰는 시간 (common.md 의 모형). */
const PARSE_MS = 10;

export type StyleBlocksPaintLineKind = 'link' | 'text';

export interface StyleBlocksPaintLine {
  /** 자리 표시용 식별자 (`link` · `h1` · `p1` …). */
  id: string;
  kind: StyleBlocksPaintLineKind;
  /** 문서에 실제로 적힌 줄 — 번역하지 않는 자료. */
  code: string;
  /** `kind === 'text'` 일 때 — 화면(screen)에 그려지는 렌더링 결과 글. 역시 자료. */
  text?: string;
  /** `kind === 'text'` 인 줄 중 큰 제목으로 그릴 것. */
  heading?: boolean;
  /** `kind === 'link'` 일 때만 — 요청할 자원의 식별자. */
  src?: string;
}

export interface StyleBlocksPaintFacetData {
  type: 'style-blocks-paint';
  lines: StyleBlocksPaintLine[];
  /** site.css 를 받는 데 걸리는 시간 (ms). */
  cssDurationMs: number;
  stepMs: number;
}

async function pause(ctx: ReactiveContext<StyleBlocksPaintFacetData>): Promise<boolean> {
  if (ctx.cancelled) return false;
  return (await ctx.sleep(ctx.data.stepMs)) && !ctx.cancelled;
}

export async function styleBlocksPaint(rawCtx: FacetContext<StyleBlocksPaintFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<StyleBlocksPaintFacetData>;
  const { lines } = ctx.data;

  const linkLines = lines.filter((l) => l.kind === 'link');
  if (linkLines.length !== 1) {
    throw new Error(`site.css 를 요청하는 link 줄이 정확히 하나여야 한다 (받은 수 ${linkLines.length})`);
  }
  const cssLine = linkLines[0]!;
  if (typeof cssLine.src !== 'string' || cssLine.src.length === 0) {
    throw new Error(`link 줄 '${cssLine.id}' 에 요청할 자원 src 가 없다`);
  }

  let domCompleteAt: number | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    if (!(await pause(ctx))) return;
    const at = (i + 1) * PARSE_MS;
    const domComplete = i === lines.length - 1;
    if (domComplete) domCompleteAt = at;
    await ctx.emit({ type: 'line:read', payload: { index: i, at, domComplete } });
  }
  if (domCompleteAt === null) throw new Error('DOM 완성 시각을 셈하지 못했다');

  const requestedAt = (lines.indexOf(cssLine) + 1) * PARSE_MS;
  const arrivedAt = requestedAt + ctx.data.cssDurationMs;

  if (!(await pause(ctx))) return;
  await ctx.emit({ type: 'resource:arrived', payload: { id: cssLine.src, at: arrivedAt } });

  const paintedAt = Math.max(domCompleteAt, arrivedAt);
  if (!(await pause(ctx))) return;
  await ctx.emit({
    type: 'first-paint',
    payload: { at: paintedAt, waitedMs: paintedAt - domCompleteAt },
  });
}
