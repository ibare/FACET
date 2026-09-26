/**
 * type-checking 무대 — 왼쪽에 원시 프로그램 일곱 줄, 오른쪽에 줄마다 식 나무 한 기둥.
 *
 * 움직이는 것:
 *   - 타입 글자(칩)가 잎에서 연산 마디로, 연산 마디에서 이름 자리로 **타고 오른다**
 *   - 규칙표에 없는 짝에서 오름이 멈추고 걸림 틀이 그 마디로 **미끄러져 온다** — 앞 회차의 걸린
 *     자리는 걸음 0 에 점선 자국으로 남고, 이번 회차의 k 번째 걸림 틀은 앞 회차 k 번째 자국에서 출발한다
 *   - 지금 읽는 줄의 띠가 목록을 따라 내려간다
 *
 * 무대는 셈하지 않는다 — 타입 · 결과 · 걸린 자리 · 표지는 모두 payload 로 받는다.
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
import type { TcLineView, TcNodeView, TcSettleMode } from './algorithm.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 900;
const H = 356;

// 목록
const LIST_X = 14;
const LIST_CODE_X = 44;
const LIST_Y0 = 70;
const LIST_DY = 28;
const LIST_W = 250;

// 기둥
const COL_X0 = 290;
const COL_W = 86;
const COL_LABEL_Y = 54;
const NAME_Y = 78;
const SLOT_Y = 101; // 자리 칸의 가운데
const SLOT_W = 54;
const SLOT_H = 22;
const BELOW_SLOT_Y = 131; // 선언한 자리 아래 — 끼워 볼 칩이 서는 곳
const OP_Y = 168;
const OP_R = 13;
const LEAF_Y = 226;
const LEAF_DX = 24;
const CHIP_BELOW = 26; // 마디 가운데에서 칩 가운데까지
const MARK_Y = 292;
const VERDICT_Y = 320;
const CAPTION_Y = 344;

const CHAR_PX = parseFloat(fontSizes.xs) * 0.62;
const CODE_CHAR_PX = parseFloat(fontSizes.sm) * 0.62;

export type TcRoundView = {
  ruleId: string;
  opCells: number;
  opAll: number;
  fitCells: number;
  fitAll: number;
  lines: TcLineView[];
};

export type TcTypeText = { type: string; typed: boolean };

export type TcRiseView = {
  line: number;
  lineNo: number;
  expr: string;
  outcome: 'rise' | 'op-miss' | 'unknown';
  leaves: ({ node: number } & TcTypeText)[];
  ops: ({ node: number; op: string; l: string; r: string; result: string; outcome: string } & TcTypeText)[];
  missNode: number;
};

export type TcSettleView = {
  line: number;
  lineNo: number;
  mode: TcSettleMode;
  expr: string;
  name: string;
  type: string;
  typed: boolean;
  want: string | null;
  mark: 0 | 1 | 2 | 3;
  leaf: ({ node: number } & TcTypeText) | null;
};

export type TcVerdictView = {
  errors: number;
  rejected: boolean;
  where: number[];
  byRule: { ruleId: string; errors: number; rejected: boolean }[];
};

export type TypeCheckingStage = {
  /** 되감기 — 결론 · 자국 · 운동을 모두 걷는다 */
  reset(): void;
  startRound(v: TcRoundView, dur: number): void;
  rise(v: TcRiseView, dur: number): void;
  settle(v: TcSettleView, dur: number): void;
  verdict(v: TcVerdictView, dur: number): void;
};

type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
};

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export const typeCheckingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    const isInstant = params.isInstant ?? (() => false);
    let destroyed = false;

    // ── 애니메이션 — 걸어 둔 것을 되짚기 · 정리 때 끝 상태로 마무리한다
    const frames = new Set<number>();
    const finishers = new Set<() => void>();
    const tween = (dur: number, draw: (k: number) => void): void => {
      if (isInstant() || dur <= 0) {
        draw(1);
        return;
      }
      const start = performance.now();
      const finish = (): void => {
        finishers.delete(finish);
        draw(1);
      };
      finishers.add(finish);
      const frame = (now: number): void => {
        if (destroyed || !finishers.has(finish)) return;
        const k = Math.min(1, (now - start) / dur);
        if (k >= 1) {
          finish();
          return;
        }
        draw(ease(k));
        const id = requestAnimationFrame(frame);
        frames.add(id);
      };
      frames.add(requestAnimationFrame(frame));
    };
    const settleAll = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const f of [...finishers]) f();
      finishers.clear();
    };
    params.onScrubStart?.(settleAll);

    // ── 층
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
    const headLeft = el('text', {
      x: LIST_X, y: 26, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600,
    }, svg);
    const headRight = el('text', {
      x: W - 14, y: 26, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'text-anchor': 'end',
    }, svg);
    // 글자 요약에서 먼저 읽히도록 캡션 · 판정을 앞에 둔다 (자리는 좌표가 정한다)
    const verdictText = el('text', {
      x: W / 2, y: VERDICT_Y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      'font-weight': 600, 'text-anchor': 'middle',
    }, svg);
    const caption = el('text', {
      x: W / 2, y: CAPTION_Y, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm,
      'text-anchor': 'middle',
    }, svg);

    el('line', { x1: COL_X0 - 14, y1: 40, x2: COL_X0 - 14, y2: MARK_Y + 6, stroke: c.border }, svg);
    const listBand = el('rect', {
      x: LIST_X - 6, y: LIST_Y0 - 17, width: LIST_W, height: 24, rx: 4, fill: c.bgSubtle, opacity: 0,
    }, svg);
    const colBand = el('rect', {
      x: COL_X0, y: 40, width: COL_W, height: MARK_Y - 30, rx: 6, fill: c.bgSubtle, opacity: 0,
    }, svg);
    const listLayer = el('g', {}, svg);
    const treeLayer = el('g', {}, svg);
    const ghostLayer = el('g', {}, svg);
    const chipLayer = el('g', {}, svg);
    const missLayer = el('g', {}, svg);
    // ── 회차의 상태
    let lines: TcLineView[] = [];
    let treeGroups: SVGGElement[] = [];
    let slotBoxes: SVGRectElement[] = [];
    let opCircles = new Map<string, SVGCircleElement>();
    let markTexts: SVGTextElement[] = [];
    /** 줄마다 지금 떠 있는 칩 (마디 번호 또는 'root' → 칩) */
    let chips = new Map<string, SVGGElement>();
    let misses: SVGRectElement[] = [];
    let missBoxes: Box[] = [];
    let lastMissBoxes: Box[] = [];

    const colX = (line: number): number => COL_X0 + COL_W * line + COL_W / 2;
    const lineAt = (i: number): TcLineView => {
      const ln = lines[i];
      if (ln === undefined) throw new Error(`줄 ${i} 가 이 회차에 없다`);
      return ln;
    };
    const nodeAt = (line: number, node: number): TcNodeView => {
      const nd = lineAt(line).nodes[node];
      if (nd === undefined) throw new Error(`줄 ${line} 에 마디 ${node} 가 없다`);
      return nd;
    };
    /** 마디의 가운데 — 뿌리가 연산이면 연산 줄, 잎은 잎 줄. 깊이 1 까지 그린다 */
    const nodePos = (line: number, node: number): Pt => {
      const nd = nodeAt(line, node);
      const cx = colX(line);
      if (nd.parent < 0) return nd.kind === 'op' ? { x: cx, y: OP_Y } : { x: cx, y: LEAF_Y };
      const parent = nodeAt(line, nd.parent);
      if (parent.parent >= 0) throw new Error('이 무대는 깊이 1 까지의 나무만 그린다');
      return { x: cx + (nd.side === 'left' ? -LEAF_DX : LEAF_DX), y: LEAF_Y };
    };
    const chipPos = (line: number, node: number): Pt => {
      const p = nodePos(line, node);
      return { x: p.x, y: p.y + CHIP_BELOW };
    };

    const makeChip = (text: string, typed: boolean, at: Pt): SVGGElement => {
      const g = el('g', { transform: `translate(${at.x},${at.y})` }, chipLayer);
      const w = text.length * CHAR_PX + 12;
      el('rect', {
        x: -w / 2, y: -8, width: w, height: 16, rx: 8,
        fill: typed ? c.primary : c.bg,
        stroke: typed ? c.primary : c.textMuted,
        'stroke-dasharray': typed ? 'none' : '3 2',
      }, g);
      const tx = el('text', {
        x: 0, y: 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        fill: typed ? c.textInverse : c.textMuted,
      }, g);
      tx.textContent = text;
      return g;
    };
    const chipAt = (g: SVGGElement): Pt => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
      if (!m) throw new Error('칩의 자리를 읽지 못했다');
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const moveChip = (g: SVGGElement, to: Pt, dur: number, done?: () => void): void => {
      const from = chipAt(g);
      tween(dur, (k) => {
        g.setAttribute('transform', `translate(${from.x + (to.x - from.x) * k},${from.y + (to.y - from.y) * k})`);
        if (k >= 1) done?.();
      });
    };
    const flagChip = (g: SVGGElement, color: string): void => {
      const r = g.querySelector('rect');
      if (!r) throw new Error('칩의 틀이 없다');
      r.setAttribute('stroke', color);
      r.setAttribute('stroke-width', '2');
    };
    const dropChip = (key: string): void => {
      const g = chips.get(key);
      if (g) g.remove();
      chips.delete(key);
    };

    const opBox = (line: number, node: number): Box => {
      const p = nodePos(line, node);
      return { x: p.x - 38, y: p.y - 20, w: 76, h: 56 };
    };
    const slotMissBox = (line: number): Box => {
      const cx = colX(line);
      return { x: cx - 38, y: SLOT_Y - 17, w: 76, h: BELOW_SLOT_Y - SLOT_Y + 29 };
    };
    const setBox = (r: SVGRectElement, b: Box): void => {
      r.setAttribute('x', String(b.x));
      r.setAttribute('y', String(b.y));
      r.setAttribute('width', String(b.w));
      r.setAttribute('height', String(b.h));
    };
    /** 이번 회차의 걸림 틀 하나 — 앞 회차 같은 차례의 자국(없으면 바로 앞 틀 · 위)에서 미끄러져 온다 */
    const placeMiss = (target: Box, dur: number): void => {
      const k = misses.length;
      const from =
        lastMissBoxes[k] ??
        missBoxes[k - 1] ??
        { x: target.x, y: target.y - 40, w: target.w, h: target.h };
      const r = el('rect', { rx: 8, fill: 'none', stroke: c.danger, 'stroke-width': 2.5 }, missLayer);
      setBox(r, from);
      misses.push(r);
      missBoxes.push(target);
      tween(dur, (q) => {
        setBox(r, {
          x: from.x + (target.x - from.x) * q,
          y: from.y + (target.y - from.y) * q,
          w: from.w + (target.w - from.w) * q,
          h: from.h + (target.h - from.h) * q,
        });
      });
    };

    const moveBands = (line: number, dur: number): void => {
      const fromList = Number(listBand.getAttribute('y'));
      const toList = LIST_Y0 + LIST_DY * line - 17;
      const fromCol = Number(colBand.getAttribute('x'));
      const toCol = COL_X0 + COL_W * line;
      const firstShow = listBand.getAttribute('opacity') === '0';
      listBand.setAttribute('opacity', '1');
      colBand.setAttribute('opacity', '1');
      if (firstShow) {
        listBand.setAttribute('y', String(toList));
        colBand.setAttribute('x', String(toCol));
        return;
      }
      tween(dur, (k) => {
        listBand.setAttribute('y', String(fromList + (toList - fromList) * k));
        colBand.setAttribute('x', String(fromCol + (toCol - fromCol) * k));
      });
    };

    const ruleName = (id: string): string => {
      if (id === 'strict') return t('label.rule.strict', 'Strict');
      if (id === 'widen') return t('label.rule.widen', 'Widening');
      if (id === 'loose') return t('label.rule.loose', 'Loose');
      throw new Error(`모르는 규칙 ${id}`);
    };
    const markText = (mark: 0 | 1 | 2 | 3): { text: string; color: string } => {
      if (mark === 0) return { text: t('label.mark.ok', 'OK'), color: c.text };
      if (mark === 1) return { text: t('label.mark.opMiss', 'Operator error'), color: c.danger };
      if (mark === 2) return { text: t('label.mark.declMiss', 'Slot error'), color: c.danger };
      return { text: t('label.mark.untyped', 'No type'), color: c.textMuted };
    };

    const buildColumns = (): void => {
      listLayer.replaceChildren();
      treeLayer.replaceChildren();
      treeGroups = [];
      slotBoxes = [];
      opCircles = new Map();
      markTexts = [];
      for (const [i, ln] of lines.entries()) {
        // 목록
        const y = LIST_Y0 + LIST_DY * i;
        const lab = el('text', {
          x: LIST_X, y, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        }, listLayer);
        lab.textContent = t('label.line', 'L{n}', { n: ln.lineNo });
        const code = el('text', {
          x: LIST_CODE_X, y, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
        }, listLayer);
        code.textContent = ln.text;
        if (ln.text.length * CODE_CHAR_PX + LIST_CODE_X > COL_X0 - 20) {
          throw new Error(`줄 ${ln.lineNo} 가 목록 폭을 넘는다`);
        }

        // 기둥
        const cx = colX(i);
        const g = el('g', {}, treeLayer);
        treeGroups.push(g);
        const cl = el('text', {
          x: cx, y: COL_LABEL_Y, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        }, g);
        cl.textContent = t('label.line', 'L{n}', { n: ln.lineNo });
        const nm = el('text', {
          x: cx, y: NAME_Y, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          'text-anchor': 'middle', 'font-weight': 600,
        }, g);
        nm.textContent = ln.name;
        const slot = el('rect', {
          x: cx - SLOT_W / 2, y: SLOT_Y - SLOT_H / 2, width: SLOT_W, height: SLOT_H, rx: 4,
          fill: 'none', stroke: ln.want === null ? c.textMuted : c.text,
          'stroke-dasharray': ln.want === null ? '4 3' : 'none', 'stroke-width': ln.want === null ? 1 : 1.5,
        }, g);
        slotBoxes.push(slot);
        if (ln.want !== null) {
          const wt = el('text', {
            x: cx, y: SLOT_Y + 4, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
            'text-anchor': 'middle',
          }, g);
          wt.textContent = ln.want;
        }
        // 마디
        const root = ln.nodes[0];
        if (root === undefined) throw new Error(`줄 ${ln.lineNo} 에 식이 없다`);
        const rootPos = nodePos(i, 0);
        el('line', {
          x1: cx, y1: SLOT_Y + SLOT_H / 2, x2: rootPos.x, y2: rootPos.y - (root.kind === 'op' ? OP_R : 11),
          stroke: c.border, 'stroke-dasharray': '2 3',
        }, g);
        for (const nd of ln.nodes) {
          const p = nodePos(i, nd.id);
          if (nd.parent >= 0) {
            const pp = nodePos(i, nd.parent);
            el('line', { x1: pp.x, y1: pp.y + OP_R, x2: p.x, y2: p.y - 11, stroke: c.border }, g);
          }
          if (nd.kind === 'op') {
            const circ = el('circle', {
              cx: p.x, cy: p.y, r: OP_R, fill: c.bg, stroke: c.text, 'stroke-width': 1.5,
            }, g);
            opCircles.set(`${i}:${nd.id}`, circ);
            const ot = el('text', {
              x: p.x, y: p.y + 5, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md,
              'text-anchor': 'middle',
            }, g);
            ot.textContent = nd.text;
          } else {
            const w = nd.text.length * CODE_CHAR_PX + 12;
            el('rect', {
              x: p.x - w / 2, y: p.y - 11, width: w, height: 22, rx: 4, fill: c.bg, stroke: c.border,
            }, g);
            const lt = el('text', {
              x: p.x, y: p.y + 4, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
              'text-anchor': 'middle',
            }, g);
            lt.textContent = nd.text;
          }
        }
        const mk = el('text', {
          x: cx, y: MARK_Y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        }, g);
        markTexts.push(mk);
      }
    };

    const setMark = (line: number, mark: 0 | 1 | 2 | 3): void => {
      const mk = markTexts[line];
      if (!mk) throw new Error(`줄 ${line} 의 표지 자리가 없다`);
      const m = markText(mark);
      mk.textContent = m.text;
      mk.setAttribute('fill', m.color);
    };
    const fade = (line: number): void => {
      const g = treeGroups[line];
      if (!g) throw new Error(`줄 ${line} 의 기둥이 없다`);
      g.setAttribute('opacity', '0.45');
    };

    const stage: TypeCheckingStage = {
      reset() {
        settleAll();
        missBoxes = [];
        lastMissBoxes = [];
        misses = [];
        missLayer.replaceChildren();
        ghostLayer.replaceChildren();
        chipLayer.replaceChildren();
        chips = new Map();
        verdictText.textContent = '';
        caption.textContent = '';
        for (const mk of markTexts) mk.textContent = '';
        for (const g of treeGroups) g.setAttribute('opacity', '1');
        for (const circ of opCircles.values()) circ.setAttribute('stroke', c.text);
        for (const [i, sl] of slotBoxes.entries()) {
          sl.setAttribute('stroke', lineAt(i).want === null ? c.textMuted : c.text);
          sl.setAttribute('stroke-width', lineAt(i).want === null ? '1' : '1.5');
        }
        listBand.setAttribute('opacity', '0');
        colBand.setAttribute('opacity', '0');
      },

      startRound(v, dur) {
        settleAll();
        // 결론을 걷는다 — 칩 · 걸림 틀 · 판정 · 표지. 자리(점선 자국)만 남긴다
        lastMissBoxes = missBoxes;
        missBoxes = [];
        misses = [];
        missLayer.replaceChildren();
        chipLayer.replaceChildren();
        chips = new Map();
        ghostLayer.replaceChildren();
        for (const b of lastMissBoxes) {
          const r = el('rect', {
            rx: 8, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '5 4', 'stroke-width': 1.5,
          }, ghostLayer);
          setBox(r, b);
        }
        const sameShape = lines.length === v.lines.length && lines.every((ln, i) => ln.text === v.lines[i]?.text);
        lines = v.lines;
        if (!sameShape) buildColumns();
        for (const g of treeGroups) g.setAttribute('opacity', '1');
        for (const circ of opCircles.values()) circ.setAttribute('stroke', c.text);
        for (const [i, s] of slotBoxes.entries()) {
          s.setAttribute('stroke', lineAt(i).want === null ? c.textMuted : c.text);
          s.setAttribute('stroke-width', lineAt(i).want === null ? '1' : '1.5');
        }
        for (const mk of markTexts) mk.textContent = '';
        listBand.setAttribute('opacity', '0');
        colBand.setAttribute('opacity', '0');
        verdictText.textContent = '';
        headLeft.textContent = t('label.ruleNow', 'Type rules: {rule}', { rule: ruleName(v.ruleId) });
        headRight.textContent = t(
          'label.cells',
          'Operator pairs with a rule {op} / {opAll} · slot fits {fit} / {fitAll}',
          { op: v.opCells, opAll: v.opAll, fit: v.fitCells, fitAll: v.fitAll },
        );
        caption.textContent = t('caption.start', 'Seven lines, no types yet. The checker reads top to bottom once.');
        void dur;
      },

      rise(v, dur) {
        moveBands(v.line, dur);
        // 잎의 타입이 먼저 뜬다
        for (const lf of v.leaves) {
          dropChip(`${v.line}:${lf.node}`);
          chips.set(`${v.line}:${lf.node}`, makeChip(lf.type, lf.typed, chipPos(v.line, lf.node)));
        }
        // 뒤차례로 — 두 칩이 연산 마디로 오른다
        for (const o of v.ops) {
          const nd = nodeAt(v.line, o.node);
          const kids = lineAt(v.line).nodes.filter((k) => k.parent === nd.id);
          const target = chipPos(v.line, o.node);
          const kidChips = kids.map((k) => {
            const g = chips.get(`${v.line}:${k.id}`);
            if (!g) throw new Error(`줄 ${v.lineNo} 마디 ${k.id} 의 칩이 없다`);
            return { k, g };
          });
          if (o.outcome === 'op-miss') {
            // 오름이 여기서 멈춘다 — 두 칩이 마디 아래 나란히 서고 틀이 온다
            for (const { k, g } of kidChips) {
              const dx = k.side === 'left' ? -20 : 20;
              flagChip(g, c.danger);
              moveChip(g, { x: target.x + dx, y: target.y + 4 }, dur);
            }
            const circ = opCircles.get(`${v.line}:${o.node}`);
            if (!circ) throw new Error('연산 마디가 없다');
            circ.setAttribute('stroke', c.danger);
            placeMiss(opBox(v.line, o.node), dur);
          } else {
            let left = kidChips.length;
            for (const { k, g } of kidChips) {
              moveChip(g, target, dur, () => {
                g.remove();
                chips.delete(`${v.line}:${k.id}`);
                left -= 1;
                if (left === 0) {
                  chips.set(`${v.line}:${o.node}`, makeChip(o.result, o.typed, target));
                }
              });
            }
          }
        }
        if (v.outcome === 'unknown') fade(v.line);
        if (v.outcome === 'rise') {
          const o = v.ops[v.ops.length - 1];
          if (!o) throw new Error('오름이 없다');
          caption.textContent = t('caption.rise', '{line}: {l} {op} {r} → {type} climbs to the root', {
            line: t('label.line', 'L{n}', { n: v.lineNo }), l: o.l, op: o.op, r: o.r, type: o.result,
          });
        } else if (v.outcome === 'op-miss') {
          const o = v.ops.find((x) => x.node === v.missNode);
          if (!o) throw new Error('걸린 마디의 오름이 없다');
          caption.textContent = t('caption.opMiss', '{line}: no rule for {l} {op} {r} — the climb stops here', {
            line: t('label.line', 'L{n}', { n: v.lineNo }), l: o.l, op: o.op, r: o.r,
          });
        } else {
          caption.textContent = t(
            'caption.unknown',
            '{line}: {expr} reads a name without a type — the climb gets ?, not counted',
            { line: t('label.line', 'L{n}', { n: v.lineNo }), expr: v.expr },
          );
        }
      },

      settle(v, dur) {
        moveBands(v.line, dur);
        const line = t('label.line', 'L{n}', { n: v.lineNo });
        const cx = colX(v.line);
        // 오를 칩 — 잎 하나인 줄은 잎에서 새로 뜨고, 연산 줄은 뿌리의 칩
        let chip: SVGGElement | undefined;
        if (v.leaf !== null) {
          dropChip(`${v.line}:${v.leaf.node}`);
          chip = makeChip(v.leaf.type, v.leaf.typed, chipPos(v.line, v.leaf.node));
          chips.set(`${v.line}:${v.leaf.node}`, chip);
        } else {
          chip = chips.get(`${v.line}:0`);
          if (!chip && v.mode === 'bind' && !v.typed) {
            // 뿌리에서 오름이 멈췄다 — 이름에 오르는 것은 타입 없음
            chip = makeChip(v.type, false, chipPos(v.line, 0));
            chips.set(`${v.line}:0`, chip);
          }
        }
        const slot = slotBoxes[v.line];
        if (!slot) throw new Error(`줄 ${v.lineNo} 의 자리가 없다`);
        if (v.mode === 'bind') {
          if (!chip) throw new Error(`줄 ${v.lineNo} 에 이름에 붙일 칩이 없다`);
          moveChip(chip, { x: cx, y: SLOT_Y }, dur);
          if (!v.typed) {
            caption.textContent = t('caption.bindUntyped', '{line}: {name} ← ? — the name is left without a type', {
              line, name: v.name,
            });
          } else {
            caption.textContent = t('caption.bind', '{line}: {expr} is {type} · {name} ← {type}', {
              line, expr: v.expr, type: v.type, name: v.name,
            });
          }
        } else if (v.mode === 'decl-take') {
          // 식의 타입이 없다 — 끼워 보지 않고 선언한 타입이 이름에 든다
          slot.setAttribute('stroke', c.accent);
          slot.setAttribute('stroke-width', '3');
          if (v.want === null) throw new Error('선언한 타입이 없다');
          caption.textContent = t(
            'caption.declTake',
            '{line}: {name} ← declared {want} — the expression has no type, nothing to fit',
            { line, name: v.name, want: v.want },
          );
        } else {
          if (!chip) throw new Error(`줄 ${v.lineNo} 에 끼워 볼 칩이 없다`);
          if (v.want === null) throw new Error('선언한 타입이 없다');
          moveChip(chip, { x: cx, y: BELOW_SLOT_Y }, dur);
          if (v.mode === 'decl-fit') {
            slot.setAttribute('stroke-width', '3');
            caption.textContent = t('caption.declFit', '{line}: {expr} {type} → slot {want} fits', {
              line, expr: v.expr, type: v.type, want: v.want,
            });
          } else {
            flagChip(chip, c.danger);
            slot.setAttribute('stroke', c.danger);
            placeMiss(slotMissBox(v.line), dur);
            caption.textContent = t('caption.declMiss', '{line}: {expr} {type} → slot {want} does not fit', {
              line, expr: v.expr, type: v.type, want: v.want,
            });
          }
        }
        setMark(v.line, v.mark);
      },

      verdict(v, dur) {
        listBand.setAttribute('opacity', '0');
        colBand.setAttribute('opacity', '0');
        const result = v.rejected ? t('label.verdict.reject', 'rejected') : t('label.verdict.accept', 'accepted');
        const where = v.where.map((n) => t('label.line', 'L{n}', { n })).join(' · ');
        verdictText.textContent = t('label.verdict', 'Error sites: {n} ({where}) — program {result}', {
          n: v.errors, where, result,
        });
        verdictText.setAttribute('fill', v.rejected ? c.danger : c.text);
        const all = v.byRule
          .map((b) =>
            t('label.ruleResult', '{rule}: {n} error sites, {result}', {
              rule: ruleName(b.ruleId),
              n: b.errors,
              result: b.rejected ? t('label.verdict.reject', 'rejected') : t('label.verdict.accept', 'accepted'),
            }),
          )
          .join(' / ');
        caption.textContent = t('caption.verdict', 'By rule set — {all}', { all });
        void dur;
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        finishers.clear();
        svg.replaceChildren();
      },
    };
  },
};
