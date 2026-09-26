/**
 * repaint-cost — 페인트와 합성: 바뀌는 속성이 렌더링 파이프라인의 어디서부터 다시 도는가.
 *
 * 페이지 장(문서 흐름 위에서 아래로 header·intro·card·list·footer, 자식 card-title·card-text)
 * 위에 절대 위치 badge 가 card 와 list 에 걸쳐 있다. 손잡이 둘을 돌리면
 *   - `property` 가 어느 속성을 바꿀지 고른다(display/height/color/transform 순으로 파이프라인의
 *     사슬이 짧아진다).
 *   - `cardLayer` 가 card 를 page 와 함께 칠할지 제 장(will-change: transform)에 뗄지 고른다.
 * 한 판은 "속성을 실제로 바꾸면 어디까지 다시 도는가"를 style→[layout]→[paint 하나씩]→composite
 * 순서로 재생한다.
 *
 * ── 이벤트
 *   'reset-round'  payload:{ property:number; cardLayer:number } — 판 시작. 화면을 baseline(원래
 *                  자리, 아직 이번 판의 속성이 적용되기 전)으로 되돌린다.
 *   'stage'        payload 가 네 모양 중 하나(이 판이 어느 파이프라인 단계에 들어섰는가):
 *                    { stage:'style' }
 *                    { stage:'layout'; rects: Record<string, Rect>; removed: string[] }
 *                    { stage:'paint'; id: string }
 *                    { stage:'composite'; dx: number; summary: RoundSummary }
 *   'phase'        silent:true, payload:{ phase:'paint' } — 코드 패널 동기화. 이 facet 의 IR 은
 *                  "더러워진 사각형과 각 요소의 사각형이 겹치는가"만 담으므로 phase 는 'paint' 하나뿐
 *                  이다(style/layout/composite 는 셈이 아니라 파이프라인의 있음/없음 표시라 IR 에
 *                  대응하는 줄이 없다).
 *
 * phase 어휘: 'paint' — irs.ts 의 computeRepaint 루프(과 그 안의 if)와 정확히 같다.
 *
 * ── 계기
 * 셋 다 "지금 판의 값"을 들고 이전 값과의 차이만 보내는 같은 헬퍼(metricTo)를 쓴다 — 판을
 * 오갈 때 이전 판으로 되돌아오면 계기도 그 판의 값으로 되돌아온다("판마다 쌓이지 않는다",
 * whole-self-check 의 되돌림 검사). 공통 안내문의 "repainted·stages 는 누적" 이라는 말은
 * "판 안에서 하나씩 더해 총량을 낸다" 는 뜻으로 여기서는 지금 판 값을 한 번에 낸다 — 값 자체는
 * 같다(사양에서 모자랐던 자리, 보고에 적는다).
 *   repainted  지금 판에서 다시 칠한 요소 수
 *   stages     지금 판에서 실제로 켜진 단계 수
 *   layers     지금 층 수
 *
 * ── 동률
 *   모든 좌표가 정수라 실수 동률이 낄 자리가 없다. 겹침 판정(overlap)은 경계를 맞닿는 것은
 *   겹침이 아닌 것으로 다룬다(엄격한 `<`) — 그 경계가 실제로 이 데이터에서 걸리는 자리는
 *   intro/card 경계(88)와 card-title/card-text 경계다. 두 경우 모두 "닿기만 하고 겹치지 않음"
 *   으로 판정되어 사양 표의 배제와 맞는다(보고에 적는다).
 */
import type { AlgorithmFn, FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type Rect = { x: number; y: number; w: number; h: number };

export type RepaintCostData = {
  type: 'repaint-cost';
  stepMs: number;
  width: number;
  /** 문서 흐름 순서(위→아래)의 다섯 요소. */
  elements: { id: string; h: number }[];
  /** card 의 두 자식 중 card-title 의 고정 높이. card-text 는 card 높이에서 이를 뺀 나머지를 채운다. */
  cardTitleH: number;
  /** property=height 일 때 card 에 더해지는 높이. */
  heightGrow: number;
  /** property=transform 일 때 card 가 옆으로 옮겨가는 거리. */
  translateX: number;
  badge: Rect;
  /** 현재 손잡이 값. */
  property: number;
  cardLayer: number;
};

export const PROPERTY_VALUES = [0, 1, 2, 3] as const;
export const CARD_LAYER_VALUES = [0, 1] as const;

export type Stage = 'style' | 'layout' | 'paint' | 'composite';

/** 화면에 그리는 순서 — 위에서 아래로 읽는 순서와 같다. */
export const DRAW_ORDER = ['header', 'intro', 'card', 'card-title', 'card-text', 'list', 'footer', 'badge', 'page'] as const;

export type RoundSummary = {
  chain: string;
  renderTreeChange: number;
  boxesRemeasured: number;
  repaintedCount: number;
  repaintedList: string;
  layers: number;
};

export type RoundPlan = {
  stages: Stage[];
  renderTreeChange: number;
  boxesRemeasured: number;
  repainted: string[];
  layers: number;
  /** 이번 판에서 실제로 존재하는 요소의 최종(post-layout) 사각형. */
  rects: Record<string, Rect>;
  /** 겨눔에 실제로 쓰인 후보 사각형(움직임 갈래는 rects 전부, 칠하기 갈래는 파인트 사슬만). */
  candidates: Record<string, Rect>;
  /** 겨눔에 쓴 dirty 사각형. 겨눔 자체를 건너뛴 조합(transform×떼어 둠)은 null. */
  dirty: Rect | null;
  /** 렌더 트리에서 사라진 요소. */
  removed: string[];
  summary: RoundSummary;
};

/** 사각형 겹침 — 비교 넷. irs.ts 의 `overlap` 과 같은 식이다(엄격한 `<`, 경계는 겹침이 아니다). */
export function overlap(a: Rect, b: Rect): boolean {
  if (a.x < b.x + b.w) {
    if (b.x < a.x + a.w) {
      if (a.y < b.y + b.h) {
        if (b.y < a.y + a.h) return true;
      }
    }
  }
  return false;
}

function unionRect(rects: Rect[]): Rect {
  const first = rects[0];
  if (!first) throw new Error('unionRect: 빈 목록');
  let x0 = first.x;
  let y0 = first.y;
  let x1 = first.x + first.w;
  let y1 = first.y + first.h;
  for (const r of rects.slice(1)) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 후보들을 dirty 사각형과 겨눠 겹치는 것만 골라낸다(DRAW_ORDER 순서로). */
function sweep(candidates: Record<string, Rect>, dirty: Rect): string[] {
  const out: string[] = [];
  for (const id of DRAW_ORDER) {
    const r = candidates[id];
    if (r && overlap(r, dirty)) out.push(id);
  }
  return out;
}

function heightOf(data: RepaintCostData, id: string): number {
  const found = data.elements.find((e) => e.id === id);
  if (!found) throw new Error(`repaint-cost: 알 수 없는 요소 ${id}`);
  return found.h;
}

/** card 를 포함한 문서 흐름의 사각형 전부. cardXOffset 은 transform 의 시각적 x 이동(레이아웃 자체는 그대로). */
function flowWithCard(data: RepaintCostData, cardH: number, cardXOffset: number): Record<string, Rect> {
  const w = data.width;
  let y = 0;
  const header: Rect = { x: 0, y, w, h: heightOf(data, 'header') }; y += header.h;
  const intro: Rect = { x: 0, y, w, h: heightOf(data, 'intro') }; y += intro.h;
  const cardY = y;
  const card: Rect = { x: cardXOffset, y: cardY, w, h: cardH };
  const cardTitle: Rect = { x: cardXOffset, y: cardY, w, h: data.cardTitleH };
  const cardText: Rect = { x: cardXOffset, y: cardY + data.cardTitleH, w, h: cardH - data.cardTitleH };
  y += cardH;
  const list: Rect = { x: 0, y, w, h: heightOf(data, 'list') }; y += list.h;
  const footer: Rect = { x: 0, y, w, h: heightOf(data, 'footer') }; y += footer.h;
  const page: Rect = { x: 0, y: 0, w, h: y };
  return { header, intro, card, 'card-title': cardTitle, 'card-text': cardText, list, footer, page };
}

/** card 가 렌더 트리에서 사라진 문서 흐름. */
function flowWithoutCard(data: RepaintCostData): Record<string, Rect> {
  const w = data.width;
  let y = 0;
  const header: Rect = { x: 0, y, w, h: heightOf(data, 'header') }; y += header.h;
  const intro: Rect = { x: 0, y, w, h: heightOf(data, 'intro') }; y += intro.h;
  const list: Rect = { x: 0, y, w, h: heightOf(data, 'list') }; y += list.h;
  const footer: Rect = { x: 0, y, w, h: heightOf(data, 'footer') }; y += footer.h;
  const page: Rect = { x: 0, y: 0, w, h: y };
  return { header, intro, list, footer, page };
}

function countRemeasured(
  ids: string[],
  before: Record<string, Rect>,
  after: Record<string, Rect>,
  removedCount: number,
): number {
  let changed = removedCount;
  for (const id of ids) {
    const b = before[id];
    const a = after[id];
    if (!b || !a) continue;
    if (b.x !== a.x || b.y !== a.y || b.w !== a.w || b.h !== a.h) changed += 1;
  }
  return changed;
}

function chainOf(stages: Stage[]): string {
  return stages.join('→');
}

function makeSummary(stages: Stage[], renderTreeChange: number, boxesRemeasured: number, repainted: string[], layers: number): RoundSummary {
  return {
    chain: chainOf(stages),
    renderTreeChange,
    boxesRemeasured,
    repaintedCount: repainted.length,
    repaintedList: repainted.join(' '),
    layers,
  };
}

/**
 * 한 판을 셈한다 — property(0 display·1 height·2 color·3 transform) 와 cardLayer(0 함께·1 떼어 둠)
 * 로 도는 단계·렌더 트리 변화·다시 잰 상자·다시 칠한 집합·층 수를 낸다.
 *
 * 두 갈래.
 *   움직임 갈래(display/height/transform) — 옛 자리와 새 자리를 아우른 사각형(dirty)을 만들고
 *   지금 존재하는 요소 전부(badge·page 포함)를 그 사각형과 겨눠 겹치는 것만 다시 칠한다. 레이아웃이
 *   도는 두 속성(display/height)은 page 사각형도 늘 겨눔 후보다(레이아웃이 도는 한 층 분리가 못
 *   막는다). transform 은 card 가 제 장에 있으면(cardLayer=1) 이 갈래 자체를 건너뛴다 — 합성기가
 *   장을 그대로 옮길 뿐이라 다시 칠할 사각형이 아예 생기지 않는다.
 *   칠하기 갈래(color) — 움직임이 없다. 바뀐 요소(card-text)에서 그 파이트 사슬을 따라
 *   card, 그리고 card 가 제 장이 아니면 page 까지만 다시 칠한다. badge 처럼 자리만 겹치는
 *   이웃은 겨누지 않는다(칠하기만으로는 옆 요소를 건드리지 않는다).
 */
export function planRound(data: RepaintCostData, property: number, cardLayer: number): RoundPlan {
  const cardH0 = heightOf(data, 'card');
  const base = flowWithCard(data, cardH0, 0);
  const badge = data.badge;

  if (property === 0) {
    const after = flowWithoutCard(data);
    const dirty = unionRect([
      base.card!, base['card-title']!, base['card-text']!,
      base.list!, after.list!,
      base.footer!, after.footer!,
    ]);
    const rects: Record<string, Rect> = { header: after.header!, intro: after.intro!, list: after.list!, footer: after.footer!, badge, page: after.page! };
    const repainted = sweep(rects, dirty);
    const stages: Stage[] = ['style', 'layout', ...(repainted.length > 0 ? (['paint'] as const) : []), 'composite'];
    const renderTreeChange = 3;
    const boxesRemeasured = countRemeasured(['list', 'footer'], base, after, renderTreeChange);
    const layers = 1; // card 가 없으니 제 장에 떼어 둘 것도 없다 — 손잡이와 무관하게 1
    return { stages, renderTreeChange, boxesRemeasured, repainted, layers, rects, candidates: rects, dirty, removed: ['card', 'card-title', 'card-text'], summary: makeSummary(stages, renderTreeChange, boxesRemeasured, repainted, layers) };
  }

  if (property === 1) {
    const cardH1 = cardH0 + data.heightGrow;
    const after = flowWithCard(data, cardH1, 0);
    const dirty = unionRect([base.card!, after.card!, base.list!, after.list!, base.footer!, after.footer!]);
    const rects: Record<string, Rect> = {
      header: after.header!, intro: after.intro!,
      card: after.card!, 'card-title': after['card-title']!, 'card-text': after['card-text']!,
      list: after.list!, footer: after.footer!,
      badge, page: after.page!,
    };
    const repainted = sweep(rects, dirty);
    const stages: Stage[] = ['style', 'layout', ...(repainted.length > 0 ? (['paint'] as const) : []), 'composite'];
    const renderTreeChange = 0;
    const boxesRemeasured = countRemeasured(['card', 'card-title', 'card-text', 'list', 'footer'], base, after, renderTreeChange);
    const layers = cardLayer === 1 ? 2 : 1;
    return { stages, renderTreeChange, boxesRemeasured, repainted, layers, rects, candidates: rects, dirty, removed: [], summary: makeSummary(stages, renderTreeChange, boxesRemeasured, repainted, layers) };
  }

  if (property === 2) {
    const rects: Record<string, Rect> = {
      header: base.header!, intro: base.intro!,
      card: base.card!, 'card-title': base['card-title']!, 'card-text': base['card-text']!,
      list: base.list!, footer: base.footer!,
      badge, page: base.page!,
    };
    const dirty = base['card-text']!;
    const chain = cardLayer === 1 ? ['card-text', 'card'] : ['card-text', 'card', 'page'];
    const restricted: Record<string, Rect> = {};
    for (const id of chain) restricted[id] = rects[id]!;
    const repainted = sweep(restricted, dirty);
    const stages: Stage[] = ['style', ...(repainted.length > 0 ? (['paint'] as const) : []), 'composite'];
    const layers = cardLayer === 1 ? 2 : 1;
    return { stages, renderTreeChange: 0, boxesRemeasured: 0, repainted, layers, rects, candidates: restricted, dirty, removed: [], summary: makeSummary(stages, 0, 0, repainted, layers) };
  }

  // property === 3: transform
  if (cardLayer === 1) {
    const rects: Record<string, Rect> = {
      header: base.header!, intro: base.intro!,
      card: { ...base.card!, x: base.card!.x + data.translateX },
      'card-title': { ...base['card-title']!, x: base['card-title']!.x + data.translateX },
      'card-text': { ...base['card-text']!, x: base['card-text']!.x + data.translateX },
      list: base.list!, footer: base.footer!,
      badge, page: base.page!,
    };
    const stages: Stage[] = ['style', 'composite'];
    return { stages, renderTreeChange: 0, boxesRemeasured: 0, repainted: [], layers: 2, rects, candidates: {}, dirty: null, removed: [], summary: makeSummary(stages, 0, 0, [], 2) };
  }
  const movedCard: Rect = { ...base.card!, x: base.card!.x + data.translateX };
  const rects: Record<string, Rect> = {
    header: base.header!, intro: base.intro!,
    card: movedCard,
    'card-title': { ...base['card-title']!, x: base['card-title']!.x + data.translateX },
    'card-text': { ...base['card-text']!, x: base['card-text']!.x + data.translateX },
    list: base.list!, footer: base.footer!,
    badge, page: base.page!,
  };
  const dirty = unionRect([base.card!, movedCard]);
  const repainted = sweep(rects, dirty);
  const stages: Stage[] = ['style', ...(repainted.length > 0 ? (['paint'] as const) : []), 'composite'];
  return { stages, renderTreeChange: 0, boxesRemeasured: 0, repainted, layers: 1, rects, candidates: rects, dirty, removed: [], summary: makeSummary(stages, 0, 0, repainted, 1) };
}

/** 지금 값을 들고 차이만 보내는 계기 헬퍼 — ctx.metric 은 누적 채널이다. */
function metricHelper(ctx: FacetContext<RepaintCostData>): (name: string, value: number) => void {
  const last = new Map<string, number>();
  return (name, value) => {
    const prev = last.get(name) ?? 0;
    ctx.metric(name, value - prev);
    last.set(name, value);
  };
}

const phase = (ctx: FacetContext<RepaintCostData>, name: string): Promise<void> =>
  ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

/** 다음 유효한 손잡이 입력을 기다린다. 우리 것이 아닌 입력이나 사다리 밖 값은 흘려보낸다. */
async function nextHandles(
  rc: ReactiveContext<RepaintCostData>,
  property: number,
  cardLayer: number,
): Promise<{ property: number; cardLayer: number } | null> {
  for (;;) {
    if (rc.cancelled) return null;
    const input: ReactiveInputEvent = await rc.waitForInput();
    if (rc.cancelled) return null;
    const payload = input.payload;
    if (typeof payload !== 'object' || payload === null || !('value' in payload)) continue;
    const value = (payload as { value: unknown }).value;
    if (typeof value !== 'number') continue;
    if (input.type === 'property' && (PROPERTY_VALUES as readonly number[]).includes(value)) {
      return { property: value, cardLayer };
    }
    if (input.type === 'cardLayer' && (CARD_LAYER_VALUES as readonly number[]).includes(value)) {
      return { property, cardLayer: value };
    }
  }
}

export const repaintCostAlgorithm: AlgorithmFn<RepaintCostData> = async (ctx0) => {
  const ctx = ctx0 as ReactiveContext<RepaintCostData>;
  const metricTo = metricHelper(ctx0);
  let property = ctx.data.property;
  let cardLayer = ctx.data.cardLayer;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const plan = planRound(ctx.data, property, cardLayer);
      ctx.data.property = property;
      ctx.data.cardLayer = cardLayer;
      metricTo('layers', plan.layers);

      await ctx.emit({ type: 'reset-round', payload: { property, cardLayer } });
      if (ctx.cancelled) return;
      if (!(await ctx.sleep(ctx.data.stepMs))) return;

      await ctx.emit({ type: 'stage', payload: { stage: 'style' } });
      if (ctx.cancelled) return;
      if (!(await ctx.sleep(ctx.data.stepMs))) return;

      if (plan.stages.includes('layout')) {
        await ctx.emit({ type: 'stage', payload: { stage: 'layout', rects: plan.rects, removed: plan.removed } });
        if (ctx.cancelled) return;
        if (!(await ctx.sleep(ctx.data.stepMs))) return;
      }

      if (plan.repainted.length > 0) {
        await phase(ctx, 'paint');
        for (const id of plan.repainted) {
          if (ctx.cancelled) return;
          await ctx.emit({ type: 'stage', payload: { stage: 'paint', id } });
          if (!(await ctx.sleep(ctx.data.stepMs))) return;
        }
      }

      await ctx.emit({ type: 'stage', payload: { stage: 'composite', dx: property === 3 ? ctx.data.translateX : 0, summary: plan.summary } });
      if (ctx.cancelled) return;

      metricTo('stages', plan.stages.length);
      metricTo('repainted', plan.repainted.length);

      if (!(await ctx.sleep(ctx.data.stepMs))) return;

      const next = await nextHandles(ctx, property, cardLayer);
      if (next === null) return;
      property = next.property;
      cardLayer = next.cardLayer;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
};
