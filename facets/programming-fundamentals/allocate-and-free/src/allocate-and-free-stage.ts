/**
 * allocate-and-free 무대 — 스택(틀을 아래에서 위로) · 프로그램 · 힙 칸 줄 · 새 땅 끝 · 빈 자리 목록.
 *
 * 무대는 한 걸음의 모습(장면 조각)을 받아 **앞 모습에서 옮겨 간다**. 요소는 이름 · 주소 · 줄 key 로
 * 이어지므로 같은 것이 판을 건너도 같은 요소다 — `free(p)` 줄이 몸 안에서 미끄러지고, make 틀이
 * 얹혔다 걷히고, 덩이가 떨어져 남고, 목록 칩이 힙 덩이와 목록 사이를 오가고, 화살이 box 에서 p 로
 * 옮겨 붙는다. 움직임은 rAF 트윈 하나로 돌린다 (길이는 projector 가 재생 속도에서 셈해 건넨다).
 *
 * 세로는 사다리 끝값의 자리를 처음부터 잡는다 — 힙 칸 18 · 목록 5 · 프로그램 11 줄 · 틀 둘.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

// ─────────────────────────────────────────────────────────────────────────────
// 무대가 받는 모양 — projector 가 payload 를 좁혀 건넨다
// ─────────────────────────────────────────────────────────────────────────────

export type StageSlot = { name: string; at: number; kind: 'empty' | 'null' | 'int' | 'ptr'; value: number };
export type StageBlock = { addr: number; size: number; status: 'held' | 'lost' | 'free' };
export type StageSnapshot = {
  outer: StageSlot[];
  make: StageSlot[];
  blocks: StageBlock[];
  cells: { addr: number; value: number }[];
  freeList: number[];
  landEnd: number;
  line: string;
  callLine: string;
};
export type StageLine = { key: string; text: string; depth: number };

export type AllocateAndFreeStage = {
  /** 프로그램 줄을 놓는다 — 이어지는 key 는 제자리로 미끄러지고, 없어진 줄은 몸 밖으로 빠진다 */
  setProgram(lines: StageLine[], callee: string, ms: number): void;
  /** 한 걸음의 모습으로 옮겨 간다 */
  show(snap: StageSnapshot, ms: number): void;
  setCaption(text: string): void;
  clear(): void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 자리 — 사다리 끝값에서 (힙 칸 18 · 목록 5 · 프로그램 11 줄 · 틀 둘)
// ─────────────────────────────────────────────────────────────────────────────

const W = 880;
const H = 508;
const HEAP_CELLS = 18;
const LIST_MAX = 5;

const STACK_X = 16;
const STACK_W = 412;
const OUTER_Y = 164;
const MAKE_Y = 86;
const FRAME_H = 70;
const SLOT_W = 92;
const SLOT_H = 40;
const SLOT_GAP = 100;
const SLOT_TOP = 22;
const MAKE_RISE = 44;

const PROG_X = 466;
const PROG_W = 400;
const LINE_Y0 = 50;
const LINE_H = 17;
const INDENT = 22;

const HEAP_Y = 292;
const CELL_H = 40;
const CELL_W = 46;
const HEAP_X0 = 36;
const LAND_LABEL_Y = 378;

const LIST_Y = 414;
const CHIP_W = 64;
const CHIP_H = 28;
const CHIP_GAP = 72;

const CAPTION_Y = 494;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function slotText(s: StageSlot): string {
  if (s.kind === 'empty') return '';
  if (s.kind === 'null') return 'null';
  if (s.kind === 'ptr') return `@${s.value}`;
  return String(s.value);
}

// ─────────────────────────────────────────────────────────────────────────────
// 트윈 — 키마다 지금 값을 들고 새 목표로 옮겨 간다
// ─────────────────────────────────────────────────────────────────────────────

type Tween = { from: number[]; to: number[]; t0: number; dur: number; apply: (v: number[]) => void; done?: () => void };

function makeTweener(isInstant: () => boolean) {
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const values = new Map<string, number[]>();
  const tweens = new Map<string, Tween>();
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dead = false;

  const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

  const tick = (): void => {
    frame = null;
    timer = null;
    if (dead) return;
    const tnow = now();
    for (const [key, tw] of [...tweens]) {
      const p = Math.min(1, Math.max(0, (tnow - tw.t0) / tw.dur));
      const e = ease(p);
      const cur = tw.to.map((to, k) => (tw.from[k] ?? to) + (to - (tw.from[k] ?? to)) * e);
      values.set(key, cur);
      tw.apply(cur);
      if (p >= 1) {
        tweens.delete(key);
        tw.done?.();
      }
    }
    if (tweens.size > 0) schedule();
  };

  const schedule = (): void => {
    if (frame !== null || timer !== null || dead) return;
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
    else timer = setTimeout(tick, 16);
  };

  const finish = (key: string, tw: Tween): void => {
    tweens.delete(key);
    values.set(key, tw.to);
    tw.apply(tw.to);
    tw.done?.();
  };

  return {
    /** 지금 값 (없으면 undefined) */
    get(key: string): number[] | undefined {
      return values.get(key);
    },
    to(key: string, target: number[], apply: (v: number[]) => void, ms: number, from?: number[], done?: () => void): void {
      const start = from ?? values.get(key) ?? target;
      const prev = tweens.get(key);
      if (prev) tweens.delete(key);
      const same = start.length === target.length && start.every((x, k) => Math.abs(x - (target[k] ?? x)) < 0.01);
      if (ms <= 0 || isInstant() || same) {
        values.set(key, target);
        apply(target);
        done?.();
        return;
      }
      tweens.set(key, { from: start, to: target, t0: now(), dur: ms, apply, done });
      apply(start);
      values.set(key, start);
      schedule();
    },
    drop(key: string): void {
      tweens.delete(key);
      values.delete(key);
    },
    /** 걸려 있는 것을 모두 목표로 건너뛴다 */
    flush(): void {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      frame = null;
      timer = null;
      for (const [key, tw] of [...tweens]) finish(key, tw);
    },
    destroy(): void {
      dead = true;
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      tweens.clear();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 무대
// ─────────────────────────────────────────────────────────────────────────────

let stageSerial = 0;

export const allocateAndFreeStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const tw = makeTweener(params.isInstant ?? (() => false));
    params.onScrubStart?.(() => tw.flush());
    const smPx = parseFloat(fontSizes.sm);
    const uid = `aaf${(stageSerial += 1)}`;

    const root = el('g', {}, svg);
    const text = (
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; mono?: boolean; anchor?: string; weight?: string },
      parent: Element = root,
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = s;
      return node;
    };

    // 화살 머리
    const defs = el('defs', {}, root);
    const head = el(
      'marker',
      { id: `${uid}-head`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' },
      defs,
    );
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: c.primary }, head);

    // ── 머리글
    text(STACK_X, 20, t('label.stack', 'Stack'), { size: fontSizes.md, weight: '600' });
    text(PROG_X, 20, t('label.program', 'Program'), { size: fontSizes.md, weight: '600' });
    text(STACK_X, HEAP_Y - 30, t('label.heap', 'Heap'), { size: fontSizes.md, weight: '600' });
    text(STACK_X, LIST_Y - 10, t('label.freeList', 'Free list'), { size: fontSizes.md, weight: '600' });

    // ── 프로그램
    el('rect', { x: PROG_X - 6, y: 30, width: PROG_W, height: LINE_H * 11 + 12, rx: 6, fill: c.bgSubtle, stroke: c.border }, root);
    const marker2 = el('rect', { x: PROG_X - 2, y: LINE_Y0 - 12, width: PROG_W - 8, height: LINE_H - 1, rx: 3, fill: 'none', stroke: c.accent, 'stroke-dasharray': '3 2', opacity: 0 }, root);
    const marker = el('rect', { x: PROG_X - 2, y: LINE_Y0 - 12, width: PROG_W - 8, height: LINE_H - 1, rx: 3, fill: c.accent, 'fill-opacity': 0.35, opacity: 0 }, root);
    const progLayer = el('g', {}, root);
    const lineEls = new Map<string, SVGTextElement>();
    let lineOrder: string[] = [];

    // ── 스택: 바깥 틀(아래) · make 틀(위, 얹혔다 걷힌다)
    const outerFrame = el('g', {}, root);
    el('rect', { x: STACK_X, y: OUTER_Y, width: STACK_W, height: FRAME_H, rx: 6, fill: c.bgSubtle, stroke: c.border }, outerFrame);
    text(STACK_X + 8, OUTER_Y + 14, t('label.outerFrame', 'Outer frame'), { size: fontSizes.xs, fill: c.textMuted }, outerFrame);
    const makeFrame = el('g', { opacity: 0 }, root);
    el('rect', { x: STACK_X, y: MAKE_Y, width: STACK_W, height: FRAME_H, rx: 6, fill: c.bgSubtle, stroke: c.primary }, makeFrame);
    const makeLabel = text(STACK_X + 8, MAKE_Y + 14, '', { size: fontSizes.xs, fill: c.textMuted, mono: true }, makeFrame);

    type SlotEls = { box: SVGRectElement; name: SVGTextElement; at: SVGTextElement; value: SVGTextElement };
    const makeSlot = (parent: Element, frameY: number, k: number): SlotEls => {
      const x = STACK_X + 10 + k * SLOT_GAP;
      const y = frameY + SLOT_TOP;
      const box = el('rect', { x, y, width: SLOT_W, height: SLOT_H, rx: 4, fill: c.bg, stroke: c.border }, parent);
      const name = text(x + 6, y + 13, '', { mono: true, weight: '600' }, parent);
      const at = text(x + SLOT_W - 5, y + 12, '', { size: fontSizes.xs, fill: c.textMuted, mono: true, anchor: 'end' }, parent);
      const value = text(x + SLOT_W / 2, y + 32, '', { size: fontSizes.md, mono: true, anchor: 'middle' }, parent);
      return { box, name, at, value };
    };
    const outerSlots: SlotEls[] = [0, 1, 2, 3].map((k) => makeSlot(outerFrame, OUTER_Y, k));
    const makeSlots: SlotEls[] = [0, 1].map((k) => makeSlot(makeFrame, MAKE_Y, k));
    const slotAnchor = (frameY: number, k: number, rise = 0): [number, number] => [
      STACK_X + 10 + k * SLOT_GAP + SLOT_W / 2,
      frameY + SLOT_TOP + SLOT_H - rise,
    ];

    // ── 힙: 새 땅(점선 칸 18) · 덩이 · 칸 값 · 새 땅 끝
    const cellX = (addr: number, base: number): number => HEAP_X0 + (addr - base) * CELL_W;
    const landLayer = el('g', {}, root);
    const blockLayer = el('g', {}, root);
    const valueLayer = el('g', {}, root);
    let heapBase: number | null = null;
    const drawLand = (base: number): void => {
      if (heapBase === base) return;
      heapBase = base;
      while (landLayer.firstChild) landLayer.removeChild(landLayer.firstChild);
      for (let k = 0; k < HEAP_CELLS; k += 1) {
        const x = HEAP_X0 + k * CELL_W;
        el('rect', { x: x + 1, y: HEAP_Y, width: CELL_W - 2, height: CELL_H, rx: 2, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 3' }, landLayer);
        text(x + CELL_W / 2, HEAP_Y + CELL_H + 13, `@${base + k}`, { size: fontSizes.xs, fill: c.textMuted, mono: true, anchor: 'middle' }, landLayer);
      }
    };
    const landMark = el('g', {}, root);
    el('line', { x1: 0, y1: HEAP_Y - 6, x2: 0, y2: HEAP_Y + CELL_H + 24, stroke: c.accent, 'stroke-width': 3 }, landMark);
    el('path', { d: `M-6,${HEAP_Y + CELL_H + 32} L0,${HEAP_Y + CELL_H + 22} L6,${HEAP_Y + CELL_H + 32} z`, fill: c.accent }, landMark);
    const landLabel = text(8, LAND_LABEL_Y, t('label.landEnd', 'New land end'), { size: fontSizes.xs, fill: c.text }, landMark);

    landMark.setAttribute('transform', `translate(${HEAP_X0},0)`);

    type BlockEls = { g: SVGGElement; rect: SVGRectElement; dividers: SVGLineElement[]; tag: SVGTextElement; size: number };
    const blockEls = new Map<number, BlockEls>();
    const valueEls = new Map<number, SVGTextElement>();

    // ── 화살 (이름 칸 → 덩이)
    const arrowLayer = el('g', {}, root);
    const arrowEls = new Map<string, SVGPathElement>();
    const arrowPath = (v: number[]): string => {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = v;
      const bend = Math.max(24, (y2 - y1) * 0.5);
      return `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;
    };

    // ── 빈 자리 목록
    for (let k = 0; k < LIST_MAX; k += 1) {
      el('rect', { x: HEAP_X0 + k * CHIP_GAP, y: LIST_Y, width: CHIP_W, height: CHIP_H, rx: 4, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 3' }, root);
    }
    text(HEAP_X0 + CHIP_W / 2, LIST_Y + CHIP_H + 14, t('label.front', 'Front'), { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
    const chipLayer = el('g', {}, root);
    type Chip = { id: number; addr: number; g: SVGGElement };
    let chips: Chip[] = [];
    let chipSerial = 0;

    const caption = text(STACK_X, CAPTION_Y, '', { size: fontSizes.md });

    // ── 모습 사이의 기억
    let prevSnap: StageSnapshot | null = null;
    const arrowTarget = new Map<string, number>();

    const blockX = (addr: number): number => cellX(addr, heapBase ?? addr);

    const styleBlock = (b: BlockEls, status: StageBlock['status']): void => {
      if (status === 'held') {
        b.rect.setAttribute('stroke', c.primary);
        b.rect.setAttribute('fill', c.bgSubtle);
        b.rect.setAttribute('stroke-dasharray', '');
        b.tag.textContent = '';
      } else if (status === 'lost') {
        b.rect.setAttribute('stroke', c.danger);
        b.rect.setAttribute('fill', c.bgSubtle);
        b.rect.setAttribute('stroke-dasharray', '5 3');
        b.tag.textContent = t('label.lost', 'Lost');
      } else {
        b.rect.setAttribute('stroke', c.textMuted);
        b.rect.setAttribute('fill', 'none');
        b.rect.setAttribute('stroke-dasharray', '4 3');
        b.tag.textContent = '';
      }
      b.g.setAttribute('data-status', status);
    };

    const applyBlock = (b: BlockEls) => (v: number[]): void => {
      const [x = 0, dy = 0, op = 1, wScale = 1] = v;
      b.g.setAttribute('transform', `translate(${x},${dy})`);
      b.g.setAttribute('opacity', String(op));
      const w = Math.max(0, (b.size * CELL_W - 2) * wScale);
      b.rect.setAttribute('width', String(w));
      b.dividers.forEach((d, k) => d.setAttribute('opacity', String(wScale > 0.9 && (k + 1) * CELL_W < w ? 1 : 0)));
    };

    const chipApply = (g: SVGGElement) => (v: number[]): void => {
      const [x = 0, y = 0, op = 1] = v;
      g.setAttribute('transform', `translate(${x},${y})`);
      g.setAttribute('opacity', String(op));
    };

    const makeChip = (addr: number): Chip => {
      const g = el('g', {}, chipLayer);
      el('rect', { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: 4, fill: c.bgSubtle, stroke: c.textMuted }, g);
      text(CHIP_W / 2, CHIP_H / 2 + smPx * 0.35, `@${addr}`, { mono: true, anchor: 'middle' }, g);
      chipSerial += 1;
      return { id: chipSerial, addr, g };
    };

    // ─────────────────────────────────────────────────────────────────────────
    const setProgram = (lines: StageLine[], callee: string, ms: number): void => {
      makeLabel.textContent = callee;
      const keep = new Set(lines.map((l) => l.key));
      for (const key of lineOrder) {
        if (keep.has(key)) continue;
        const node = lineEls.get(key);
        if (!node) continue;
        lineEls.delete(key);
        const cur = tw.get(`line:${key}`) ?? [PROG_X, LINE_Y0, 1];
        // 몸 밖으로 빠진다
        tw.to(`line:${key}`, [(cur[0] ?? PROG_X) + 90, cur[1] ?? LINE_Y0, 0], (v) => placeLine(node, v), ms, undefined, () => {
          node.remove();
          tw.drop(`line:${key}`);
        });
      }
      lines.forEach((line, k) => {
        const x = PROG_X + 4 + line.depth * INDENT;
        const y = LINE_Y0 + k * LINE_H;
        let node = lineEls.get(line.key);
        let from: number[] | undefined;
        if (!node) {
          node = text(x, y, line.text, { mono: true }, progLayer);
          lineEls.set(line.key, node);
          from = [x + 90, y, 0]; // 몸 안으로 미끄러져 든다
        }
        node.textContent = line.text;
        const target = node;
        tw.to(`line:${line.key}`, [x, y, 1], (v) => placeLine(target, v), ms, from);
      });
      lineOrder = lines.map((l) => l.key);
    };

    const placeLine = (node: SVGTextElement, v: number[]): void => {
      node.setAttribute('x', String(v[0] ?? 0));
      node.setAttribute('y', String(v[1] ?? 0));
      node.setAttribute('opacity', String(v[2] ?? 1));
    };

    const lineY = (key: string): number | null => {
      const k = lineOrder.indexOf(key);
      return k < 0 ? null : LINE_Y0 + k * LINE_H;
    };

    const moveMarker = (node: SVGRectElement, id: string, key: string, ms: number): void => {
      const y = key ? lineY(key) : null;
      const cur = tw.get(id);
      if (y === null) {
        tw.to(id, [cur?.[0] ?? LINE_Y0 - 12, 0], (v) => {
          node.setAttribute('y', String(v[0]));
          node.setAttribute('opacity', String(v[1]));
        }, ms);
        return;
      }
      const from = cur && (cur[1] ?? 0) > 0.05 ? undefined : [y - 12, 0];
      tw.to(id, [y - 12, 1], (v) => {
        node.setAttribute('y', String(v[0]));
        node.setAttribute('opacity', String(v[1]));
      }, ms, from);
    };

    const fillSlots = (els: SlotEls[], slots: StageSlot[], animate: boolean, ms: number, frameKey: string): void => {
      els.forEach((s, k) => {
        const slot = slots[k];
        if (!slot) return;
        s.name.textContent = slot.name;
        s.at.textContent = `@${slot.at}`;
        const next = slotText(slot);
        const changed = s.value.textContent !== next;
        s.value.textContent = next;
        s.value.setAttribute('fill', slot.kind === 'null' ? c.textMuted : c.text);
        const baseY = Number(s.box.getAttribute('y')) + 32;
        if (changed && animate && next !== '') {
          // 값이 칸에 떨어진다
          tw.to(`slot:${frameKey}:${k}`, [baseY], (v) => s.value.setAttribute('y', String(v[0])), ms, [baseY - 14]);
        } else {
          s.value.setAttribute('y', String(baseY));
        }
      });
    };

    const show = (snap: StageSnapshot, ms: number): void => {
      const prev = prevSnap;
      // 힙 시작 = 새 땅 끝 − 뗀 칸 전부 (덩이는 새 땅에서만 떼어진다)
      drawLand(snap.landEnd - snap.blocks.reduce((sum, b) => sum + b.size, 0));
      const base = heapBase ?? snap.landEnd;
      const isStart = snap.line === '';

      // ── 프로그램 표시
      moveMarker(marker, 'marker', snap.line, ms);
      moveMarker(marker2, 'marker2', snap.callLine, ms);

      // ── 스택
      fillSlots(outerSlots, snap.outer, prev !== null, ms, 'outer');
      const makeUp = snap.make.length > 0;
      const wasUp = prev !== null && prev.make.length > 0;
      if (makeUp) fillSlots(makeSlots, snap.make, false, ms, 'make');
      if (makeUp !== wasUp || prev === null) {
        // 얹힌다: 위에서 내려앉는다 · 걷힌다: 위로 들려 사라진다
        tw.to('frame:make', makeUp ? [0, 1] : [-MAKE_RISE, 0], (v) => {
          makeFrame.setAttribute('transform', `translate(0,${v[0]})`);
          makeFrame.setAttribute('opacity', String(v[1]));
        }, ms, makeUp && !wasUp ? [-MAKE_RISE, 0] : undefined);
      }

      // ── 새 땅 끝
      tw.to('land', [HEAP_X0 + (snap.landEnd - base) * CELL_W], (v) => {
        landMark.setAttribute('transform', `translate(${v[0]},0)`);
      }, ms);
      const landX = HEAP_X0 + (snap.landEnd - base) * CELL_W;
      landLabel.setAttribute('text-anchor', landX > W - 140 ? 'end' : 'start');
      landLabel.setAttribute('x', String(landX > W - 140 ? -8 : 8));

      // ── 덩이
      const seen = new Set<number>();
      for (const b of snap.blocks) {
        seen.add(b.addr);
        let be = blockEls.get(b.addr);
        let from: number[] | undefined;
        if (!be) {
          const g = el('g', {}, blockLayer);
          const rect = el('rect', { x: 1, y: HEAP_Y, width: b.size * CELL_W - 2, height: CELL_H, rx: 4, 'stroke-width': 2 }, g);
          const dividers: SVGLineElement[] = [];
          for (let k = 1; k < b.size; k += 1) {
            dividers.push(el('line', { x1: k * CELL_W, y1: HEAP_Y + 4, x2: k * CELL_W, y2: HEAP_Y + CELL_H - 4, stroke: c.border }, g));
          }
          const tag = text((b.size * CELL_W) / 2, HEAP_Y + CELL_H + 28, '', { size: fontSizes.xs, fill: c.danger, anchor: 'middle' }, g);
          be = { g, rect, dividers, tag, size: b.size };
          blockEls.set(b.addr, be);
          from = [blockX(b.addr), -34, 0, 1]; // 덩이가 힙에 떨어진다
        }
        styleBlock(be, b.status);
        const lostDim = b.status === 'lost' ? 0.6 : 1;
        tw.to(`block:${b.addr}`, [blockX(b.addr), 0, lostDim, 1], applyBlock(be), ms, from);
      }
      for (const [addr, be] of [...blockEls]) {
        if (seen.has(addr)) continue;
        blockEls.delete(addr);
        // 새 땅 끝 쪽으로 걷혀 들어간다
        tw.to(`block:${addr}`, [HEAP_X0 + (snap.landEnd - base) * CELL_W, 0, 0, 0], applyBlock(be), ms, undefined, () => {
          be.g.remove();
          tw.drop(`block:${addr}`);
        });
      }
      const statusOf = new Map(snap.blocks.map((b) => [b.addr, b.status] as const));

      // ── 칸 값
      const vseen = new Set<number>();
      for (const cell of snap.cells) {
        vseen.add(cell.addr);
        let node = valueEls.get(cell.addr);
        const x = cellX(cell.addr, base) + CELL_W / 2;
        const y = HEAP_Y + CELL_H / 2 + smPx * 0.4;
        let changed = false;
        if (!node) {
          node = text(x, y, '', { size: fontSizes.md, mono: true, anchor: 'middle', weight: '600' }, valueLayer);
          valueEls.set(cell.addr, node);
          changed = true;
        }
        if (node.textContent !== String(cell.value)) changed = true;
        node.textContent = String(cell.value);
        // 돌려준 덩이 안의 값은 경고 색 — 그 칸은 지금 아무의 것도 아니다
        node.setAttribute('fill', statusOf.get(cell.addr) === 'free' ? c.danger : c.text);
        const target = node;
        if (changed) {
          tw.to(`value:${cell.addr}`, [y, 1], (v) => {
            target.setAttribute('y', String(v[0]));
            target.setAttribute('opacity', String(v[1]));
          }, ms, [y - 40, 0]);
        }
      }
      for (const [addr, node] of [...valueEls]) {
        if (vseen.has(addr)) continue;
        valueEls.delete(addr);
        const y = Number(node.getAttribute('y'));
        tw.to(`value:${addr}`, [y, 0], (v) => {
          node.setAttribute('y', String(v[0]));
          node.setAttribute('opacity', String(v[1]));
        }, ms, undefined, () => {
          node.remove();
          tw.drop(`value:${addr}`);
        });
      }

      // ── 화살 — 주소를 담은 이름 칸마다 하나
      const want = new Map<string, { geo: number[]; addr: number }>();
      const toBlock = (addr: number): [number, number] => [cellX(addr, base) + CELL_W / 2, HEAP_Y - 2];
      snap.outer.forEach((s, k) => {
        if (s.kind !== 'ptr') return;
        const [x1, y1] = slotAnchor(OUTER_Y, k);
        const [x2, y2] = toBlock(s.value);
        want.set(s.name, { geo: [x1, y1, x2, y2, 1], addr: s.value });
      });
      snap.make.forEach((s, k) => {
        if (s.kind !== 'ptr') return;
        const [x1, y1] = slotAnchor(MAKE_Y, k);
        const [x2, y2] = toBlock(s.value);
        want.set(s.name, { geo: [x1, y1, x2, y2, 1], addr: s.value });
      });
      const leaving = [...arrowEls.keys()].filter((name) => !want.has(name));
      const handedOver = new Set<string>();
      for (const [name, w] of want) {
        let path = arrowEls.get(name);
        let from: number[] | undefined;
        const giver = leaving.find((l) => !handedOver.has(l) && arrowTarget.get(l) === w.addr && arrowTarget.get(name) !== w.addr);
        if (giver) {
          // 주소가 옮겨 붙는다 — 떠나는 이름 칸의 화살이 이 칸으로 미끄러져 온다
          const g = tw.get(`arrow:${giver}`);
          if (g) from = g;
          handedOver.add(giver);
          if (path) {
            // 앞 화살은 끈이 끊겨 흐려진다
            const ghost = path;
            arrowEls.delete(name);
            tw.to(`ghost:${name}:${arrowTarget.get(name) ?? 0}`, [0], (v) => ghost.setAttribute('opacity', String(v[0])), ms, [0.8], () => ghost.remove());
            path = undefined;
          }
        }
        if (!path) {
          path = el('path', { fill: 'none', stroke: c.primary, 'stroke-width': 2, 'marker-end': `url(#${uid}-head)` }, arrowLayer);
          arrowEls.set(name, path);
          if (!from) from = [w.geo[0] ?? 0, w.geo[1] ?? 0, w.geo[0] ?? 0, (w.geo[1] ?? 0) + 8, 0];
          tw.drop(`arrow:${name}`);
        }
        const node = path;
        tw.to(`arrow:${name}`, w.geo, (v) => {
          node.setAttribute('d', arrowPath(v));
          node.setAttribute('opacity', String(v[4] ?? 1));
        }, ms, from);
        arrowTarget.set(name, w.addr);
      }
      for (const name of leaving) {
        const path = arrowEls.get(name);
        arrowEls.delete(name);
        arrowTarget.delete(name);
        if (!path) continue;
        if (handedOver.has(name)) {
          path.remove();
          tw.drop(`arrow:${name}`);
          continue;
        }
        const cur = tw.get(`arrow:${name}`) ?? [0, 0, 0, 0, 1];
        tw.to(`arrow:${name}`, [cur[0] ?? 0, cur[1] ?? 0, cur[0] ?? 0, (cur[1] ?? 0) + 8, 0], (v) => {
          path.setAttribute('d', arrowPath(v));
          path.setAttribute('opacity', String(v[4] ?? 0));
        }, ms, undefined, () => {
          path.remove();
          tw.drop(`arrow:${name}`);
        });
      }

      // ── 빈 자리 목록 — 앞(가장 최근)이 왼쪽. 칩이 힙 덩이와 목록 사이를 오간다
      const old = chips.map((ch) => ch.addr);
      const next = snap.freeList;
      let nextChips: Chip[] = [];
      const exiting: Chip[] = [];
      const entering = new Set<Chip>();
      if (next.length === old.length + 1 && next.slice(1).every((a, k) => a === old[k])) {
        const fresh = makeChip(next[0] ?? 0);
        entering.add(fresh);
        nextChips = [fresh, ...chips];
      } else if (next.length === old.length - 1) {
        let k = 0;
        while (k < next.length && next[k] === old[k]) k += 1;
        const gone = chips[k];
        if (gone) exiting.push(gone);
        nextChips = chips.filter((_, i) => i !== k);
      } else if (next.length === old.length && next.every((a, k) => a === old[k])) {
        nextChips = chips;
      } else {
        exiting.push(...chips);
        nextChips = next.map((a) => makeChip(a));
        for (const ch of nextChips) entering.add(ch);
      }
      nextChips.forEach((ch, k) => {
        // 돌려준 덩이의 자리에서 목록으로 날아든다 · 남은 칩은 한 칸씩 밀린다
        const from = entering.has(ch) ? [blockX(ch.addr), HEAP_Y, 0] : undefined;
        tw.to(`chip:${ch.id}`, [HEAP_X0 + k * CHIP_GAP, LIST_Y, 1], chipApply(ch.g), ms, from);
      });
      for (const ch of exiting) {
        // 목록에서 꺼낸 칩은 제 덩이로 돌아간다 · 판이 바뀌면 새 땅 시작 쪽으로 걷힌다
        const dest = isStart ? [HEAP_X0, HEAP_Y, 0] : [blockX(ch.addr), HEAP_Y, 0];
        tw.to(`chip:${ch.id}`, dest, chipApply(ch.g), ms, undefined, () => {
          ch.g.remove();
          tw.drop(`chip:${ch.id}`);
        });
      }
      chips = nextChips;

      prevSnap = snap;
    };

    const clear = (): void => {
      tw.flush();
      prevSnap = null;
      for (const be of blockEls.values()) be.g.remove();
      blockEls.clear();
      for (const node of valueEls.values()) node.remove();
      valueEls.clear();
      for (const p of arrowEls.values()) p.remove();
      arrowEls.clear();
      arrowTarget.clear();
      for (const ch of chips) ch.g.remove();
      chips = [];
      caption.textContent = '';
    };

    const api: AllocateAndFreeStage & ViewInstance = {
      setProgram,
      show,
      setCaption(s: string) {
        caption.textContent = s;
      },
      clear,
      destroy() {
        tw.destroy();
        root.remove();
      },
    };
    return api;
  },
};
