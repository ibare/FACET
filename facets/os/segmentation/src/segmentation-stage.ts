/**
 * segmentation-stage — 메모리 띠 위에서 덩이가 틈에 앉고, 나가고, 튕겨 나온다.
 *
 * 그리는 것
 * - 메모리 띠 (칸 하나 = 1 KiB). 덩이는 식별자 글자로, 고정 칸이면 프레임 경계와 안쪽 낭비(옅은 칸)
 * - 띠 아래 앞 판의 끝 모양 윤곽 — 새 판에서 덩이는 그 윤곽에서 제 새 자리로 올라와 앉는다
 * - 빈 몫 합 · 가장 큰 틈 · 지금 요청 · 안쪽 낭비 막대 (띠와 같은 축척)
 * - 오른쪽 요청 열한 줄, 지금 걸음 표시가 줄을 따라 내려간다
 *
 * 운동 (길이는 projector 가 재생 속도에서 셈해 넘긴다)
 * - 들어옴: 앞 판 자리(없으면 띠 위)에서 새 자리로 미끄러진다. 조각 수가 달라지면 잘려 흩어지거나 한 덩이로 붙는다
 * - 나감: 띠에서 들려 나간다
 * - 못 들어감: 틈마다 대어 보고 튕겨 나와 띠 위에 머문다
 * - 새 판: 띠의 덩이들이 윤곽 줄로 내려앉는다
 *
 * 이 view 는 이벤트를 해석하지 않는다 — projector 가 부르는 메서드만 연다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StagePiece = { block: string; start: number; len: number; used: number };
export type StageHole = { start: number; len: number };

export type StageSnapshot = {
  pieces: StagePiece[];
  holes: StageHole[];
  freeTotal: number;
  largestHole: number;
  insideWaste: number;
};

export type StageRound = {
  fixed: boolean;
  memoryKiB: number;
  frameKiB: number;
  blocks: string[];
  lines: string[];
  snapshot: StageSnapshot;
  caption: string;
};

export type StageStep = {
  kind: 'place' | 'release' | 'reject';
  /** 1 부터 — 요청 줄 차례 */
  step: number;
  block: string;
  /** 들어옴 · 못 들어감의 요청 크기. 나감이면 null */
  request: number | null;
  snapshot: StageSnapshot;
  caption: string;
};

export type SegmentationStage = {
  setRound(round: StageRound, ms: number): Promise<void>;
  showStep(step: StageStep, ms: number): Promise<void>;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 850;
const H = 292;
const LX = 16;
const BX = 124;
const BAND_W = 512;
const HOVER_Y = 26;
const HOVER_H = 24;
const FRAME_LABEL_Y = 62;
const BAND_Y = 68;
const BAND_H = 44;
const TICK_Y = 127;
const GHOST_Y = 136;
const GHOST_H = 12;
const BAR_Y = 166;
const BAR_STEP = 27;
const BAR_H = 14;
const LIST_X = 700;
const LIST_Y = 76;
const LIST_STEP = 19;

type Sprite = { el: SVGRectElement; label: SVGTextElement; x0: number; y0: number; w0: number; h0: number; x1: number; y1: number; w1: number; h1: number };

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

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const segmentationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const vivid = categorical(8, 'vivid');
    const pastel = categorical(8, 'pastel');
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    const frames = new Set<number>();
    const pending = new Set<() => void>();

    /** p 를 0→1 로 그리며 ms 동안 흐른다. 되짚는 중이면 곧바로 끝 모습. */
    const tween = (ms: number, draw: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || ms <= 0 || isInstant()) {
          draw(1);
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          pending.delete(finish);
          if (!destroyed) draw(1);
          resolve();
        };
        pending.add(finish);
        const t0 = performance.now();
        const tick = (now: number): void => {
          if (done) return;
          if (destroyed || isInstant()) {
            finish();
            return;
          }
          const p = Math.min(1, (now - t0) / ms);
          draw(ease(p));
          if (p < 1) frames.add(requestAnimationFrame(tick));
          else finish();
        };
        frames.add(requestAnimationFrame(tick));
      });

    const stopAll = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const f of [...pending]) f();
    };
    params.onScrubStart?.(stopAll);

    // ── 판마다 바뀌는 모형 ──
    let memoryKiB = 0;
    let frameKiB = 0;
    let cell = 0;
    let fixed = false;
    let blockNames: string[] = [];
    let current: StagePiece[] = [];
    let lastRound: StagePiece[] = [];
    let lines: string[] = [];
    let lineState: ('todo' | 'done' | 'rejected')[] = [];
    let bars = { free: 0, big: 0, request: 0, waste: 0 };

    const colorOf = (block: string): { fill: string; soft: string } => {
      const i = blockNames.indexOf(block);
      const fill = vivid[i];
      const soft = pastel[i];
      if (i < 0 || fill === undefined || soft === undefined) throw new Error(`segmentation-stage: 모르는 덩이 ${block}`);
      return { fill, soft };
    };
    const xOf = (k: number): number => BX + k * cell;

    // ── 층 ──
    const caption = el('text', { x: LX, y: 17, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, svg);
    const hoverLayer = el('g', {}, svg);
    const frameLayer = el('g', {}, svg);
    const band = el('g', {}, svg);
    const holeLayer = el('g', {}, svg);
    const blockLayer = el('g', {}, svg);
    const tickLayer = el('g', {}, svg);
    const ghostLayer = el('g', {}, svg);
    const barLayer = el('g', {}, svg);
    const listLayer = el('g', {}, svg);
    const spriteLayer = el('g', {}, svg);

    const sideLabel = (y: number, text: string): void => {
      const n = el('text', { x: BX - 10, y, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, svg);
      n.textContent = text;
    };
    sideLabel(BAND_Y + BAND_H / 2 + xsPx / 3, t('label.memory', 'Memory'));
    sideLabel(GHOST_Y + GHOST_H - 2, t('label.lastRound', 'Last round'));

    // 막대 넷 — 띠와 같은 축척
    type Bar = { rect: SVGRectElement; value: SVGTextElement };
    const barRow = (i: number, label: string, fill: string): Bar => {
      const y = BAR_Y + i * BAR_STEP;
      const lab = el('text', { x: BX - 10, y: y + BAR_H - 3, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, barLayer);
      lab.textContent = label;
      el('rect', { x: BX, y, width: BAND_W, height: BAR_H, fill: c.bgSubtle, stroke: c.border, rx: 2 }, barLayer);
      const rect = el('rect', { x: BX, y, width: 0, height: BAR_H, fill, rx: 2 }, barLayer);
      const value = el('text', { x: BX + 6, y: y + BAR_H - 3, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text }, barLayer);
      return { rect, value };
    };
    const barFree = barRow(0, t('label.freeTotal', 'Free total'), c.itemSorted);
    const barBig = barRow(1, t('label.largestHole', 'Largest hole'), c.success);
    const barReq = barRow(2, t('label.request', 'Request'), c.itemActive);
    const barWaste = barRow(3, t('label.waste', 'Internal waste'), c.danger);

    const setBarText = (b: Bar, kib: number | null, w: number): void => {
      b.value.setAttribute('x', String(BX + w + 6));
      b.value.textContent = kib === null ? '' : t('label.kib', '{n} KiB', { n: kib });
    };
    const moveBars = (next: typeof bars, showRequest: boolean, ms: number): Promise<void> => {
      const from = { ...bars };
      bars = { ...next };
      const rows: [Bar, number, number, boolean][] = [
        [barFree, from.free, next.free, true],
        [barBig, from.big, next.big, true],
        [barReq, from.request, next.request, showRequest],
        [barWaste, from.waste, next.waste, true],
      ];
      for (const [b, , to, show] of rows) setBarText(b, show ? to : null, to * cell);
      return tween(ms, (p) => {
        for (const [b, a, to] of rows) {
          const w = lerp(a, to, p) * cell;
          b.rect.setAttribute('width', String(Math.max(0, w)));
        }
      });
    };

    // ── 띠 · 프레임 · 눈금 ──
    const drawBand = (): void => {
      band.replaceChildren();
      tickLayer.replaceChildren();
      frameLayer.replaceChildren();
      el('rect', { x: BX, y: BAND_Y, width: BAND_W, height: BAND_H, fill: c.bgSubtle, stroke: c.border }, band);
      for (let k = 1; k < memoryKiB; k++) {
        el('line', { x1: xOf(k), y1: BAND_Y, x2: xOf(k), y2: BAND_Y + BAND_H, stroke: c.border, 'stroke-width': 0.5 }, band);
      }
      for (let k = 0; k <= memoryKiB; k += frameKiB) {
        const n = el('text', { x: xOf(k), y: TICK_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, tickLayer);
        n.textContent = String(k);
      }
      const unit = el('text', { x: BX + BAND_W + 14, y: TICK_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, tickLayer);
      unit.textContent = t('label.kibAxis', 'KiB');
      if (fixed) {
        for (let f = 0; f * frameKiB < memoryKiB; f++) {
          if (f > 0) {
            el('line', { x1: xOf(f * frameKiB), y1: BAND_Y - 4, x2: xOf(f * frameKiB), y2: BAND_Y + BAND_H + 4, stroke: c.text, 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }, frameLayer);
          }
          const n = el('text', { x: xOf(f * frameKiB + frameKiB / 2), y: FRAME_LABEL_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, frameLayer);
          n.textContent = t('label.frame', 'frame {n}', { n: f });
        }
      }
    };

    // ── 덩이 (정지 모습) ──
    const drawBlocks = (pieces: StagePiece[]): void => {
      blockLayer.replaceChildren();
      for (const p of pieces) {
        const { fill, soft } = colorOf(p.block);
        const g = el('g', { 'data-block': p.block }, blockLayer);
        el('rect', { x: xOf(p.start), y: BAND_Y + 2, width: p.used * cell, height: BAND_H - 4, fill, stroke: c.bg, 'stroke-width': 1, rx: 2 }, g);
        if (p.len > p.used) {
          el('rect', { x: xOf(p.start + p.used), y: BAND_Y + 2, width: (p.len - p.used) * cell, height: BAND_H - 4, fill: soft, stroke: fill, 'stroke-dasharray': '2 2', rx: 2 }, g);
        }
        const tx = el('text', { x: xOf(p.start) + (p.used * cell) / 2, y: BAND_Y + BAND_H / 2 + smPx / 3, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.stateInk }, g);
        tx.textContent = p.block;
      }
    };

    const drawHoles = (holes: StageHole[], largest: number): void => {
      holeLayer.replaceChildren();
      for (const h of holes) {
        const label = t('label.kib', '{n} KiB', { n: h.len });
        const w = h.len * cell;
        if (label.length * xsPx * 0.62 > w - 2) continue;
        const n = el('text', { x: xOf(h.start) + w / 2, y: BAND_Y + BAND_H / 2 + xsPx / 3, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: h.len === largest ? c.success : c.textMuted, 'font-weight': h.len === largest ? 700 : 400 }, holeLayer);
        n.textContent = label;
      }
    };

    const drawGhost = (): void => {
      ghostLayer.replaceChildren();
      el('rect', { x: BX, y: GHOST_Y, width: BAND_W, height: GHOST_H, fill: 'none', stroke: c.border, 'stroke-width': 0.5 }, ghostLayer);
      for (const p of lastRound) {
        const { fill } = colorOf(p.block);
        el('rect', { x: xOf(p.start) + 0.5, y: GHOST_Y + 0.5, width: Math.max(0, p.used * cell - 1), height: GHOST_H - 1, fill: 'none', stroke: fill, 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }, ghostLayer);
        const n = el('text', { x: xOf(p.start) + (p.used * cell) / 2, y: GHOST_Y + GHOST_H - 2, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, ghostLayer);
        n.textContent = p.block;
      }
    };

    // ── 요청 줄 ──
    const marker = el('rect', { x: LIST_X - 6, y: LIST_Y - LIST_STEP + 5, width: W - LIST_X, height: LIST_STEP - 2, rx: 3, fill: c.accent, opacity: 0 }, listLayer);
    const lineNodes: SVGTextElement[] = [];
    let markerY = LIST_Y - LIST_STEP + 5;
    const drawLines = (active: number): void => {
      for (const n of lineNodes) n.remove();
      lineNodes.length = 0;
      lines.forEach((text, i) => {
        const st = lineState[i];
        const fill = st === 'rejected' ? c.danger : i + 1 === active ? c.stateInk : st === 'done' ? c.text : c.textMuted;
        const n = el('text', { x: LIST_X, y: LIST_Y + i * LIST_STEP, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill, 'text-decoration': st === 'rejected' ? 'line-through' : 'none' }, listLayer);
        n.textContent = text;
        lineNodes.push(n);
      });
    };
    const moveMarker = (active: number, ms: number): Promise<void> => {
      const from = markerY;
      const to = LIST_Y + (active - 1) * LIST_STEP - LIST_STEP + 5;
      markerY = to;
      marker.setAttribute('opacity', active > 0 ? '0.85' : '0');
      return tween(ms, (p) => marker.setAttribute('y', String(lerp(from, to, p))));
    };

    // ── 떠 있는 덩이 (못 들어간 것) ──
    const clearHover = (): void => {
      hoverLayer.replaceChildren();
      spriteLayer.replaceChildren();
    };

    const makeSprite = (block: string, x0: number, y0: number, w0: number, h0: number, x1: number, y1: number, w1: number, h1: number): Sprite => {
      const { fill } = colorOf(block);
      const rect = el('rect', { x: x0, y: y0, width: w0, height: h0, fill, stroke: c.bg, rx: 2 }, spriteLayer);
      const label = el('text', { x: x0 + w0 / 2, y: y0 + h0 / 2 + smPx / 3, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.stateInk }, spriteLayer);
      label.textContent = block;
      return { el: rect, label, x0, y0, w0, h0, x1, y1, w1, h1 };
    };
    const drawSprite = (s: Sprite, p: number): void => {
      const x = lerp(s.x0, s.x1, p);
      const y = lerp(s.y0, s.y1, p);
      const w = lerp(s.w0, s.w1, p);
      const h = lerp(s.h0, s.h1, p);
      s.el.setAttribute('x', String(x));
      s.el.setAttribute('y', String(y));
      s.el.setAttribute('width', String(Math.max(0, w)));
      s.el.setAttribute('height', String(Math.max(0, h)));
      s.label.setAttribute('x', String(x + w / 2));
      s.label.setAttribute('y', String(y + h / 2 + smPx / 3));
    };

    /** 새 자리의 토막들을 어디서 출발시킬지 — 앞 판 자리(윤곽 줄) 또는 띠 위. */
    const arrivalSprites = (block: string, target: StagePiece[]): Sprite[] => {
      const prev = lastRound.filter((p) => p.block === block);
      const fromY = prev.length > 0 ? GHOST_Y : HOVER_Y;
      const fromH = prev.length > 0 ? GHOST_H : HOVER_H;
      const toY = BAND_Y + 2;
      const toH = BAND_H - 4;
      const out: Sprite[] = [];
      if (prev.length === 0 || (prev.length === 1 && target.length >= 1)) {
        // 한 덩이에서 출발 — 조각이 여럿이면 그 덩이를 잘라 흩어 보낸다
        const origin = prev.length === 1 ? prev[0]!.start : target[0]!.start;
        let off = 0;
        for (const tp of target) {
          out.push(makeSprite(block, xOf(origin + off), fromY, tp.used * cell, fromH, xOf(tp.start), toY, tp.used * cell, toH));
          off += tp.used;
        }
      } else if (target.length >= prev.length) {
        target.forEach((tp, j) => {
          const src = prev[Math.min(j, prev.length - 1)]!;
          out.push(makeSprite(block, xOf(src.start), fromY, src.used * cell, fromH, xOf(tp.start), toY, tp.used * cell, toH));
        });
      } else {
        // 조각 여럿이 한 덩이로 붙는다
        const base = target[0]!.start;
        let off = 0;
        for (const src of prev) {
          out.push(makeSprite(block, xOf(src.start), fromY, src.used * cell, fromH, xOf(base + off), toY, src.used * cell, toH));
          off += src.used;
        }
      }
      return out;
    };

    const applySnapshot = (s: StageSnapshot): void => {
      current = s.pieces.map((p) => ({ ...p }));
      drawBlocks(current);
      drawHoles(s.holes, s.largestHole);
    };

    const instance: SegmentationStage & ViewInstance = {
      async setRound(round: StageRound, ms: number): Promise<void> {
        if (round.memoryKiB <= 0 || round.frameKiB <= 0) throw new Error('segmentation-stage: 메모리 · 프레임 크기가 비었다');
        stopAll();
        const hadBand = memoryKiB > 0;
        const leaving = current.map((p) => ({ ...p }));
        memoryKiB = round.memoryKiB;
        frameKiB = round.frameKiB;
        cell = BAND_W / memoryKiB;
        blockNames = [...round.blocks];
        fixed = round.fixed;
        lines = [...round.lines];
        lineState = lines.map(() => 'todo');
        clearHover();
        caption.textContent = round.caption;

        // 띠의 덩이들이 윤곽 줄로 내려앉는다 — 그것이 이번 판의 앞 판 모습이 된다
        if (hadBand && leaving.length > 0) {
          lastRound = leaving;
          blockLayer.replaceChildren();
          holeLayer.replaceChildren();
          const sprites = leaving.map((p) =>
            makeSprite(p.block, xOf(p.start), BAND_Y + 2, p.used * cell, BAND_H - 4, xOf(p.start), GHOST_Y, p.used * cell, GHOST_H),
          );
          drawBand();
          drawLines(0);
          await Promise.all([
            tween(ms, (p) => sprites.forEach((s) => drawSprite(s, p))),
            moveMarker(0, ms),
            moveBars({ free: round.snapshot.freeTotal, big: round.snapshot.largestHole, request: 0, waste: round.snapshot.insideWaste }, false, ms),
          ]);
          spriteLayer.replaceChildren();
        } else {
          drawBand();
          drawLines(0);
          await Promise.all([
            moveMarker(0, 0),
            moveBars({ free: round.snapshot.freeTotal, big: round.snapshot.largestHole, request: 0, waste: round.snapshot.insideWaste }, false, ms),
          ]);
        }
        drawGhost();
        applySnapshot(round.snapshot);
      },

      async showStep(step: StageStep, ms: number): Promise<void> {
        if (memoryKiB <= 0) throw new Error('segmentation-stage: 판이 서기 전에 걸음이 왔다');
        stopAll();
        clearHover();
        const i = step.step - 1;
        if (i < 0 || i >= lines.length) throw new Error(`segmentation-stage: 요청 줄 ${step.step} 가 없다`);
        lineState[i] = step.kind === 'reject' ? 'rejected' : 'done';
        drawLines(step.step);
        caption.textContent = step.caption;
        const nextBars = {
          free: step.snapshot.freeTotal,
          big: step.snapshot.largestHole,
          request: step.request === null ? 0 : step.request,
          waste: step.snapshot.insideWaste,
        };
        const motions: Promise<void>[] = [moveMarker(step.step, ms), moveBars(nextBars, step.request !== null, ms)];

        if (step.kind === 'place') {
          const target = step.snapshot.pieces.filter((p) => p.block === step.block);
          if (target.length === 0) throw new Error(`segmentation-stage: 놓인 ${step.block} 의 자리가 없다`);
          // 이미 앉은 덩이는 그대로, 들어오는 덩이만 움직인다
          drawBlocks(step.snapshot.pieces.filter((p) => p.block !== step.block));
          holeLayer.replaceChildren();
          const sprites = arrivalSprites(step.block, target);
          motions.push(tween(ms, (p) => sprites.forEach((s) => drawSprite(s, p))));
          await Promise.all(motions);
          spriteLayer.replaceChildren();
          applySnapshot(step.snapshot);
          return;
        }

        if (step.kind === 'release') {
          const going = current.filter((p) => p.block === step.block);
          drawBlocks(step.snapshot.pieces);
          drawHoles(step.snapshot.holes, step.snapshot.largestHole);
          const sprites = going.map((p) =>
            makeSprite(p.block, xOf(p.start), BAND_Y + 2, p.used * cell, BAND_H - 4, xOf(p.start), HOVER_Y - 4, p.used * cell, HOVER_H - 8),
          );
          motions.push(
            tween(ms, (p) => {
              sprites.forEach((s) => {
                drawSprite(s, p);
                s.el.setAttribute('opacity', String(1 - p));
                s.label.setAttribute('opacity', String(1 - p));
              });
            }),
          );
          await Promise.all(motions);
          spriteLayer.replaceChildren();
          applySnapshot(step.snapshot);
          return;
        }

        // 못 들어감 — 틈마다 대어 보고 튕겨 나온다
        if (step.request === null) throw new Error('segmentation-stage: 못 들어간 요청의 크기가 없다');
        applySnapshot(step.snapshot);
        const size = step.request;
        const w = size * cell;
        const holes = [...step.snapshot.holes];
        const largest = holes.reduce<StageHole | null>((m, h) => (m === null || h.len > m.len ? h : m), null);
        const stops = holes.map((h) => h.start);
        if (largest !== null) stops.push(largest.start);
        const prev = lastRound.find((p) => p.block === step.block);
        const startX = prev ? xOf(prev.start) : xOf(0);
        const s = makeSprite(step.block, startX, prev ? GHOST_Y : HOVER_Y, w, prev ? GHOST_H : HOVER_H, startX, HOVER_Y, w, HOVER_H);
        s.el.setAttribute('stroke', c.danger);
        s.el.setAttribute('stroke-width', '2');
        const legs = Math.max(1, stops.length);
        motions.push(
          tween(ms, (p) => {
            const pos = p * legs;
            const leg = Math.min(legs - 1, Math.floor(pos));
            const q = pos - leg;
            const fromX = leg === 0 ? startX : xOf(stops[leg - 1]!);
            const toX = stops.length > 0 ? xOf(stops[leg]!) : startX;
            const x = lerp(fromX, toX, Math.min(1, q * 2));
            // 앞 절반은 틈 위로 옮겨 가고, 뒤 절반에서 띠에 닿았다가 튕겨 오른다
            const y = leg === 0 && q <= 0.5 ? lerp(s.y0, HOVER_Y, q * 2) : HOVER_Y;
            const dip = q > 0.5 ? Math.sin((q - 0.5) * 2 * Math.PI) * (BAND_Y - HOVER_Y - HOVER_H + 10) : 0;
            s.el.setAttribute('x', String(x));
            s.el.setAttribute('y', String(y + dip));
            s.el.setAttribute('height', String(HOVER_H));
            s.label.setAttribute('x', String(x + w / 2));
            s.label.setAttribute('y', String(y + dip + HOVER_H / 2 + smPx / 3));
          }),
        );
        await Promise.all(motions);
        // 튕겨 나온 덩이는 띠 위에 남는다 — 요청 막대와 가장 큰 틈 막대가 아래에서 나란히 선다
        const endX = largest !== null ? xOf(largest.start) : startX;
        spriteLayer.replaceChildren();
        const { fill } = colorOf(step.block);
        el('rect', { x: endX, y: HOVER_Y, width: w, height: HOVER_H, fill, stroke: c.danger, 'stroke-width': 2, rx: 2 }, hoverLayer);
        const n = el('text', { x: endX + w / 2, y: HOVER_Y + HOVER_H / 2 + smPx / 3, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.stateInk }, hoverLayer);
        n.textContent = step.block;
      },

      destroy(): void {
        destroyed = true;
        stopAll();
        svg.replaceChildren();
      },
    };
    return instance;
  },
};
