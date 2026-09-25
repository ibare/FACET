/**
 * priority-aging-stage — 세로 순위 눈금 위의 프로세스 표.
 *
 * 주인공은 눈금 위의 오름이다. 표마다 제 실효 순위 높이에 선다 — 아래가 낮은 순위, 수가 클수록 위.
 * 기다리는 표가 한 칸씩 **타고 오르다** 높은 것들과 나란해지는 걸음에 CPU 자리로 **옮겨 앉는다.**
 * 오른쪽에는 대기 막대(보고서 하나 · J 들) — 보고서가 끼어든 만큼 뒤의 J 막대가 자란다. 앞 판의 막대는
 * 점선 윤곽으로 남는다. 아래의 작은 CPU 띠에는 앞 판에서 보고서가 CPU 에 오른 틱이 흐린 눈금으로 남고,
 * 이번 판의 표식이 그 자리에서 새 자리로 미끄러진다.
 *
 * 그림은 이 파일이 다 한다. 이벤트는 해석하지 않는다 — projector 가 부르는 메서드만 연다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StageProcState = 'pending' | 'queued' | 'running' | 'done';

export type StageProc = { id: string; state: StageProcState; eff: number; seq: number; wait: number; doneAt: number };

export type StageSetup = { procs: { id: string; arrive: number; prio: number }[]; levels: number; horizon: number };

export type StageStep = {
  tick: number;
  until: number;
  finished: string | null;
  arrived: string[];
  aged: { id: string; from: number; to: number }[];
  dispatched: string | null;
  tie: string[];
  level: number | null;
  procs: StageProc[];
  run: string | null;
};

export type StageSummary = { reportStart: number; reportWait: number; highWait: number };

/** projector 가 부르는 표면 — 이 타입 하나로 좁힌다. */
export type PriorityAgingStage = ViewInstance & {
  setup(info: StageSetup): void;
  beginRound(interval: number, procs: StageProc[], durMs: number): void;
  applyStep(step: StageStep, durMs: number): void;
  endRound(summary: StageSummary): void;
  clear(): void;
};

const W = 800;
const H = 430;

// 눈금
const RULER_X = 40;
const QUEUE_X1 = 400;
const RULER_TOP = 90;
const RULER_BOTTOM = 262;
const PEND_Y = 296;
// CPU 자리와 끝난 표
const CPU_X = 424;
const CPU_Y = 82;
const CPU_W = 130;
const CPU_H = 34;
const DONE_Y = 150;
// 대기 막대
const BAR_LABEL_X = 660;
const BAR_X = 666;
const BAR_MAX_W = 100;
const BAR_Y = 90;
const BAR_PITCH = 22;
const BAR_H = 14;
// CPU 띠
const STRIP_X0 = 40;
const STRIP_X1 = 770;
const STRIP_Y = 370;
const STRIP_H = 16;

const TOKEN_H = 20;
const TOKEN_GAP = 4;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

/** 글자 폭 어림 — 한글 · 한자권 글자는 한 칸, 나머지는 0.6 칸. */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? px : px * 0.6;
  return w;
}

type Token = {
  id: string;
  low: boolean;
  width: number;
  g: SVGGElement;
  rect: SVGRectElement;
  sub: SVGTextElement;
  x: number;
  y: number;
};

type Bar = { rect: SVGRectElement; ghost: SVGRectElement; value: SVGTextElement; width: number };

export const priorityAgingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): PriorityAgingStage {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const px = parseFloat(fontSizes.sm);
    const pxSmall = parseFloat(fontSizes.xs);

    const root = el('g', {}, svg);
    const frame = el('g', {}, root);
    const rulerLayer = el('g', {}, root);
    const stripLayer = el('g', {}, root);
    const barLayer = el('g', {}, root);
    const tokenLayer = el('g', {}, root);

    const caption1 = el('text', { x: 20, y: 24, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, frame);
    const caption2 = el('text', { x: 20, y: 46, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, frame);

    const label = (x: number, y: number, text: string, anchor: 'start' | 'end' | 'middle', parent: Element, color = c.textMuted) => {
      const node = el('text', { x, y, 'text-anchor': anchor, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: color }, parent);
      node.textContent = text;
      return node;
    };

    // 늘 서 있는 틀 — 제목과 CPU 자리
    label(RULER_X, RULER_TOP - 16, t('label.priority', 'Priority (higher is up)'), 'start', frame);
    label(RULER_X, PEND_Y - 8, t('label.pending', 'Not arrived yet'), 'start', frame);
    label(CPU_X, CPU_Y - 8, t('label.cpu', 'CPU'), 'start', frame);
    el('rect', { x: CPU_X, y: CPU_Y, width: CPU_W, height: CPU_H, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1.5 }, frame);
    label(CPU_X, DONE_Y - 8, t('label.done', 'Finished'), 'start', frame);
    label(BAR_LABEL_X - 50, RULER_TOP - 16, t('label.waitBars', 'Wait (ticks)'), 'start', frame);
    label(STRIP_X0 - 6, STRIP_Y + 12, t('label.cpu', 'CPU'), 'end', frame);
    const jTotal = label(BAR_X, 0, '', 'start', frame, c.text);
    const prevLabel = label(0, STRIP_Y - 16, '', 'middle', stripLayer);
    const ghostMark = el('line', { x1: 0, x2: 0, y1: STRIP_Y - 10, y2: STRIP_Y + STRIP_H + 6, stroke: c.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '3 3', visibility: 'hidden' }, stripLayer);
    const segLayer = el('g', {}, stripLayer);
    const curMark = el('line', { x1: 0, x2: 0, y1: STRIP_Y - 10, y2: STRIP_Y + STRIP_H + 6, stroke: c.text, 'stroke-width': 2, visibility: 'hidden' }, stripLayer);

    let levels = 0;
    let horizon = 0;
    let lowId = '';
    const tokens = new Map<string, Token>();
    const bars = new Map<string, Bar>();
    const order: string[] = [];
    let lastWaits = new Map<string, number>();
    let reportStart = -1;
    let prevStart = -1;
    let lastSeg: { id: string; x0: number; until: number; rect: SVGRectElement; txt: SVGTextElement } | null = null;

    // ── 움직임: 키마다 하나의 rAF 트윈. 길이는 projector 가 재생 속도에서 셈해 준다.
    const frames = new Map<string, number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const tween = (key: string, from: number[], to: number[], dur: number, apply: (vals: number[]) => void): void => {
      const prev = frames.get(key);
      if (prev !== undefined && hasRaf) cancelAnimationFrame(prev);
      frames.delete(key);
      if (dur <= 0 || !hasRaf) {
        apply(to);
        return;
      }
      const t0 = performance.now();
      const step = (now: number): void => {
        const p = Math.min(1, (now - t0) / dur);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        apply(from.map((f, i) => f + (to[i]! - f) * e));
        if (p < 1) frames.set(key, requestAnimationFrame(step));
        else frames.delete(key);
      };
      frames.set(key, requestAnimationFrame(step));
    };

    const rowY = (lvl: number): number => {
      if (levels <= 1) return RULER_BOTTOM;
      return RULER_BOTTOM - ((lvl - 1) * (RULER_BOTTOM - RULER_TOP)) / (levels - 1);
    };
    const tickX = (tick: number): number => STRIP_X0 + ((STRIP_X1 - STRIP_X0) * tick) / horizon;
    const barW = (wait: number): number => (BAR_MAX_W * wait) / horizon;
    const nameOf = (id: string): string => (id === lowId ? t('label.report', 'Month-end report') : id.toUpperCase());

    const placeToken = (tok: Token, x: number, y: number, dur: number): void => {
      const fx = tok.x;
      const fy = tok.y;
      tok.x = x;
      tok.y = y;
      tween(`tok:${tok.id}`, [fx, fy], [x, y], dur, ([ax, ay]) => {
        tok.g.setAttribute('transform', `translate(${ax!.toFixed(1)},${ay!.toFixed(1)})`);
      });
    };

    const pendingX = (id: string): number => {
      let x = RULER_X;
      for (const other of order) {
        if (other === id) return x;
        x += tokens.get(other)!.width + TOKEN_GAP + 6;
      }
      throw new Error(`priority-aging-stage: 모르는 식별자 ${id}`);
    };

    /** 표 모두를 상태에 맞는 자리로 옮긴다. */
    const layout = (procs: StageProc[], dur: number, tie: Set<string>): void => {
      const rows = new Map<number, StageProc[]>();
      const done: StageProc[] = [];
      for (const p of procs) {
        if (p.state === 'queued') {
          const row = rows.get(p.eff) ?? [];
          row.push(p);
          rows.set(p.eff, row);
        } else if (p.state === 'done') done.push(p);
      }
      const slot = new Map<string, number>();
      for (const row of rows.values()) {
        row.sort((a, b) => a.seq - b.seq);
        let x = RULER_X + 24;
        for (const p of row) {
          slot.set(p.id, x);
          x += tokens.get(p.id)!.width + TOKEN_GAP;
        }
      }
      done.sort((a, b) => a.doneAt - b.doneAt || order.indexOf(a.id) - order.indexOf(b.id));
      for (const p of procs) {
        const tok = tokens.get(p.id);
        if (!tok) throw new Error(`priority-aging-stage: 모르는 식별자 ${p.id}`);
        let x: number;
        let y: number;
        tok.g.setAttribute('opacity', p.state === 'pending' ? '0.45' : p.state === 'done' ? '0.6' : '1');
        tok.rect.setAttribute('stroke', tie.has(p.id) ? c.itemComparing : p.state === 'running' ? c.text : 'none');
        tok.rect.setAttribute('stroke-width', tie.has(p.id) || p.state === 'running' ? '2' : '0');
        if (p.state === 'pending') {
          x = pendingX(p.id);
          y = PEND_Y;
          tok.sub.setAttribute('x', String(tok.width / 2));
          tok.sub.setAttribute('y', String(TOKEN_H + 12));
          tok.sub.setAttribute('text-anchor', 'middle');
          const meta = arriveOf.get(p.id);
          tok.sub.textContent = meta === undefined ? '' : t('label.arriveTick', 'tick {n}', { n: meta });
        } else if (p.state === 'queued') {
          x = slot.get(p.id)!;
          y = rowY(p.eff) - TOKEN_H / 2;
          tok.sub.textContent = '';
        } else if (p.state === 'running') {
          x = CPU_X + (CPU_W - tok.width) / 2;
          y = CPU_Y + (CPU_H - TOKEN_H) / 2;
          tok.sub.textContent = '';
        } else {
          const rank = done.findIndex((d) => d.id === p.id);
          x = CPU_X;
          y = DONE_Y + rank * (TOKEN_H + 3);
          tok.sub.setAttribute('x', String(tok.width + 6));
          tok.sub.setAttribute('y', String(TOKEN_H / 2 + 4));
          tok.sub.setAttribute('text-anchor', 'start');
          tok.sub.textContent = t('label.doneTick', 'at tick {n}', { n: p.doneAt });
        }
        placeToken(tok, x, y, dur);
      }
    };

    const setBars = (procs: StageProc[], dur: number): void => {
      let sum = 0;
      for (const p of procs) {
        const bar = bars.get(p.id);
        if (!bar) throw new Error(`priority-aging-stage: 모르는 식별자 ${p.id}`);
        const from = bar.width;
        const to = barW(p.wait);
        bar.width = to;
        bar.value.textContent = String(p.wait);
        tween(`bar:${p.id}`, [from], [to], dur, ([w]) => {
          bar.rect.setAttribute('width', w!.toFixed(1));
          bar.value.setAttribute('x', (BAR_X + w! + 4).toFixed(1));
        });
        if (p.id !== lowId) sum += p.wait;
        lastWaits.set(p.id, p.wait);
      }
      jTotal.textContent = t('label.jTotal', 'J total: {n}', { n: sum });
    };

    const arriveOf = new Map<string, number>();

    const setup = (info: StageSetup): void => {
      if (info.procs.length === 0) throw new Error('priority-aging-stage: 프로세스가 없다');
      if (!(info.levels >= 1) || !(info.horizon >= 1)) throw new Error('priority-aging-stage: 눈금이나 지평이 비었다');
      levels = info.levels;
      horizon = info.horizon;
      lowId = info.procs[0]!.id;
      rulerLayer.textContent = '';
      tokenLayer.textContent = '';
      barLayer.textContent = '';
      segLayer.textContent = '';
      lastSeg = null;
      tokens.clear();
      bars.clear();
      order.length = 0;
      arriveOf.clear();
      // 눈금
      for (let lvl = 1; lvl <= levels; lvl += 1) {
        const y = rowY(lvl);
        el('line', { x1: RULER_X + 18, x2: QUEUE_X1, y1: y, y2: y, stroke: c.border, 'stroke-width': 1 }, rulerLayer);
        const num = el('text', { x: RULER_X + 10, y: y + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, rulerLayer);
        num.textContent = String(lvl);
      }
      // 틱 눈금
      for (let tk = 0; tk <= horizon; tk += 2) {
        const x = tickX(tk);
        el('line', { x1: x, x2: x, y1: STRIP_Y + STRIP_H, y2: STRIP_Y + STRIP_H + 4, stroke: c.border }, rulerLayer);
        const num = el('text', { x, y: STRIP_Y + STRIP_H + 16, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, rulerLayer);
        num.textContent = String(tk);
      }
      el('rect', { x: STRIP_X0, y: STRIP_Y, width: STRIP_X1 - STRIP_X0, height: STRIP_H, fill: c.bgSubtle, stroke: c.border }, rulerLayer);
      // 표와 막대
      info.procs.forEach((p, i) => {
        order.push(p.id);
        arriveOf.set(p.id, p.arrive);
        const low = i === 0;
        const name = nameOf(p.id);
        const width = Math.max(30, textWidth(name, px) + 14);
        const g = el('g', { transform: `translate(${RULER_X},${PEND_Y})` }, tokenLayer);
        const rect = el('rect', { x: 0, y: 0, width, height: TOKEN_H, rx: 5, fill: low ? c.accent : c.primary }, g);
        const text = el('text', { x: width / 2, y: TOKEN_H / 2 + 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: low ? c.stateInk : c.textInverse }, g);
        text.textContent = name;
        const sub = el('text', { x: width / 2, y: TOKEN_H + 12, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, g);
        const tok: Token = { id: p.id, low, width, g, rect, sub, x: RULER_X, y: PEND_Y };
        tokens.set(p.id, tok);

        const y = BAR_Y + i * BAR_PITCH + (low ? 0 : 8);
        const lab = el('text', { x: BAR_LABEL_X, y: y + BAR_H - 3, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text }, barLayer);
        lab.textContent = name;
        const ghost = el('rect', { x: BAR_X, y, width: 0, height: BAR_H, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 2', visibility: 'hidden' }, barLayer);
        const rectBar = el('rect', { x: BAR_X, y, width: 0, height: BAR_H, fill: low ? c.accent : c.primary }, barLayer);
        const value = el('text', { x: BAR_X + 4, y: y + BAR_H - 3, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text }, barLayer);
        value.textContent = '0';
        bars.set(p.id, { rect: rectBar, ghost, value, width: 0 });
      });
      jTotal.setAttribute('y', String(BAR_Y + info.procs.length * BAR_PITCH + 18));
      jTotal.textContent = t('label.jTotal', 'J total: {n}', { n: 0 });
    };

    const beginRound = (interval: number, procs: StageProc[], durMs: number): void => {
      if (levels === 0) throw new Error('priority-aging-stage: setup 전에 판이 시작됐다');
      // 앞 판의 결과를 흐린 표식으로 남긴다
      if (reportStart >= 0) {
        prevStart = reportStart;
        const gx = tickX(prevStart);
        ghostMark.setAttribute('x1', String(gx));
        ghostMark.setAttribute('x2', String(gx));
        ghostMark.setAttribute('visibility', 'visible');
        prevLabel.setAttribute('x', String(gx));
        prevLabel.textContent = t('label.prevStart', 'Last run: tick {n}', { n: prevStart });
        for (const [id, w] of lastWaits) {
          const bar = bars.get(id);
          if (!bar) continue;
          bar.ghost.setAttribute('width', barW(w).toFixed(1));
          bar.ghost.setAttribute('visibility', w > 0 ? 'visible' : 'hidden');
        }
      }
      reportStart = -1;
      curMark.setAttribute('visibility', 'hidden');
      segLayer.textContent = '';
      lastSeg = null;
      caption1.textContent =
        interval > 0 ? t('caption.round', 'Aging interval: {n} ticks', { n: interval }) : t('caption.roundNone', 'Aging interval: none');
      caption2.textContent = '';
      layout(procs, durMs, new Set());
      setBars(procs, durMs);
    };

    const applyStep = (step: StageStep, durMs: number): void => {
      if (levels === 0) throw new Error('priority-aging-stage: setup 전에 걸음이 왔다');
      const parts: string[] = [t('caption.tick', 'Tick {n}', { n: step.tick })];
      if (step.finished) parts.push(t('caption.finish', 'Done: {name}', { name: nameOf(step.finished) }));
      if (step.arrived.length > 0) parts.push(t('caption.arrive', 'Arrived: {names}', { names: step.arrived.map(nameOf).join(', ') }));
      for (const a of step.aged) parts.push(t('caption.age', '{name} priority: {from} → {to}', { name: nameOf(a.id), from: a.from, to: a.to }));
      caption1.textContent = parts.join(' · ');
      if (step.dispatched !== null) {
        if (step.level === null) throw new Error('priority-aging-stage: 고른 것의 순위가 없다');
        let line = t('caption.dispatch', 'To CPU: {name} (priority {level})', { name: nameOf(step.dispatched), level: step.level });
        if (step.tie.length > 0) {
          line += ' · ' + t('caption.tie', 'Tied at {level} with {names}: first in line wins', { level: step.level, names: step.tie.map(nameOf).join(', ') });
        }
        caption2.textContent = line;
      } else if (step.run !== null) {
        caption2.textContent = t('caption.running', 'Still on CPU: {name}', { name: nameOf(step.run) });
      } else {
        caption2.textContent = '';
      }
      const tie = new Set(step.tie);
      if (step.dispatched !== null && step.tie.length > 0) tie.add(step.dispatched);
      layout(step.procs, durMs, tie);
      setBars(step.procs, durMs);
      // CPU 띠 — 이 걸음이 품는 토막이 자란다
      // 같은 것이 이어 돌면 앞 토막을 늘린다 — 토막 하나가 한 번의 오름이다
      if (step.run !== null && step.until > step.tick) {
        const name = nameOf(step.run);
        if (lastSeg && lastSeg.id === step.run && lastSeg.until === step.tick) {
          const seg = lastSeg;
          const from = tickX(seg.until) - seg.x0;
          const full = tickX(step.until) - seg.x0;
          seg.until = step.until;
          seg.txt.setAttribute('x', String(seg.x0 + full / 2));
          seg.txt.textContent = textWidth(name, pxSmall) + 4 <= full ? name : '';
          tween(`seg:${seg.x0}`, [from], [full], durMs, ([w]) => seg.rect.setAttribute('width', w!.toFixed(1)));
        } else {
          const x0 = tickX(step.tick);
          const full = tickX(step.until) - x0;
          const low = step.run === lowId;
          const rect = el('rect', { x: x0, y: STRIP_Y, width: 0, height: STRIP_H, fill: low ? c.accent : c.primary, stroke: c.bg, 'stroke-width': 1 }, segLayer);
          const txt = el('text', { x: x0 + full / 2, y: STRIP_Y + STRIP_H - 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: low ? c.stateInk : c.textInverse }, segLayer);
          txt.textContent = textWidth(name, pxSmall) + 4 <= full ? name : '';
          lastSeg = { id: step.run, x0, until: step.until, rect, txt };
          tween(`seg:${x0}`, [0], [full], durMs, ([w]) => rect.setAttribute('width', w!.toFixed(1)));
        }
      }
      // 보고서가 CPU 에 오른 틱 — 앞 판의 자리에서 미끄러져 온다
      if (step.dispatched === lowId && reportStart < 0) {
        reportStart = step.tick;
        const to = tickX(step.tick);
        const from = prevStart >= 0 ? tickX(prevStart) : to;
        curMark.setAttribute('visibility', 'visible');
        tween('mark', [from], [to], durMs, ([x]) => {
          curMark.setAttribute('x1', x!.toFixed(1));
          curMark.setAttribute('x2', x!.toFixed(1));
        });
      }
    };

    const endRound = (summary: StageSummary): void => {
      caption2.textContent = t('caption.end', 'Report start: tick {start} · Report wait: {wait} · J wait total: {high}', {
        start: summary.reportStart,
        wait: summary.reportWait,
        high: summary.highWait,
      });
    };

    const clear = (): void => {
      for (const id of frames.values()) if (hasRaf) cancelAnimationFrame(id);
      frames.clear();
      reportStart = -1;
      prevStart = -1;
      lastWaits = new Map();
      ghostMark.setAttribute('visibility', 'hidden');
      curMark.setAttribute('visibility', 'hidden');
      prevLabel.textContent = '';
      segLayer.textContent = '';
      lastSeg = null;
      lastSeg = null;
      caption1.textContent = '';
      caption2.textContent = '';
      for (const bar of bars.values()) {
        bar.ghost.setAttribute('visibility', 'hidden');
      }
    };

    return {
      setup,
      beginRound,
      applyStep,
      endRound,
      clear,
      destroy(): void {
        for (const id of frames.values()) if (hasRaf) cancelAnimationFrame(id);
        frames.clear();
        root.remove();
      },
    };
  },
};
