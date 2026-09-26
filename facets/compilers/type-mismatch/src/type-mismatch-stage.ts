import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { TmCheck, TmNode, TypeMismatchScene } from './scene.js';

/**
 * type-mismatch 의 그림 — 끼워 보다 걸린다.
 *
 * 위: 원시 프로그램. 검사한 줄 끝에 들어간 타입의 패가 남고, 걸린 줄에는 걸린 연산자 밑에 톱니 금이 남는다.
 * 아래: 작업대. 지금 줄을 크게 놓고, 잎의 타입 패가 연산자의 홈으로, 연산의 결과 패가 선언한 자리로 **밀려 들어간다.**
 * 규칙이 없는 짝이면 오른쪽 패가 홈 어귀에서 튕겨 나와 비스듬히 걸린다. 그 위의 홈과 자리는 비어 있다.
 * 판정: 걸린 자리에서 거부의 막대가 위아래로 번져 프로그램 전체를 덮는다.
 */

const H = 420;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;
const FRAME_MS = 16;

const CODE_PX = parseFloat(fontSizes.md);
const BENCH_PX = parseFloat(fontSizes.lg);
const TILE_PX = parseFloat(fontSizes.sm);
const MONO_RATIO = 0.6;
const CW = CODE_PX * MONO_RATIO;
const BCW = BENCH_PX * MONO_RATIO;
const TILE_W = Math.round('string'.length * TILE_PX * MONO_RATIO + 12);
const TILE_H = 20;
const HOLE_PAD = 3;

const LIST_TOP = 36;
const LIST_BOTTOM = 188;
const GUTTER_X = 34;
const BAR_X = 44;
const CODE_X = 56;
const BENCH_TEXT_Y = 222;
const BENCH_ROW0 = 232;
const BENCH_BOTTOM = 352;
const STUCK_DX = 9;
const STUCK_DY = -13;
const STUCK_ROT = 11;

const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
};
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

type Pose = { x: number; y: number; rot: number };

/** 한 패의 길 — 출발, 끝, 그리고 걸린다면 부딪히는 자리. */
type Move = {
  g: SVGElement;
  from: Pose;
  to: Pose;
  hit: Pose | null;
  phase: number;
};

type Handles = { moves: Move[]; phases: number; bar: { line: SVGElement; mid: number; top: number; bottom: number } | null };

function heightOf(nodes: TmNode[], i: number): number {
  const n = nodes[i];
  if (n === undefined) throw new Error(`type-mismatch 그림: 노드 ${i} 가 없다`);
  if (n.l === null || n.r === null) return 0;
  return 1 + Math.max(heightOf(nodes, n.l), heightOf(nodes, n.r));
}

function poseAttr(p: Pose): string {
  return `translate(${r1(p.x)} ${r1(p.y)}) rotate(${r1(p.rot)} ${r1(TILE_W / 2)} ${r1(TILE_H / 2)})`;
}

export const typeMismatchStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function tile(parent: Element, type: string, pose: Pose, stuck: boolean): SVGElement {
      const g = el('g', { transform: poseAttr(pose) }, parent);
      el('rect', { x: 0, y: 0, width: TILE_W, height: TILE_H, rx: 3, fill: c.bg, stroke: stuck ? c.danger : c.text, 'stroke-width': stuck ? 2 : 1.2 }, g);
      el('text', { x: TILE_W / 2, y: TILE_H / 2 + TILE_PX * 0.36, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: stuck ? c.danger : c.text }, g, type);
      return g;
    }

    function hole(parent: Element, x: number, y: number, fill: string, stroke: string, dashed: boolean): void {
      el('rect', {
        x: x - HOLE_PAD, y: y - HOLE_PAD, width: TILE_W + HOLE_PAD * 2, height: TILE_H + HOLE_PAD * 2, rx: 4,
        fill, stroke, 'stroke-width': 1.2, ...(dashed ? { 'stroke-dasharray': '3 3' } : {}),
      }, parent);
    }

    function zigzag(parent: Element, x0: number, x1: number, y: number): void {
      const pts: string[] = [];
      const n = Math.max(2, Math.round((x1 - x0) / 4));
      for (let i = 0; i <= n; i += 1) pts.push(`${r1(lerp(x0, x1, i / n))},${r1(y + (i % 2 === 0 ? 0 : 3))}`);
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: c.danger, 'stroke-width': 1.6 }, parent);
    }

    /** 작업대 — 줄 하나를 크게 놓고 패와 홈과 자리를 세운다. 움직일 패의 길을 돌려준다. */
    function drawBench(scene: TypeMismatchScene, check: TmCheck, dim: boolean): { moves: Move[]; phases: number } {
      const layer = el('g', dim ? { opacity: 0.55 } : {}, svg);
      const line = scene.lines[check.line];
      if (line === undefined) throw new Error(`type-mismatch 그림: 줄 ${check.line + 1} 이 없다`);
      const x0 = (W - line.text.length * BCW) / 2;
      const xAt = (off: number): number => x0 + off * BCW;
      el('text', { x: x0, y: BENCH_TEXT_Y, 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text }, layer, line.text);

      const nodes = check.nodes;
      const rootH = heightOf(nodes, check.root);
      const gap = Math.min(44, (BENCH_BOTTOM - BENCH_ROW0 - TILE_H) / (rootH + 1));
      const rowY = (h: number): number => BENCH_ROW0 + h * gap;

      // 연산 노드의 홈 — 가운데 연산자, 양옆에 패가 들어갈 홈 둘
      const holes = new Map<number, { lx: number; rx: number; y: number; cx: number }>();
      nodes.forEach((n, i) => {
        if (n.op === null || n.symFrom === null) return;
        const cx = xAt(n.symFrom + n.op.length / 2);
        const y = rowY(heightOf(nodes, i));
        const opGap = Math.max(22, n.op.length * BCW + 12);
        const lx = cx - opGap / 2 - TILE_W - HOLE_PAD;
        const rx = cx + opGap / 2 + HOLE_PAD;
        holes.set(i, { lx, rx, y, cx });
        const snag = n.state === 'snag';
        const untried = n.state === 'untried';
        const frameStroke = snag ? c.danger : untried ? c.textMuted : c.text;
        el('rect', {
          x: lx - HOLE_PAD * 2, y: y - HOLE_PAD * 2, width: rx - lx + TILE_W + HOLE_PAD * 4, height: TILE_H + HOLE_PAD * 4, rx: 6,
          fill: c.bgSubtle, stroke: frameStroke, 'stroke-width': snag ? 2 : 1.2, ...(untried ? { 'stroke-dasharray': '4 3' } : {}),
        }, layer);
        hole(layer, lx, y, c.bg, c.border, true);
        hole(layer, rx, y, c.bg, c.border, true);
        el('text', { x: cx, y: y + TILE_H / 2 + BENCH_PX * 0.35, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: snag ? c.danger : untried ? c.textMuted : c.text }, layer, n.op);
        // 연산자 글자에서 홈으로 내려오는 가는 선
        el('line', { x1: cx, y1: BENCH_TEXT_Y + 4, x2: cx, y2: y - HOLE_PAD * 2, stroke: c.border, 'stroke-width': 1 }, layer);
      });

      // 선언한 자리 (let) 또는 무엇이든 받는 자리 (show)
      const slot = check.slot;
      const slotCx = xAt((slot.from + slot.to) / 2);
      const slotY = rowY(rootH + 1);
      const slotX = slotCx - TILE_W / 2;
      const filled = check.outcome === 'fit' || check.outcome === 'widen';
      const untriedSlot = check.outcome === 'snag';
      hole(layer, slotX, slotY, filled ? c.accent : c.bg, check.outcome === 'slot-miss' ? c.danger : untriedSlot ? c.textMuted : c.text, !filled);
      el('line', { x1: slotCx, y1: BENCH_TEXT_Y + 4, x2: slotCx, y2: slotY - HOLE_PAD, stroke: c.border, 'stroke-width': 1 }, layer);
      if (!filled) {
        const word = slot.kind === 'let' ? slot.declared : t('label.any', 'any');
        el('text', { x: slotCx, y: slotY + TILE_H / 2 + TILE_PX * 0.36, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, layer, word);
      }
      if (untriedSlot) {
        el('text', { x: slotCx, y: slotY + TILE_H + HOLE_PAD + TILE_PX + 2, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, layer, t('label.untried', 'not tried'));
      }

      // 패 — 타입을 얻은 노드마다 하나. 부모가 맞춰 본 노드면 부모의 홈으로, 뿌리면 자리로 간다.
      const moves: Move[] = [];
      let phases = 0;
      nodes.forEach((n, i) => {
        if (n.state !== 'typed' || n.type === null) return;
        const phase = heightOf(nodes, i);
        let from: Pose;
        if (n.op === null) {
          from = { x: xAt((n.from + n.to) / 2) - TILE_W / 2, y: BENCH_TEXT_Y + 8, rot: 0 };
        } else {
          const own = holes.get(i);
          if (own === undefined) throw new Error(`type-mismatch 그림: 노드 ${i} 의 홈이 없다`);
          from = { x: own.cx - TILE_W / 2, y: own.y + TILE_H + HOLE_PAD * 2 + 2, rot: 0 };
        }
        let to: Pose = from;
        let stuck = false;
        if (n.parent !== null) {
          const p = nodes[n.parent];
          const ph = holes.get(n.parent);
          if (p === undefined || ph === undefined) throw new Error(`type-mismatch 그림: 노드 ${i} 의 부모가 없다`);
          if (p.state !== 'untried') {
            const right = p.r === i;
            to = { x: right ? ph.rx : ph.lx, y: ph.y, rot: 0 };
            stuck = p.state === 'snag' && right;
          }
        } else if (i === check.root) {
          to = { x: slotX, y: slotY, rot: 0 };
          stuck = check.outcome === 'slot-miss';
        }
        let hit: Pose | null = null;
        if (stuck) {
          hit = { x: to.x + STUCK_DX * 0.3, y: to.y + STUCK_DY * 0.3, rot: 0 };
          to = { x: to.x + STUCK_DX, y: to.y + STUCK_DY, rot: STUCK_ROT };
        }
        const g = tile(layer, n.type, to, stuck);
        if (to !== from) {
          moves.push({ g, from, to, hit, phase });
          phases = Math.max(phases, phase + 1);
        }
      });
      return { moves, phases };
    }

    function drawStatic(scene: TypeMismatchScene): Handles {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
      const step = scene.step;
      const n = scene.lines.length;
      if (n === 0) return { moves: [], phases: 0, bar: null };
      const lineH = Math.min(24, (LIST_BOTTOM - LIST_TOP) / n);
      const rowMid = (i: number): number => LIST_TOP + i * lineH + lineH / 2;
      const maxLen = Math.max(...scene.lines.map((l) => l.indent * 4 + l.text.length));
      const chipX = CODE_X + maxLen * CW + 16;
      const byLine = new Map<number, TmCheck>();
      for (const ck of scene.checks) byLine.set(ck.line, ck);
      const verdict = step.kind === 'verdict';

      // 지금 검사하는 줄의 띠
      if (step.kind === 'line') {
        el('rect', { x: BAR_X + 4, y: LIST_TOP + step.line * lineH, width: chipX + TILE_W + 8 - BAR_X - 4, height: lineH, rx: 3, fill: c.bgSubtle }, svg);
      }

      scene.lines.forEach((l, i) => {
        const y = rowMid(i);
        const base = y + CODE_PX * 0.36;
        const lx = CODE_X + l.indent * 4 * CW;
        el('text', { x: GUTTER_X, y: base, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, svg, String(i + 1));
        el('text', { x: lx, y: base, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: verdict && step.rejected ? c.textMuted : c.text }, svg, l.text);
        const ck = byLine.get(i);
        if (ck === undefined) return;
        const passed = ck.outcome === 'fit' || ck.outcome === 'widen';
        const chipH = Math.min(TILE_H, lineH - 4);
        if (passed && ck.got !== null) {
          el('rect', { x: chipX, y: y - chipH / 2, width: TILE_W, height: chipH, rx: 3, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, svg);
          el('text', { x: chipX + TILE_W / 2, y: y + TILE_PX * 0.36, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.stateInk }, svg, ck.got);
        } else {
          el('rect', { x: chipX, y: y - chipH / 2, width: TILE_W, height: chipH, rx: 3, fill: c.bg, stroke: c.danger, 'stroke-width': 2 }, svg);
          el('text', { x: chipX + TILE_W / 2, y: y + TILE_PX * 0.36, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.danger }, svg, t('label.stuck', 'stuck'));
          // 걸린 그 한 자리 — 줄 전체가 아니라 연산자(또는 선언한 타입) 밑에 금
          const snagNode = ck.nodes.find((nd) => nd.state === 'snag');
          if (snagNode !== undefined && snagNode.op !== null && snagNode.symFrom !== null) {
            zigzag(svg, lx + snagNode.symFrom * CW - 1, lx + (snagNode.symFrom + snagNode.op.length) * CW + 1, base + 4);
          } else {
            zigzag(svg, lx + ck.slot.from * CW, lx + ck.slot.to * CW, base + 4);
          }
        }
      });

      // 셈 — 검사한 줄 · 걸린 자리 · 실행한 줄
      const snags = scene.checks.filter((ck) => ck.outcome === 'snag' || ck.outcome === 'slot-miss').length;
      const statX = W - 16;
      el('text', { x: statX, y: LIST_TOP + 14, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, svg, t('label.checked', 'Checked: {n}', { n: scene.checks.length }));
      el('text', { x: statX, y: LIST_TOP + 34, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: snags > 0 ? c.danger : c.textMuted }, svg, t('label.snags', 'Snags: {n}', { n: snags }));
      el('text', { x: statX, y: LIST_TOP + 60, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text }, svg, t('label.run', 'Lines run: {n}', { n: scene.ran }));

      let bar: Handles['bar'] = null;
      if (verdict) {
        const first = scene.checks.find((ck) => ck.outcome === 'snag' || ck.outcome === 'slot-miss');
        if (step.rejected && first !== undefined) {
          const top = LIST_TOP + 2;
          const bottom = LIST_TOP + n * lineH - 2;
          const line = el('line', { x1: BAR_X, y1: top, x2: BAR_X, y2: bottom, stroke: c.danger, 'stroke-width': 4, 'stroke-linecap': 'butt' }, svg);
          bar = { line, mid: rowMid(first.line), top, bottom };
          el('text', { x: statX, y: LIST_TOP + 90, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.danger }, svg, t('label.rejected', 'Rejected'));
        } else {
          el('text', { x: statX, y: LIST_TOP + 90, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text }, svg, t('label.accepted', 'Accepted'));
        }
      }

      // 작업대와 캡션
      el('line', { x1: 16, y1: LIST_BOTTOM + 8, x2: W - 16, y2: LIST_BOTTOM + 8, stroke: c.border, 'stroke-width': 1 }, svg);
      let moves: Move[] = [];
      let phases = 0;
      const captions: string[] = [];
      if (step.kind === 'start') {
        captions.push(t('caption.start', 'The checker reads the whole program before any line runs.'));
      } else if (step.kind === 'line') {
        const ck = byLine.get(step.line);
        if (ck === undefined) throw new Error(`type-mismatch 그림: 줄 ${step.line + 1} 의 검사가 없다`);
        const bench = drawBench(scene, ck, false);
        moves = bench.moves;
        phases = bench.phases;
        captions.push(...lineCaptions(ck));
      } else {
        const first = scene.checks.find((ck) => ck.outcome === 'snag' || ck.outcome === 'slot-miss');
        if (first !== undefined) drawBench(scene, first, true);
        if (step.rejected) {
          captions.push(t('caption.rejected', 'Snags: {n}. The whole program is rejected before it runs.', { n: step.snags }));
          const passedAbove = first !== undefined && scene.checks.some((ck) => ck.line < first.line && (ck.outcome === 'fit' || ck.outcome === 'widen'));
          if (passedAbove) captions.push(t('caption.above', 'The lines above it passed the check, and still none of them runs.'));
        } else {
          captions.push(t('caption.accepted', 'Snags: {n}. The program passes the check and may now run.', { n: step.snags }));
        }
      }
      captions.forEach((s, i) => {
        el('text', { x: 24, y: H - 30 + i * 20 - (captions.length - 1) * 10, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, svg, s);
      });
      return { moves, phases, bar };
    }

    function lineCaptions(ck: TmCheck): string[] {
      const line = ck.line + 1;
      const slot = ck.slot;
      if (ck.outcome === 'snag') {
        const sn = ck.nodes.find((nd) => nd.state === 'snag');
        if (sn === undefined || sn.op === null || sn.l === null || sn.r === null) throw new Error(`type-mismatch 그림: 줄 ${line} 의 걸린 노드가 없다`);
        const left = ck.nodes[sn.l]?.type;
        const right = ck.nodes[sn.r]?.type;
        if (left == null || right == null) throw new Error(`type-mismatch 그림: 줄 ${line} 의 걸린 노드에 들어온 타입이 없다`);
        const out = [t('caption.snag', 'Line {line}: {op} has no rule for {left} and {right}. It sticks here.', { line, op: sn.op, left, right })];
        if (slot.kind === 'let') out.push(t('caption.untried', 'The slot of {name}, declared {declared}, is never tried.', { name: slot.name, declared: slot.declared }));
        return out;
      }
      if (ck.got === null) throw new Error(`type-mismatch 그림: 줄 ${line} 의 타입이 없다`);
      if (slot.kind === 'show') return [t('caption.show', 'Line {line}: show takes any type. {got} fits.', { line, got: ck.got })];
      const vars = { line, got: ck.got, name: slot.name, declared: slot.declared };
      if (ck.outcome === 'slot-miss') return [t('caption.slotMiss', 'Line {line}: {got} does not fit the slot of {name}, declared {declared}.', vars)];
      if (ck.outcome === 'widen') return [t('caption.widen', 'Line {line}: {got} widens into the slot of {name}, declared {declared}.', vars)];
      return [t('caption.fit', 'Line {line}: {got} goes into the slot of {name}, declared {declared}. It fits.', vars)];
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function poseAt(m: Move, p: number): Pose {
      if (m.hit === null) {
        const e = ease(p);
        return { x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e), rot: 0 };
      }
      // 걸림 — 홈 어귀까지 밀려 들어가다 부딪혀 비스듬히 튕겨 나온다
      const k = 0.68;
      if (p < k) {
        const e = ease(p / k);
        return { x: lerp(m.from.x, m.hit.x, e), y: lerp(m.from.y, m.hit.y, e), rot: 0 };
      }
      const e = ease((p - k) / (1 - k));
      return { x: lerp(m.hit.x, m.to.x, e), y: lerp(m.hit.y, m.to.y, e), rot: lerp(0, m.to.rot, e) };
    }

    return {
      async render(next: TypeMismatchScene, _prev: TypeMismatchScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'line' && h.moves.length > 0) {
          const per = MOVE_MS / h.phases;
          for (const m of h.moves) m.g.setAttribute('transform', poseAttr(m.from));
          await tween(MOVE_MS, mine, (p) => {
            const now = p * MOVE_MS;
            for (const m of h.moves) {
              const local = Math.max(0, Math.min(1, (now - m.phase * per) / per));
              m.g.setAttribute('transform', poseAttr(poseAt(m, local)));
            }
          });
        } else if (next.step.kind === 'verdict' && h.bar !== null) {
          const bar = h.bar;
          bar.line.setAttribute('y1', String(r1(bar.mid)));
          bar.line.setAttribute('y2', String(r1(bar.mid)));
          await tween(MOVE_MS, mine, (p) => {
            const e = ease(p);
            bar.line.setAttribute('y1', String(r1(lerp(bar.mid, bar.top, e))));
            bar.line.setAttribute('y2', String(r1(lerp(bar.mid, bar.bottom, e))));
          });
        } else {
          return;
        }
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
