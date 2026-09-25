/**
 * producer-consumer stage — 넣는 쪽의 손 · 버퍼 칸 · 꺼내는 쪽, 그 아래 empty · full 두 세마포어의 표와 줄,
 * 맨 아래 넣은 틱 · 꺼낸 틱의 자취.
 *
 * 운동:
 *   - 칸 수가 바뀌면 칸 상자가 **생겨나거나 접혀 사라진다** (마운트 때 가장 큰 칸 수 자리를 잡아 둔다)
 *   - 물건이 손 → 칸 → 쓰는 중으로 **옮겨 간다.** 칸 안의 물건은 맨 앞이 빠지면 한 칸씩 당겨진다
 *   - 잠든 쪽의 표식이 그 세마포어의 줄 자리로 **옮겨 가고**, 표가 넘겨질 때 점 하나가 놓는 쪽에서
 *     잠든 쪽으로 **수를 거치지 않고 곧바로** 건너간다
 *   - 새 판이 서면 앞 판의 자취가 옅은 테두리로 남고, 새 자취가 그 위에 내려앉는다 — 넣은 틱은 옮겨 앉고
 *     꺼낸 틱은 같은 자리에 겹친다
 *
 * 셈은 하지 않는다 — 버퍼 · 손 · 표 수 · 잠듦 · 켜질 코드 줄은 projector 가 넘겨준 그대로 그린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 400;
/** 사다리의 가장 큰 칸 수 — 마운트 때 이만큼 자리를 잡는다. 데이터가 더 크면 데이터를 따른다. */
const MIN_SLOT_ROOM = 6;

const ROW_Y = 112;
const P_HOME = { x: 34, y: ROW_Y };
const C_HOME = { x: 726, y: ROW_Y };
const HAND_X0 = 70;
const HAND_PITCH = 26;
const SLOT_FRONT_X = 485;
const SLOT_PITCH = 42;
const SLOT_BOX = 36;
const ITEM = 22;
const IN_USE = { x: 660, y: ROW_Y };
const SEM_Y = 160;
const SEM_H = 68;
const EMPTY_BOX_X = 250;
const FULL_BOX_X = 390;
const SEM_W = 120;
const EMPTY_QUEUE = { x: 274, y: SEM_Y + 38 };
const FULL_QUEUE = { x: 486, y: SEM_Y + 38 };
const CODE_Y0 = 176;
const CODE_DY = 18;
const P_CODE_X = 20;
const C_CODE_X = 560;
const TRACE_X0 = 110;
const TRACE_X1 = 740;
const PUT_ROW_Y = 284;
const TAKE_ROW_Y = 322;
const AXIS_Y = 354;
const LEGEND_Y = 382;

export interface RoundView {
  slots: number;
  ticks: number;
  empty: number;
  full: number;
  producer: string;
  consumer: string;
  emptyName: string;
  fullName: string;
}

export type LineMode = 'run' | 'wait';

export interface TickView {
  tick: number;
  made: number[];
  cAct: 'blocked' | 'asleep' | 'use' | 'take';
  cItem: number;
  cGranted: boolean;
  cHandoff: boolean;
  pAct: 'blocked' | 'asleep' | 'put' | 'idle';
  pItem: number;
  pGranted: boolean;
  pHandoff: boolean;
  cLines: number[];
  pLines: number[];
  midBuffer: number[];
  midEmpty: number;
  midFull: number;
  hand: number[];
  buffer: number[];
  inUse: number;
  empty: number;
  full: number;
  pAsleep: boolean;
  cAsleep: boolean;
  pHolds: boolean;
  cHolds: boolean;
  last: boolean;
  neverFilled: number;
}

export interface ProducerConsumerStage {
  /** 걸음 0 — 칸을 세우고, 표를 채우고, 앞 판의 자취를 옅게 남긴다. */
  beginRound(round: RoundView, ms: number): Promise<void>;
  /** 틱 하나 — 앞 반은 만듦과 꺼내는 쪽, 뒤 반은 넣는 쪽. */
  playTick(tick: TickView, ms: number): Promise<void>;
  setCaption(head: string, work: string, done: string): void;
  /** 되감기 — 앞 판의 자취까지 지운다. */
  clearAll(): void;
}

interface Pose {
  x: number;
  y: number;
  s: number;
  o: number;
}

interface Mark {
  el: SVGGElement;
  tick: number;
  row: 'put' | 'take';
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function textEl(x: number, y: number, s: string, attrs: Record<string, string | number> = {}): SVGTextElement {
  const node = el('text', { x, y, ...attrs });
  node.textContent = s;
  return node;
}

/**
 * initialData 필드 읽기 — **아예 없으면** 빈 값으로 그린다 (전수 검사가 `config: {}` 만 주고 마운트한다).
 * 있는데 모양이 틀리면 던진다 (C6).
 */
function readStrings(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`initialData.${key} 가 글자 배열이 아니다`);
  return v as string[];
}
function readNumbers(data: Record<string, unknown>, key: string): number[] {
  const v = data[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error(`initialData.${key} 가 수 배열이 아니다`);
  return v as number[];
}
function readString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  if (v === undefined) return '';
  if (typeof v !== 'string') throw new Error(`initialData.${key} 가 글자가 아니다`);
  return v;
}

export const producerConsumerStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? ((): boolean => false);
    const svg = params.canvas;
    const data = params.initialData ?? {};
    const producerCode = readStrings(data, 'producerCode');
    const consumerCode = readStrings(data, 'consumerCode');
    const ladder = readNumbers(data, 'slotsLadder');
    const slotRoom = Math.max(MIN_SLOT_ROOM, ...ladder);
    const itemCount = readNumbers(data, 'makeAt').length;
    // 물건이 없으면(initialData 가 없을 때) 색 하나만 받아 둔다 — 그릴 물건도 없다
    const itemColors = categorical(Math.max(1, itemCount), 'pastel');
    const semNames = readStrings(data, 'semaphores');
    const producerId = readString(data, 'producer');
    const consumerId = readString(data, 'consumer');

    let destroyed = false;
    const frames = new Map<Element, number>();
    const targets = new Map<Element, Pose>();
    const poses = new WeakMap<Element, Pose>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    const pendingRemovals = new Set<Element>();

    const fontBody = fonts.body;
    const fontMono = fonts.mono;

    // ── 움직임 도구 (rAF) ─────────────────────────────────────────
    const apply = (node: Element, p: Pose): void => {
      node.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${p.s.toFixed(3)})`);
      node.setAttribute('opacity', p.o.toFixed(3));
      poses.set(node, p);
    };
    const place = (node: Element, to: Partial<Pose>): void => {
      const cur = poses.get(node) ?? { x: 0, y: 0, s: 1, o: 1 };
      const id = frames.get(node);
      if (id !== undefined) cancelAnimationFrame(id);
      frames.delete(node);
      targets.delete(node);
      apply(node, { ...cur, ...to });
    };
    const move = (node: Element, to: Partial<Pose>, ms: number): void => {
      const from = poses.get(node) ?? { x: 0, y: 0, s: 1, o: 1 };
      const target: Pose = { ...from, ...to };
      const prev = frames.get(node);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(node);
      if (destroyed || isInstant() || ms <= 0) {
        targets.delete(node);
        apply(node, target);
        return;
      }
      targets.set(node, target);
      const start = performance.now();
      const step = (now: number): void => {
        const k = Math.min(1, (now - start) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        apply(node, {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          s: from.s + (target.s - from.s) * e,
          o: from.o + (target.o - from.o) * e,
        });
        if (k < 1) frames.set(node, requestAnimationFrame(step));
        else {
          frames.delete(node);
          targets.delete(node);
        }
      };
      frames.set(node, requestAnimationFrame(step));
    };
    const later = (ms: number, fn: () => void): void => {
      if (destroyed || isInstant() || ms <= 0) {
        fn();
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const removeAfter = (node: Element, ms: number): void => {
      pendingRemovals.add(node);
      later(ms, () => {
        pendingRemovals.delete(node);
        node.remove();
      });
    };
    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          resolve();
          return;
        }
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        later(ms, wake);
      });
    const settle = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
      for (const [node, p] of targets) apply(node, p);
      targets.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const node of pendingRemovals) node.remove();
      pendingRemovals.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(settle);

    // ── 뼈대 ─────────────────────────────────────────────────────
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('font-family', fontBody);
    const bgLayer = el('g');
    const traceLayer = el('g');
    const boxLayer = el('g');
    const itemLayer = el('g');
    const flyLayer = el('g');
    svg.append(bgLayer, traceLayer, boxLayer, itemLayer, flyLayer);

    const smallText = (x: number, y: number, s: string, anchor = 'start', color = pal.textMuted): SVGTextElement =>
      textEl(x, y, s, { 'font-size': fontSizes.xs, fill: color, 'text-anchor': anchor });

    // 캡션
    const capHead = textEl(20, 22, '', { 'font-size': fontSizes.md, 'font-weight': 600, fill: pal.text });
    const capWork = textEl(20, 42, '', { 'font-size': fontSizes.sm, fill: pal.text });
    const capDone = textEl(W - 20, 22, '', { 'font-size': fontSizes.md, 'font-weight': 600, fill: pal.text, 'text-anchor': 'end' });
    bgLayer.append(capHead, capWork, capDone);

    // 역할 머리말
    bgLayer.append(
      smallText(20, 72, t('label.producer', 'Producer'), 'start', pal.text),
      smallText(HAND_X0 - 12, 92, t('label.hand', 'In hand')),
      smallText((SLOT_FRONT_X + SLOT_FRONT_X - (slotRoom - 1) * SLOT_PITCH) / 2, 72, t('label.buffer', 'Buffer'), 'middle', pal.text),
      smallText(W - 20, 72, t('label.consumer', 'Consumer'), 'end', pal.text),
      smallText(IN_USE.x, 92, t('label.inUse', 'In use'), 'middle'),
    );
    const pStatus = smallText(P_HOME.x, ROW_Y + 32, '', 'middle');
    const cStatus = smallText(C_HOME.x, ROW_Y + 32, '', 'middle');
    bgLayer.append(pStatus, cStatus);

    // 칸 상자 — 가장 큰 칸 수만큼 미리 만들고, 쓰지 않는 칸은 접어 둔다
    const slotX = (j: number): number => SLOT_FRONT_X - j * SLOT_PITCH;
    const slotBoxes: SVGGElement[] = [];
    const slotRects: SVGRectElement[] = [];
    for (let j = 0; j < slotRoom; j += 1) {
      const g = el('g');
      const r = el('rect', {
        x: -SLOT_BOX / 2,
        y: -SLOT_BOX / 2,
        width: SLOT_BOX,
        height: SLOT_BOX,
        rx: 4,
        fill: pal.bg,
        stroke: pal.textMuted,
        'stroke-width': 1.5,
      });
      g.append(r);
      boxLayer.append(g);
      apply(g, { x: slotX(j), y: ROW_Y, s: 0, o: 0 });
      slotBoxes.push(g);
      slotRects.push(r);
    }

    // 세마포어 두 상자
    interface Sem {
      box: SVGGElement;
      count: SVGTextElement;
      dots: SVGGElement;
      name: SVGTextElement;
      queue: { x: number; y: number };
      dotX0: number;
    }
    const makeSem = (x: number, queueAt: { x: number; y: number }, nameX: number, countX: number, dotX0: number): Sem => {
      const box = el('g');
      box.append(el('rect', { x, y: SEM_Y, width: SEM_W, height: SEM_H, rx: 6, fill: pal.bgSubtle, stroke: pal.border }));
      box.append(el('circle', { cx: queueAt.x, cy: queueAt.y, r: 15, fill: 'none', stroke: pal.textMuted, 'stroke-dasharray': '3 3' }));
      box.append(smallText(queueAt.x, queueAt.y + 4, t('label.queue', 'Queue'), 'middle'));
      const name = textEl(nameX, SEM_Y + 18, '', { 'font-size': fontSizes.sm, 'font-family': fontMono, fill: pal.text });
      const count = textEl(countX, SEM_Y + 20, '', { 'font-size': fontSizes.lg, 'font-weight': 700, fill: pal.text, 'text-anchor': 'end' });
      const dots = el('g');
      box.append(name, count, dots);
      bgLayer.append(box);
      return { box, count, dots, name, queue: queueAt, dotX0 };
    };
    const emptySem = makeSem(EMPTY_BOX_X, EMPTY_QUEUE, EMPTY_BOX_X + 44, EMPTY_BOX_X + SEM_W - 10, EMPTY_BOX_X + 50);
    const fullSem = makeSem(FULL_BOX_X, FULL_QUEUE, FULL_BOX_X + 10, FULL_BOX_X + SEM_W - 44, FULL_BOX_X + 12);
    emptySem.name.textContent = semNames[0] ?? '';
    fullSem.name.textContent = semNames[1] ?? '';
    const dotPos = (sem: Sem, k: number): { x: number; y: number } => ({ x: sem.dotX0 + (k % 6) * 11, y: SEM_Y + 40 + Math.floor(k / 6) * 11 });
    const setSemCount = (sem: Sem, n: number): void => {
      sem.count.textContent = String(n);
      while (sem.dots.firstChild) sem.dots.removeChild(sem.dots.firstChild);
      for (let k = 0; k < n; k += 1) {
        const p = dotPos(sem, k);
        sem.dots.append(el('circle', { cx: p.x, cy: p.y, r: 4, fill: pal.primary }));
      }
    };

    // 코드 줄
    interface CodeLine {
      bg: SVGRectElement;
      text: SVGTextElement;
    }
    const makeCode = (x: number, lines: string[]): CodeLine[] =>
      lines.map((line, i) => {
        const y = CODE_Y0 + i * CODE_DY;
        const bg = el('rect', { x: x - 6, y: y - 13, width: 176, height: CODE_DY - 1, rx: 3, fill: 'none', stroke: 'none' });
        const text = textEl(x, y, line, { 'font-size': fontSizes.sm, 'font-family': fontMono, fill: pal.textMuted });
        bgLayer.append(bg, text);
        return { bg, text };
      });
    const pCode = makeCode(P_CODE_X, producerCode);
    const cCode = makeCode(C_CODE_X, consumerCode);
    const litCode = (lines: CodeLine[], lit: number[], mode: LineMode | null): void => {
      lines.forEach((line, i) => {
        const on = mode !== null && lit.includes(i);
        if (on && mode === 'run') {
          line.bg.setAttribute('fill', pal.accent);
          line.bg.setAttribute('stroke', 'none');
          line.text.setAttribute('fill', pal.stateInk);
        } else if (on && mode === 'wait') {
          line.bg.setAttribute('fill', 'none');
          line.bg.setAttribute('stroke', pal.danger);
          line.bg.setAttribute('stroke-dasharray', '4 3');
          line.text.setAttribute('fill', pal.text);
        } else {
          line.bg.setAttribute('fill', 'none');
          line.bg.setAttribute('stroke', 'none');
          line.text.setAttribute('fill', pal.textMuted);
        }
      });
    };

    // 두 쪽의 표식 — 잠들면 세마포어의 줄 자리로 옮겨 간다. 넘겨받은 표는 곁의 점으로 쥔다
    const makeBadge = (id: string, home: { x: number; y: number }): { g: SVGGElement; held: SVGCircleElement } => {
      const g = el('g');
      g.append(el('circle', { cx: 0, cy: 0, r: 14, fill: pal.bg, stroke: pal.text, 'stroke-width': 2 }));
      g.append(textEl(0, 5, id, { 'font-size': fontSizes.md, 'font-weight': 700, 'font-family': fontMono, fill: pal.text, 'text-anchor': 'middle' }));
      const held = el('circle', { cx: 12, cy: -12, r: 4, fill: pal.primary, opacity: 0 });
      g.append(held);
      itemLayer.append(g);
      apply(g, { x: home.x, y: home.y, s: 1, o: 1 });
      return { g, held };
    };
    const pBadge = makeBadge(producerId, P_HOME);
    const cBadge = makeBadge(consumerId, C_HOME);

    // 자취 — 축 · 두 줄 · 지금 틱 띠
    const cursor = el('rect', { x: 0, y: PUT_ROW_Y - 18, width: 10, height: TAKE_ROW_Y - PUT_ROW_Y + 36, rx: 3, fill: pal.accent, opacity: 0 });
    traceLayer.append(cursor);
    traceLayer.append(
      smallText(20, PUT_ROW_Y + 4, t('label.putRow', 'Put at'), 'start', pal.text),
      smallText(20, TAKE_ROW_Y + 4, t('label.takeRow', 'Took at'), 'start', pal.text),
      el('line', { x1: TRACE_X0, y1: AXIS_Y - 14, x2: TRACE_X1, y2: AXIS_Y - 14, stroke: pal.border }),
    );
    const axis = el('g');
    traceLayer.append(axis);
    const legend = el('g', { opacity: 0 });
    legend.append(
      el('rect', { x: TRACE_X0, y: LEGEND_Y - 10, width: 12, height: 12, rx: 2, fill: 'none', stroke: pal.textMuted, 'stroke-dasharray': '2 2' }),
      smallText(TRACE_X0 + 18, LEGEND_Y, t('label.prevRound', 'Previous round')),
    );
    traceLayer.append(legend);
    const markLayer = el('g');
    traceLayer.append(markLayer);

    let columns = 17;
    const pitch = (): number => (TRACE_X1 - TRACE_X0) / columns;
    const colX = (tick: number): number => TRACE_X0 + pitch() * (tick + 0.5);
    const markSize = (): number => Math.max(6, Math.min(20, pitch() - 4));
    const drawAxis = (): void => {
      while (axis.firstChild) axis.removeChild(axis.firstChild);
      const every = columns > 30 ? 5 : 1;
      for (let k = 0; k < columns; k += 1) {
        if (k % every !== 0) continue;
        axis.append(smallText(colX(k), AXIS_Y, String(k), 'middle'));
      }
      cursor.setAttribute('width', String(pitch() - 2));
    };
    drawAxis();
    let marks: Mark[] = [];
    let ghosts: Mark[] = [];
    const markY = (row: 'put' | 'take'): number => (row === 'put' ? PUT_ROW_Y : TAKE_ROW_Y);
    const makeMark = (row: 'put' | 'take', tick: number, item: number, ms: number): void => {
      const g = el('g');
      const s = markSize();
      g.append(el('rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: 3, fill: itemColors[(item - 1) % itemColors.length] ?? pal.bgSubtle, stroke: pal.text }));
      g.append(textEl(0, 4, String(item), { 'font-size': fontSizes.xs, fill: pal.stateInk, 'text-anchor': 'middle' }));
      markLayer.append(g);
      apply(g, { x: colX(tick), y: markY(row) - 14, s: 1, o: 0 });
      move(g, { y: markY(row), o: 1 }, ms);
      marks.push({ el: g, tick, row });
    };
    const toGhost = (m: Mark): void => {
      for (const child of Array.from(m.el.children)) {
        if (child.tagName.toLowerCase() === 'rect') {
          child.setAttribute('fill', 'none');
          child.setAttribute('stroke', pal.textMuted);
          child.setAttribute('stroke-dasharray', '2 2');
        } else child.setAttribute('fill', pal.textMuted);
      }
    };
    const relayoutMarks = (): void => {
      for (const m of [...ghosts, ...marks]) place(m.el, { x: colX(m.tick), y: markY(m.row) });
    };

    // 물건
    const items = new Map<number, SVGGElement>();
    const handPos = (k: number): { x: number; y: number } => ({ x: HAND_X0 + k * HAND_PITCH, y: ROW_Y });
    const makeItem = (n: number, at: { x: number; y: number }): SVGGElement => {
      const g = el('g');
      g.append(el('rect', { x: -ITEM / 2, y: -ITEM / 2, width: ITEM, height: ITEM, rx: 4, fill: itemColors[(n - 1) % itemColors.length] ?? pal.bgSubtle, stroke: pal.text }));
      g.append(textEl(0, 4, String(n), { 'font-size': fontSizes.sm, 'font-weight': 600, fill: pal.stateInk, 'text-anchor': 'middle' }));
      itemLayer.append(g);
      apply(g, { x: at.x, y: at.y, s: 1, o: 1 });
      items.set(n, g);
      return g;
    };
    const itemEl = (n: number): SVGGElement => {
      const g = items.get(n);
      if (!g) throw new Error(`그리지 않은 물건: ${n}`);
      return g;
    };
    let inUseItem = 0;

    // 날아가는 점 — 표 하나
    const fly = (from: { x: number; y: number }, to: { x: number; y: number }, ms: number): void => {
      if (destroyed || isInstant() || ms <= 0) return;
      const g = el('g');
      g.append(el('circle', { cx: 0, cy: 0, r: 5, fill: pal.primary, stroke: pal.bg, 'stroke-width': 1.5 }));
      flyLayer.append(g);
      apply(g, { x: from.x, y: from.y, s: 1, o: 1 });
      move(g, { x: to.x, y: to.y }, ms);
      removeAfter(g, ms);
    };
    const semCenter = (sem: Sem): { x: number; y: number } => dotPos(sem, 2);

    let slots = 0;
    const setSlots = (n: number, ms: number): void => {
      slots = n;
      slotBoxes.forEach((g, j) => {
        const on = j < n;
        slotRects[j]!.setAttribute('stroke-dasharray', 'none');
        slotRects[j]!.setAttribute('stroke', pal.textMuted);
        move(g, { s: on ? 1 : 0, o: on ? 1 : 0 }, ms);
      });
    };
    const layoutBuffer = (buffer: number[], ms: number): void => {
      buffer.forEach((n, j) => move(itemEl(n), { x: slotX(j), y: ROW_Y, s: 1, o: 1 }, ms));
    };
    const layoutHand = (hand: number[], ms: number): void => {
      hand.forEach((n, k) => move(itemEl(n), { ...handPos(k), s: 1, o: 1 }, ms));
    };
    const setHeld = (badge: { held: SVGCircleElement }, on: boolean): void => {
      badge.held.setAttribute('opacity', on ? '1' : '0');
    };
    const badgePos = (g: SVGGElement): { x: number; y: number } => {
      const p = targets.get(g) ?? poses.get(g);
      return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
    };

    const clearItems = (ms: number): void => {
      for (const g of items.values()) {
        move(g, { o: 0, s: 0.6 }, ms);
        removeAfter(g, ms);
      }
      items.clear();
      inUseItem = 0;
    };

    const stage: ProducerConsumerStage & { destroy(): void } = {
      async beginRound(round: RoundView, ms: number): Promise<void> {
        settle();
        clearItems(ms);
        // 앞 판의 자취는 옅게 남긴다 — 새 판이 그 위에 앉는다
        for (const g of ghosts) g.el.remove();
        ghosts = marks;
        marks = [];
        for (const g of ghosts) toGhost(g);
        legend.setAttribute('opacity', ghosts.length > 0 ? '1' : '0');
        const needCols = Math.max(round.ticks, ...ghosts.map((g) => g.tick + 1));
        if (needCols !== columns) {
          columns = needCols;
          drawAxis();
          relayoutMarks();
        }
        cursor.setAttribute('opacity', '0');
        emptySem.name.textContent = round.emptyName;
        fullSem.name.textContent = round.fullName;
        setSemCount(emptySem, round.empty);
        setSemCount(fullSem, round.full);
        move(pBadge.g, { ...P_HOME }, ms);
        move(cBadge.g, { ...C_HOME }, ms);
        setHeld(pBadge, false);
        setHeld(cBadge, false);
        pStatus.textContent = '';
        cStatus.textContent = '';
        litCode(pCode, [], null);
        litCode(cCode, [], null);
        setSlots(round.slots, ms);
        await wait(ms);
      },

      async playTick(k: TickView, ms: number): Promise<void> {
        settle();
        if (k.buffer.length > slots || k.midBuffer.length > slots) throw new Error('칸보다 많은 물건');
        const half = ms / 2;
        // ── 앞 반: 만듦 · 꺼내는 쪽
        cursor.setAttribute('x', String(colX(k.tick) - pitch() / 2 + 1));
        cursor.setAttribute('opacity', '0.28');
        const handBefore = k.pAct === 'put' ? [k.pItem, ...k.hand] : k.hand;
        for (const n of k.made) {
          const at = handPos(handBefore.indexOf(n));
          const g = makeItem(n, { x: at.x - 16, y: at.y });
          place(g, { o: 0 });
          move(g, { x: at.x, o: 1 }, half);
        }
        litCode(cCode, k.cLines, k.cAct === 'blocked' || k.cAct === 'asleep' ? 'wait' : k.cAct === 'use' || k.cAct === 'take' ? 'run' : null);
        litCode(pCode, [], null);
        if (k.cAct === 'blocked') {
          move(cBadge.g, { ...fullSem.queue }, half);
          cStatus.textContent = t('label.asleep', 'Asleep');
        } else if (k.cAct === 'asleep') {
          cStatus.textContent = t('label.asleep', 'Asleep');
        } else if (k.cAct === 'use') {
          cStatus.textContent = '';
        } else {
          cStatus.textContent = '';
          if (k.cGranted) setHeld(cBadge, false);
          else fly(semCenter(fullSem), C_HOME, half);
          if (inUseItem !== 0) {
            const old = itemEl(inUseItem);
            items.delete(inUseItem);
            move(old, { y: IN_USE.y + 26, o: 0, s: 0.7 }, half);
            removeAfter(old, half);
          }
          inUseItem = k.cItem;
          move(itemEl(k.cItem), { ...IN_USE, s: 1, o: 1 }, half);
          layoutBuffer(k.midBuffer, half);
          makeMark('take', k.tick, k.cItem, half);
          if (k.cHandoff) {
            // 표가 수를 거치지 않고 잠든 넣는 쪽에게 곧바로 건너간다
            fly(C_HOME, badgePos(pBadge.g), half);
            move(pBadge.g, { ...P_HOME }, half);
            later(half, () => setHeld(pBadge, true));
            pStatus.textContent = '';
          } else {
            fly(C_HOME, dotPos(emptySem, k.midEmpty - 1), half);
          }
        }
        setSemCount(emptySem, k.midEmpty);
        setSemCount(fullSem, k.midFull);
        await wait(half);

        // ── 뒤 반: 넣는 쪽
        litCode(pCode, k.pLines, k.pAct === 'blocked' || k.pAct === 'asleep' ? 'wait' : k.pAct === 'put' ? 'run' : null);
        if (k.pAct === 'blocked') {
          move(pBadge.g, { ...emptySem.queue }, half);
          pStatus.textContent = t('label.asleep', 'Asleep');
        } else if (k.pAct === 'asleep') {
          pStatus.textContent = t('label.asleep', 'Asleep');
        } else if (k.pAct === 'idle') {
          pStatus.textContent = t('label.idle', 'Idle');
        } else {
          pStatus.textContent = '';
          if (k.pGranted) setHeld(pBadge, false);
          else fly(semCenter(emptySem), P_HOME, half);
          layoutBuffer(k.buffer, half);
          makeMark('put', k.tick, k.pItem, half);
          if (k.pHandoff) {
            fly(P_HOME, badgePos(cBadge.g), half);
            move(cBadge.g, { ...C_HOME }, half);
            later(half, () => setHeld(cBadge, true));
            cStatus.textContent = '';
          } else {
            fly(P_HOME, dotPos(fullSem, k.full - 1), half);
          }
        }
        layoutHand(k.hand, half);
        setSemCount(emptySem, k.empty);
        setSemCount(fullSem, k.full);
        if (k.last) {
          // 한 번도 차지 않은 칸 — 가장 찬 수 뒤의 칸들
          for (let j = slots - k.neverFilled; j < slots; j += 1) {
            slotRects[j]?.setAttribute('stroke-dasharray', '4 3');
            slotRects[j]?.setAttribute('stroke', pal.border);
          }
        }
        await wait(half);
        setHeld(pBadge, k.pHolds);
        setHeld(cBadge, k.cHolds);
      },

      setCaption(head: string, work: string, done: string): void {
        capHead.textContent = head;
        capWork.textContent = work;
        capDone.textContent = done;
      },

      clearAll(): void {
        settle();
        clearItems(0);
        for (const m of [...ghosts, ...marks]) m.el.remove();
        ghosts = [];
        marks = [];
        legend.setAttribute('opacity', '0');
        cursor.setAttribute('opacity', '0');
        capHead.textContent = '';
        capWork.textContent = '';
        capDone.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        settle();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return stage as unknown as ViewInstance;
  },
};
