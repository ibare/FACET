/**
 * 이벤트 (모두 `await ctx.emit` 으로, silent 아님):
 *
 * - `headParsed`     { entries: { id: string; src: string; kind: 'css'|'script'; requestedAt: number; blocking: boolean }[] }
 *                     머리 줄 넷을 다 읽어 넷 모두 요청을 낸 시점. 어느 것이 첫 장을 막는지(blocking) 함께 싣는다.
 * - `bodyParsed`      { at: number; lineCount: number }
 *                     본문 줄을 다 읽어 파싱이 끝난 시점. 아직 화면은 비어 있다.
 * - `resourceArrived` { src: string; at: number }
 *                     실행하지 않는 자원(css)이 도착한 시점.
 * - `firstPaint`      { at: number; blockedBy: string[]; unfinished: string[] }
 *                     첫 장이 찍힌 시점. `blockedBy` 는 첫 장을 막았던 자원, `unfinished` 는
 *                     그 시점에 아직 도착·실행이 끝나지 않은 머리 자원.
 * - `scriptStarted`   { src: string; at: number }
 *                     스크립트가 도착해 실행을 시작한 시점(도착과 같은 ms).
 * - `scriptFinished`  { src: string; at: number; domContentLoaded: boolean }
 *                     스크립트 실행이 끝난 시점. `domContentLoaded` 가 참이면 이 끝남이
 *                     DOMContentLoaded 를 함께 연다(defer 스크립트를 모두 실행한 뒤).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HeadKind = 'css' | 'script';

export type WhatFirstPaintHeadLine = {
  id: string;
  kind: HeadKind;
  src: string;
  /** 문서에 쓰인 그대로의 태그 글자 — 번역하지 않는 자료. */
  tag: string;
  /** css 줄에만. 생략하면 'screen'. */
  media?: 'screen' | 'print';
  /** script 줄에만. */
  attr?: 'async' | 'defer';
};

export type WhatFirstPaintBodyLine = {
  id: string;
};

export type WhatFirstPaintResource = {
  dur: number;
  /** script 자원에만 — 실행 시간. */
  exec?: number;
};

export type WhatFirstPaintNeedsFacetData = {
  type: 'what-first-paint-needs';
  /** 한 줄을 읽는 데 걸리는 ms. */
  parseMs: number;
  head: WhatFirstPaintHeadLine[];
  body: WhatFirstPaintBodyLine[];
  resources: Record<string, WhatFirstPaintResource>;
  stepMs: number;
};

export type HeadParsedEntry = {
  id: string;
  src: string;
  kind: HeadKind;
  requestedAt: number;
  blocking: boolean;
};

type Moment =
  | { t: number; order: 0; kind: 'cssArrived'; src: string }
  | { t: number; order: 1; kind: 'firstPaint' }
  | { t: number; order: 0; kind: 'scriptStarted'; src: string }
  | { t: number; order: 0; kind: 'scriptFinished'; src: string };

export async function whatFirstPaintNeeds(
  rawCtx: FacetContext<WhatFirstPaintNeedsFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<WhatFirstPaintNeedsFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function resourceOf(src: string): WhatFirstPaintResource {
    const r = data.resources[src];
    if (!r) throw new Error(`자료에 없는 자원 "${src}"`);
    return r;
  }

  // 1) 머리 줄 넷을 차례로 읽는다 — 줄마다 요청이 나가고, 막는지 아닌지가 그 자리에서 갈린다.
  let t = 0;
  const requestedAt: Record<string, number> = {};
  const blockingCssSrcs: string[] = [];
  const headEntries: HeadParsedEntry[] = [];
  for (const line of data.head) {
    t += data.parseMs;
    let blocking: boolean;
    if (line.kind === 'css') {
      const media = line.media ?? 'screen';
      if (media !== 'screen' && media !== 'print') {
        throw new Error(`알 수 없는 media 값 "${String(media)}" (줄 ${line.id})`);
      }
      blocking = media === 'screen';
      if (blocking) blockingCssSrcs.push(line.src);
    } else if (line.kind === 'script') {
      if (line.attr !== 'async' && line.attr !== 'defer') {
        throw new Error(`알 수 없는 script 속성 "${String(line.attr)}" (줄 ${line.id})`);
      }
      blocking = false;
    } else {
      throw new Error(`알 수 없는 줄 종류 "${String(line.kind)}" (줄 ${line.id})`);
    }
    requestedAt[line.src] = t;
    headEntries.push({ id: line.id, src: line.src, kind: line.kind, requestedAt: t, blocking });
  }
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'headParsed', payload: { entries: headEntries } });
  if (!(await pause())) return;

  // 2) 본문 줄을 읽는다 — 요청은 없다, 파싱이 끝난다.
  for (const _line of data.body) t += data.parseMs;
  const parseEndAt = t;
  await ctx.emit({ type: 'bodyParsed', payload: { at: parseEndAt, lineCount: data.body.length } });
  if (!(await pause())) return;

  function arrivalOf(src: string): number {
    return requestedAt[src] + resourceOf(src).dur;
  }

  const cssLines = data.head.filter((l): l is WhatFirstPaintHeadLine => l.kind === 'css');
  const scriptLines = data.head.filter((l): l is WhatFirstPaintHeadLine => l.kind === 'script');

  // 3) 스크립트 실행 차례 — 준비된 순서대로, 한 번에 하나씩(메인 스레드는 하나다).
  type ExecPlan = { src: string; attr: 'async' | 'defer'; readyAt: number; exec: number };
  const plans: ExecPlan[] = scriptLines.map((line) => {
    const attr = line.attr;
    if (attr !== 'async' && attr !== 'defer') {
      throw new Error(`알 수 없는 script 속성 "${String(attr)}" (줄 ${line.id})`);
    }
    const arr = arrivalOf(line.src);
    const exec = resourceOf(line.src).exec;
    if (exec === undefined) throw new Error(`script 자원에 exec 이 없다 "${line.src}"`);
    const readyAt =
      attr === 'async'
        ? arr
        : Math.max(arr, parseEndAt, ...blockingCssSrcs.map((s) => arrivalOf(s)));
    return { src: line.src, attr, readyAt, exec };
  });
  const orderedPlans = [...plans].sort((a, b) => a.readyAt - b.readyAt);
  let mainThreadFreeAt = parseEndAt;
  const execWindow: Record<string, { start: number; end: number }> = {};
  for (const plan of orderedPlans) {
    const start = Math.max(plan.readyAt, mainThreadFreeAt);
    const end = start + plan.exec;
    execWindow[plan.src] = { start, end };
    mainThreadFreeAt = end;
  }

  const deferSrcs = new Set(plans.filter((p) => p.attr === 'defer').map((p) => p.src));
  const dclAt =
    deferSrcs.size > 0
      ? Math.max(...[...deferSrcs].map((src) => execWindow[src].end))
      : parseEndAt;

  function doneAt(src: string): number {
    const line = data.head.find((l) => l.src === src);
    if (!line) throw new Error(`머리에 없는 자원 "${src}"`);
    return line.kind === 'css' ? arrivalOf(src) : execWindow[src].end;
  }

  // 4) 첫 장 시각 — 화면 막는 css 가 모두 도착하고 본문을 다 읽은 가장 이른 때.
  const paintAt =
    blockingCssSrcs.length > 0
      ? Math.max(parseEndAt, ...blockingCssSrcs.map((s) => arrivalOf(s)))
      : parseEndAt;

  // 5) 사건을 때 순서로 편다.
  const moments: Moment[] = [];
  for (const line of cssLines) moments.push({ t: arrivalOf(line.src), order: 0, kind: 'cssArrived', src: line.src });
  moments.push({ t: paintAt, order: 1, kind: 'firstPaint' });
  for (const plan of plans) {
    moments.push({ t: execWindow[plan.src].start, order: 0, kind: 'scriptStarted', src: plan.src });
    moments.push({ t: execWindow[plan.src].end, order: 0, kind: 'scriptFinished', src: plan.src });
  }
  moments.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.order - b.order));

  const allHeadSrcs = data.head.map((l) => l.src);

  for (const m of moments) {
    if (ctx.cancelled) return;
    if (m.kind === 'cssArrived') {
      await ctx.emit({ type: 'resourceArrived', payload: { src: m.src, at: m.t } });
    } else if (m.kind === 'firstPaint') {
      const unfinished = allHeadSrcs.filter((src) => doneAt(src) > m.t);
      await ctx.emit({
        type: 'firstPaint',
        payload: { at: m.t, blockedBy: [...blockingCssSrcs], unfinished },
      });
    } else if (m.kind === 'scriptStarted') {
      await ctx.emit({ type: 'scriptStarted', payload: { src: m.src, at: m.t } });
    } else if (m.kind === 'scriptFinished') {
      const domContentLoaded = deferSrcs.has(m.src) && m.t === dclAt;
      await ctx.emit({
        type: 'scriptFinished',
        payload: { src: m.src, at: m.t, domContentLoaded },
      });
    }
    if (!(await pause())) return;
  }
}
