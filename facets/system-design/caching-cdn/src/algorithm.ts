/**
 * CDN (Content Delivery Network) 시스템 행동 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (서울 미스 → 도쿄 미스 → 프랑크푸르트 미스 → 세 도시 동시 히트)
 * 후 무한 waitForInput 루프로 사용자 입력 (request/auto-demo/reset) 을 1:1 시각
 * 사건으로 매핑한다.
 *
 * 식별자 (C1):
 *   - `edge:<city>`     엣지 PoP (예: edge:seoul)
 *   - `client:<city>`   엣지에 묶인 클라이언트 (예: client:seoul)
 *   - `regional:<id>`   지역 캐시 노드 (예: regional:r1)
 *   - `origin:<id>`     오리진 (예: origin:o1)
 *   - `content:<id>`    콘텐츠 (예: content:A)
 *   - `req:<traceIndex>` 한 요청 사건의 trace 식별자
 *
 * 이벤트 (C2 — 모두 facet 로컬, StandardEventType 미포함):
 *   - init                payload: { edges: EdgeInit[]; regional: { id: string } | null;
 *                                    origin: { id: string }; contents: ContentInit[] }
 *   - request             target: req:<traceIndex>
 *                         payload: { traceIndex; edgeId; contentId; clientLabel;
 *                                    outcome: 'hit' | 'regional-hit' | 'miss';
 *                                    fillPath?: Array<'edge' | 'regional' | 'origin'>;  // 미스 시: 채워야 할 노드 경로 ('edge' / 'regional' / 'origin' 순)
 *                                    reachedOrigin: boolean }                            // 오리진까지 다녀온 미스인지 (지역 캐시 적중과 구별)
 *                         — 한 사건이 클라이언트→엣지 짧은 호 / (선택) 엣지→상위 긴 호 /
 *                           (선택) 채움 운동 / 응답 짧은 호 4 단계를 운반한다.
 *                           projector 가 단계로 펼친다.
 *   - invalidate          target: edge:<city>
 *                         payload: { traceIndex; edgeId; contentId? } — TTL/리셋 외 직접 호출 시.
 *   - invalid-input       payload: { op: string; raw: string }
 *   - demo-end            payload: {}
 *
 *   메타 (silent):
 *   - phase               payload: { phase: 'auto-demo' | 'idle' | 'request' }
 *
 * 메트릭 (C5):
 *   - 'request-count'   요청 호출 누적
 *   - 'hit-count'       엣지 히트 횟수
 *   - 'miss-count'      엣지 미스 횟수 (지역/오리진 모두 포함)
 *   - 'origin-hit'      오리진까지 다녀온 사건 수 (오리진 부하의 호흡 표시용)
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type EdgeInit = {
  /** edge:<id> 의 id 부분. 짧은 도시 슬러그. */
  id: string;
  /** 화면에 표시될 도시 라벨 (예: "서울"). */
  label: string;
  /** 메르카토르 정규화 좌표 (0~1). view 가 픽셀 좌표로 환산. */
  nx: number;
  ny: number;
};

export type ContentInit = {
  /** content:<id> 의 id 부분. 한 글자 권장 (A/B/C). */
  id: string;
  /** 짧은 라벨 (예: "A"). */
  label: string;
};

export type AutoDemoStep =
  | { op: 'request'; edge: string; content: string; clientLabel?: string }
  | { op: 'invalidate'; edge: string; content?: string };

export type CdnFacetData = {
  type: 'caching-cdn';
  /** 엣지 PoP 목록 (지도 위 분포). */
  edges: EdgeInit[];
  /** 지역 캐시 (1개). null 이면 엣지 미스가 곧장 오리진까지 거슬러 올라간다. */
  regional: { id: string } | null;
  /** 오리진 (단일). */
  origin: { id: string };
  /** 콘텐츠 트레이의 콘텐츠 목록. */
  contents: ContentInit[];
  /** 자동 시연 한 사건 사이 머무는 간격 ms. */
  autoDemoIntervalMs: number;
  /** 자동 시연 시퀀스. */
  autoDemoSequence: AutoDemoStep[];
};

export type CdnInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'request'; payload?: { edge?: string; content?: string } }
  | { type: 'auto-demo'; payload?: unknown };

function parseSlug(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 16) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function parseContentId(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 4) return null;
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export async function cachingCdn(
  ctxBase: FacetContext<CdnFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<CdnFacetData>;
  const {
    edges,
    regional,
    origin,
    contents,
    autoDemoIntervalMs,
    autoDemoSequence,
  } = ctx.data;

  // ── 모델 상태 ──
  /** edge id → 캐싱된 콘텐츠 id 집합. */
  const edgeCache = new Map<string, Set<string>>();
  for (const e of edges) edgeCache.set(e.id, new Set<string>());
  /** regional id → 캐싱된 콘텐츠 id 집합. */
  const regionalCache = new Set<string>();

  let traceIndex = 0;
  let lastEdge = '';
  let lastContent = '';

  const validEdgeIds = new Set(edges.map((e) => e.id));
  const validContentIds = new Set(contents.map((c) => c.id));

  async function emitRequest(edgeId: string, contentId: string, clientLabel: string): Promise<void> {
    if (!validEdgeIds.has(edgeId)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'request', raw: `unknown edge ${edgeId}` },
      });
      return;
    }
    if (!validContentIds.has(contentId)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'request', raw: `unknown content ${contentId}` },
      });
      return;
    }

    traceIndex += 1;
    ctx.metric('request-count', 'inc');

    const cache = edgeCache.get(edgeId);
    const edgeHas = cache ? cache.has(contentId) : false;

    if (edgeHas) {
      ctx.metric('hit-count', 'inc');
      await ctx.emit({
        type: 'request',
        target: `req:${traceIndex}`,
        payload: {
          traceIndex,
          edgeId,
          contentId,
          clientLabel,
          outcome: 'hit',
          reachedOrigin: false,
        },
      });
      return;
    }

    ctx.metric('miss-count', 'inc');

    if (regional && regionalCache.has(contentId)) {
      // 지역 캐시 적중 — 오리진까지 가지 않음. 엣지 + 지역 채움.
      cache?.add(contentId);
      const fillPath: Array<'edge' | 'regional' | 'origin'> = ['regional', 'edge'];
      await ctx.emit({
        type: 'request',
        target: `req:${traceIndex}`,
        payload: {
          traceIndex,
          edgeId,
          contentId,
          clientLabel,
          outcome: 'regional-hit',
          fillPath,
          reachedOrigin: false,
        },
      });
      return;
    }

    // 오리진까지 거슬러 올라감.
    ctx.metric('origin-hit', 'inc');
    cache?.add(contentId);
    if (regional) regionalCache.add(contentId);
    const fillPath: Array<'edge' | 'regional' | 'origin'> = regional
      ? ['origin', 'regional', 'edge']
      : ['origin', 'edge'];
    await ctx.emit({
      type: 'request',
      target: `req:${traceIndex}`,
      payload: {
        traceIndex,
        edgeId,
        contentId,
        clientLabel,
        outcome: 'miss',
        fillPath,
        reachedOrigin: true,
      },
    });
  }

  async function emitInvalidate(edgeId: string, contentId?: string): Promise<void> {
    if (!validEdgeIds.has(edgeId)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'invalidate', raw: `unknown edge ${edgeId}` },
      });
      return;
    }
    const cache = edgeCache.get(edgeId);
    if (cache) {
      if (contentId) cache.delete(contentId);
      else cache.clear();
    }
    traceIndex += 1;
    await ctx.emit({
      type: 'invalidate',
      target: `edge:${edgeId}`,
      payload: { traceIndex, edgeId, contentId },
    });
  }

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: {
      edges: edges.map((e) => ({ ...e })),
      regional: regional ? { id: regional.id } : null,
      origin: { id: origin.id },
      contents: contents.map((c) => ({ ...c })),
    },
  });

  // 1. 자동 시연.
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
  for (const step of autoDemoSequence) {
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(autoDemoIntervalMs);
    if (!ok || ctx.cancelled) return;
    if (step.op === 'request') {
      await ctx.emit({ type: 'phase', payload: { phase: 'request' }, silent: true });
      const lbl = step.clientLabel ?? '';
      await emitRequest(step.edge, step.content, lbl);
    } else if (step.op === 'invalidate') {
      await emitInvalidate(step.edge, step.content);
    }
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // 2. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: CdnInputEvent;
    try {
      ev = await ctx.waitForInput<CdnInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      const v = ev.payload?.value;
      if (typeof v === 'string') {
        if (name === 'edge') lastEdge = v;
        else if (name === 'content') lastContent = v;
      }
      continue;
    }

    if (ev.type === 'request') {
      const rawEdge =
        lastEdge.trim() !== ''
          ? lastEdge
          : typeof ev.payload?.edge === 'string'
            ? ev.payload.edge
            : edges[0]?.id ?? '';
      const rawContent =
        lastContent.trim() !== ''
          ? lastContent
          : typeof ev.payload?.content === 'string'
            ? ev.payload.content
            : contents[0]?.id ?? '';
      const eId = parseSlug(rawEdge);
      const cId = parseContentId(rawContent);
      if (eId === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'request', raw: rawEdge } });
        continue;
      }
      if (cId === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'request', raw: rawContent } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'request' }, silent: true });
      await emitRequest(eId, cId, '');
      continue;
    }

    if (ev.type === 'auto-demo') {
      // 자동 시연 재실행 — 현재 캐시 상태에서 그대로 시퀀스를 흘려보낸다.
      await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
      for (const step of autoDemoSequence) {
        if (ctx.cancelled) return;
        const ok = await ctx.sleep(autoDemoIntervalMs);
        if (!ok || ctx.cancelled) return;
        if (step.op === 'request') {
          await emitRequest(step.edge, step.content, step.clientLabel ?? '');
        } else if (step.op === 'invalidate') {
          await emitInvalidate(step.edge, step.content);
        }
      }
      await ctx.emit({ type: 'demo-end' });
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
      continue;
    }
  }
}
