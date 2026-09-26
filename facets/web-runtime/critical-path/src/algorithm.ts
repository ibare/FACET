/**
 * critical-path — 크리티컬 렌더링 패스와 로딩 순서.
 *
 * 머리에 둔 `<script src="app.js">` 의 속성(없음/defer/async)과, CSS 안에서만 불리는
 * 글꼴을 `<link rel="preload">` 로 미리 당겨 둘지가 첫 장의 시각과 그 뒤 글꼴 바뀜을
 * 어떻게 가르는지 재생한다. 한 판을 끝까지 재생한 뒤 `waitForInput` 으로 다음 손잡이
 * 값을 받아 다시 재생한다 (reactive).
 *
 * ── 이벤트
 *
 *   'timeline' (silent 아님) — payload: { kind: TimelineKind; at: number; attr: number; preload: number; [필드는 kind 별] }
 *     `attr`/`preload` 는 이 판의 손잡이 값 — stage 가 매 이벤트에서 다시 읽어 머리 줄 구성을 고친다.
 *     이 판의 맨 첫 이벤트에만 `roundStart: true` 가 실린다 — stage 가 화면을 판 시작 상태로 되돌리는 신호.
 *     kind 별 여분 필드:
 *       request-font-preload / request-site / request-app  → { resource: 'font'|'site'|'app' }
 *       parser-stop / parser-resume                          → {}
 *       site-arrive / app-arrive / font-arrive               → { resource: 'site'|'app'|'font' }
 *       app-exec                                             → {}
 *       first-paint     → { lines: number[][]; brandInitial: boolean; gap?: { ms: number; beforePaint: boolean } }
 *                          (lines 는 첫 장 순간에 그릴 줄나눔 — brandInitial 이면 Brand, 아니면 대체 글꼴)
 *       font-needed / font-already-arrived                   → {}
 *       font-swap                                            → { lines: number[][] } (Brand 로 다시 놓은 줄 — 낱말 인덱스)
 *       parse-end                                            → { gap?: { ms: number; beforePaint: boolean } }
 *       dcl                                                  → {}
 *       body-sweep (phase 채널에 얹지 않는 유일한 kind)       → { fromLine: string; toLine: string; durationMs: number }
 *
 *   'phase' (silent) — payload: { phase: <아래 phase 어휘> }. `body-sweep` 은 phase 로 보내지 않는다
 *     (걸음 경계가 없는 연속 구간이라 코드 패널이 이전 줄을 그대로 보이게 두는 것이 뜻이다 — IR 에도
 *     대응하는 문장이 없다).
 *
 * ── phase 어휘 (irs.ts 와 정확히 같은 집합)
 *
 *   request-font-preload · request-site · request-app · parser-stop · site-arrive · app-arrive ·
 *   app-exec · parser-resume · first-paint · font-needed · font-already-arrived · font-arrive ·
 *   font-swap · parse-end · dcl
 *
 * ── 계기
 *
 *   parser-stall-ms    · first-paint-ms · fallback-shown-ms
 *   셋 다 "지금 값을 들고 차이만 보내는" 누적 채널 헬퍼(`report`)로 보낸다.
 */
import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

// ─────────────────────────────────────────────────────────────────────────────
// 자료 — 구조가 1차. 파생값(타임라인 열여섯 자리 · 줄바꿈)은 이 아래에서 셈한다.
// ─────────────────────────────────────────────────────────────────────────────

export type ResourceId = 'site' | 'app' | 'font';

export type DocLine = { id: string; code: string };

export type CriticalPathData = {
  type: 'critical-path';
  stepMs: number;
  /** 0 없음 · 1 defer · 2 async */
  attr: number;
  /** 0 없음 · 1 있음 */
  preload: number;
  attrLadder: number[];
  preloadLadder: number[];
  preloadLine: string;
  cssLine: string;
  /** 속성 값(0/1/2) 별 app 줄의 코드 글자 — 자료다, 번역하지 않는다. */
  appLineByAttr: Record<number, string>;
  bodyLines: DocLine[];
  cssText: string[];
  resources: Record<ResourceId, { receiveMs: number; execMs?: number }>;
  words: string[];
  fallbackFont: { charPx: number; spacePx: number };
  brandFont: { charPx: number; spacePx: number };
  boxWidthPx: number;
};

/** 한 줄을 읽는 데 걸리는 시간(ms) — 공통 안내문의 모형. */
const LINE_READ_MS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// 타임라인 — algorithm.ts 와 irs.ts 가 같은 식을 쓴다 (계약 카드 "셈하는 식").
// ─────────────────────────────────────────────────────────────────────────────

export type Timeline = {
  reqSite: number;
  arriveSite: number;
  reqApp: number;
  arriveApp: number;
  execAppStart: number;
  execAppEnd: number;
  parseEndAt: number;
  firstPaintAt: number;
  dclAt: number;
  stallMs: number;
  fontReqAt: number;
  fontArriveAt: number;
  /** 없으면 -1. */
  swapAt: number;
  fallbackShownMs: number;
  domGapMs: number;
  /** 1 = afterPaint(첫 장이 먼저) · 0 = beforePaint(DOM 이 먼저). */
  domGapType: number;
};

export function computeTimeline(
  attr: number,
  preload: number,
  data: Pick<CriticalPathData, 'resources' | 'bodyLines'>,
): Timeline {
  const preloadOn = preload === 1;
  const bodyCount = data.bodyLines.length;
  const reqSite = (preloadOn ? 2 : 1) * LINE_READ_MS;
  const reqApp = (preloadOn ? 3 : 2) * LINE_READ_MS;
  const arriveSite = reqSite + data.resources.site.receiveMs;
  const arriveApp = reqApp + data.resources.app.receiveMs;
  const execMs = data.resources.app.execMs ?? 0;

  let execAppStart: number;
  let execAppEnd: number;
  let stallMs: number;
  let firstPaintAt: number;
  let parseEndAt: number;
  let dclAt: number;

  if (attr === 0) {
    execAppStart = arriveApp;
    execAppEnd = execAppStart + execMs;
    stallMs = execAppEnd - reqApp;
    firstPaintAt = Math.max(execAppEnd + LINE_READ_MS, arriveSite);
    parseEndAt = firstPaintAt + (bodyCount - 1) * LINE_READ_MS;
    dclAt = parseEndAt;
  } else {
    stallMs = 0;
    parseEndAt = reqApp + bodyCount * LINE_READ_MS;
    firstPaintAt = Math.max(reqApp + LINE_READ_MS, arriveSite);
    execAppStart = Math.max(parseEndAt, arriveApp);
    execAppEnd = execAppStart + execMs;
    dclAt = attr === 1 ? execAppEnd : parseEndAt;
  }

  const fontReqAt = preloadOn ? LINE_READ_MS : firstPaintAt;
  const fontArriveAt = fontReqAt + data.resources.font.receiveMs;
  const swapAt = fontArriveAt > firstPaintAt ? fontArriveAt : -1;
  const fallbackShownMs = swapAt >= 0 ? swapAt - firstPaintAt : 0;

  const domGapMs = attr === 0 ? parseEndAt - firstPaintAt : firstPaintAt - parseEndAt;
  const domGapType = attr === 0 ? 1 : 0;

  return {
    reqSite,
    arriveSite,
    reqApp,
    arriveApp,
    execAppStart,
    execAppEnd,
    parseEndAt,
    firstPaintAt,
    dclAt,
    stallMs,
    fontReqAt,
    fontArriveAt,
    swapAt,
    fallbackShownMs,
    domGapMs,
    domGapType,
  };
}

/** 16 자리 배열 — IR 의 `out` 과 자리가 같다 (계약 카드의 자리표). */
export function timelineToArray(tl: Timeline): number[] {
  return [
    tl.reqSite,
    tl.arriveSite,
    tl.reqApp,
    tl.arriveApp,
    tl.execAppStart,
    tl.execAppEnd,
    tl.parseEndAt,
    tl.firstPaintAt,
    tl.dclAt,
    tl.stallMs,
    tl.fontReqAt,
    tl.fontArriveAt,
    tl.swapAt,
    tl.fallbackShownMs,
    tl.domGapMs,
    tl.domGapType,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 줄바꿈 — 욕심 줄바꿈. IR 밖에 둔다 (irs.ts 상단 주석의 까닭 참조).
// ─────────────────────────────────────────────────────────────────────────────

/** 낱말 인덱스를 욕심 줄바꿈으로 줄 나눈다. */
export function wrapWords(words: string[], charPx: number, spacePx: number, boxPx: number): number[][] {
  const lines: number[][] = [];
  let cur: number[] = [];
  let curWidth = 0;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]!.length * charPx;
    if (cur.length === 0) {
      cur = [i];
      curWidth = w;
      continue;
    }
    const next = curWidth + spacePx + w;
    if (next > boxPx) {
      lines.push(cur);
      cur = [i];
      curWidth = w;
    } else {
      cur.push(i);
      curWidth = next;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

/** 두 줄나눔에서 낱말의 줄 번호가 바뀐 낱말 인덱스. */
export function changedLineWords(a: number[][], b: number[][]): number[] {
  const lineOf = (lines: number[][]): Map<number, number> => {
    const m = new Map<number, number>();
    lines.forEach((line, li) => line.forEach((wi) => m.set(wi, li)));
    return m;
  };
  const la = lineOf(a);
  const lb = lineOf(b);
  const out: number[] = [];
  for (const [wi, li] of la) if (lb.get(wi) !== li) out.push(wi);
  return out.sort((x, y) => x - y);
}

// ─────────────────────────────────────────────────────────────────────────────
// 계기 — 누적 채널. 지금 값을 들고 차이만 보내는 헬퍼.
// ─────────────────────────────────────────────────────────────────────────────

function makeMetricReporter(ctx: FacetContext<CriticalPathData>): (name: string, value: number) => void {
  const shown = new Map<string, number>();
  const sentOnce = new Set<string>();
  return (name, value) => {
    const prev = shown.get(name) ?? 0;
    const delta = value - prev;
    if (delta !== 0 || !sentOnce.has(name)) {
      ctx.metric(name, delta);
      sentOnce.add(name);
    }
    shown.set(name, value);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 걸음 — 판 하나(attr · preload 고정)를 시간순으로 재생한다.
// ─────────────────────────────────────────────────────────────────────────────

type Step = {
  at: number;
  order: number;
  kind: string;
  extra?: Record<string, unknown>;
  sweep?: boolean;
};

const STEP_MS = 700;
const SWEEP_MS = 900;

function buildSteps(
  attr: number,
  preload: number,
  tl: Timeline,
  fallbackLines: number[][],
  brandLines: number[][],
): Step[] {
  const steps: Step[] = [];
  if (preload === 1) {
    steps.push({ at: LINE_READ_MS, order: -4, kind: 'request-font-preload', extra: { resource: 'font', line: 'preload' } });
  }
  steps.push({ at: tl.reqSite, order: -3, kind: 'request-site', extra: { resource: 'site', line: 'css' } });
  steps.push({ at: tl.reqApp, order: -3, kind: 'request-app', extra: { resource: 'app', line: 'app' } });

  if (attr === 0) {
    steps.push({ at: tl.reqApp, order: -2, kind: 'parser-stop', extra: { line: 'app' } });
  }

  // 본문을 잇달아 읽는 연속 구간 — attr==0 은 h1(첫 장) 뒤 나머지를, 그 밖은 app 줄 뒤 본문 전체를 훑는다.
  const sweepAnchor = attr === 0 ? tl.firstPaintAt : tl.reqApp;
  steps.push({
    at: sweepAnchor + 0.5,
    order: 0,
    kind: 'body-sweep',
    sweep: true,
    extra: {
      fromLine: attr === 0 ? 'p1' : 'h1',
      toLine: 'footer',
      durationMs: SWEEP_MS,
    },
  });

  steps.push({ at: tl.arriveSite, order: 0, kind: 'site-arrive', extra: { resource: 'site' } });
  steps.push({ at: tl.arriveApp, order: 0, kind: 'app-arrive', extra: { resource: 'app' } });
  steps.push({ at: tl.execAppStart, order: 0.5, kind: 'app-exec' });
  if (attr === 0) {
    steps.push({ at: tl.execAppEnd, order: 0.4, kind: 'parser-resume' });
  }

  const gapAtParseEnd = tl.parseEndAt >= tl.firstPaintAt;
  const gap = { ms: tl.domGapMs, beforePaint: tl.domGapType === 0 };

  steps.push({
    at: tl.firstPaintAt,
    order: 0.6,
    kind: 'first-paint',
    extra: {
      lines: tl.swapAt === -1 ? brandLines : fallbackLines,
      brandInitial: tl.swapAt === -1,
      ...(attr === 0 ? { line: 'h1' } : {}),
      ...(gapAtParseEnd ? {} : { gap }),
    },
  });

  if (preload === 0) {
    steps.push({ at: tl.firstPaintAt, order: 0.7, kind: 'font-needed' });
  } else if (tl.swapAt === -1) {
    steps.push({ at: tl.firstPaintAt, order: 0.7, kind: 'font-already-arrived' });
  }

  steps.push({ at: tl.fontArriveAt, order: 0, kind: 'font-arrive', extra: { resource: 'font' } });
  if (tl.swapAt !== -1) {
    steps.push({ at: tl.swapAt, order: 0.2, kind: 'font-swap', extra: { lines: brandLines } });
  }

  steps.push({
    at: tl.parseEndAt,
    order: 0.3,
    kind: 'parse-end',
    extra: { line: 'footer', ...(gapAtParseEnd ? { gap } : {}) },
  });
  steps.push({ at: tl.dclAt, order: 0.5, kind: 'dcl' });

  steps.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.order - b.order));
  const head = steps[0];
  if (head) head.extra = { ...(head.extra ?? {}), roundStart: true };
  return steps;
}

/** 한 판을 끝까지 재생. 취소되면 false. */
async function playRound(
  rc: ReactiveContext<CriticalPathData>,
  attr: number,
  preload: number,
  data: CriticalPathData,
  report: (name: string, value: number) => void,
): Promise<boolean> {
  const tl = computeTimeline(attr, preload, data);
  const phase = (name: string) => rc.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const fallbackLines = wrapWords(data.words, data.fallbackFont.charPx, data.fallbackFont.spacePx, data.boxWidthPx);
  const brandLines = wrapWords(data.words, data.brandFont.charPx, data.brandFont.spacePx, data.boxWidthPx);

  const steps = buildSteps(attr, preload, tl, fallbackLines, brandLines);
  for (const step of steps) {
    if (rc.cancelled) return false;
    await rc.emit({ type: 'timeline', payload: { kind: step.kind, at: step.at, attr, preload, ...(step.extra ?? {}) } });
    if (step.kind === 'app-exec') report('parser-stall-ms', tl.stallMs);
    if (step.kind === 'first-paint') report('first-paint-ms', tl.firstPaintAt);
    if (step.kind === 'font-already-arrived') report('fallback-shown-ms', 0);
    if (step.kind === 'font-swap') report('fallback-shown-ms', tl.fallbackShownMs);
    if (!step.sweep) await phase(step.kind);
    if (!(await rc.sleep(step.sweep ? SWEEP_MS : STEP_MS))) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────────────────────────────────────────

function numericValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' ? v : null;
}

export async function criticalPathAlgorithm(ctx: FacetContext<CriticalPathData>): Promise<void> {
  const rc = ctx as ReactiveContext<CriticalPathData>;
  const report = makeMetricReporter(ctx);
  let attr = ctx.data.attr;
  let preload = ctx.data.preload;

  while (true) {
    if (rc.cancelled) return;
    const ok = await playRound(rc, attr, preload, ctx.data, report);
    if (!ok || rc.cancelled) return;

    let handled = false;
    while (!handled) {
      if (rc.cancelled) return;
      const input: ReactiveInputEvent = await rc.waitForInput();
      if (rc.cancelled) return;
      if (input.type === 'setAttr') {
        const v = numericValue(input.payload);
        if (v !== null && ctx.data.attrLadder.includes(v)) {
          attr = v;
          handled = true;
        }
      } else if (input.type === 'setPreload') {
        const v = numericValue(input.payload);
        if (v !== null && ctx.data.preloadLadder.includes(v)) {
          preload = v;
          handled = true;
        }
      }
    }
  }
}
