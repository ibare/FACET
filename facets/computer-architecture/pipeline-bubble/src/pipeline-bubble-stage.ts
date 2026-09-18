/**
 * 파이프라인 거품 stage.
 *
 * 세 줄이 위에서 아래로 선다 — 가져오기를 기다리는 줄, 다섯 단계, WB 를 떠난 줄.
 * 사이클마다 명령어가 오른쪽으로 한 칸 흐른다. 멈춘 사이클에는 ID 에서 빈 칸이 밀려 나와
 * EX 로 들어가고, 그 뒤로는 명령어처럼 한 칸씩 흘러 WB 를 지나 떠난 줄에 구멍으로 남는다.
 * 떠난 줄은 WB 바로 아래가 가장 최근 사이클이며, 한 사이클마다 왼쪽으로 한 칸 밀린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { outIndex, type Caption, type Place, type PipelineBubbleScene, type PipelineInstrView } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const PAD_X = 20;
const GAP = 8;
const COLS = 5;
const COL_W = (W - PAD_X * 2 - GAP * (COLS - 1)) / COLS;
const TOK_W = Math.min(104, COL_W - 8);
const TOK_H = 44;

const TOP_LABEL_Y = 16;
const QUEUE_Y = 26;
const STAGE_LABEL_Y = 100;
const SLOT_Y = 106;
const SLOT_H = TOK_H + 8;
const HELD_Y = SLOT_Y + SLOT_H + 16;
const OUT_LABEL_Y = 196;
const OUT_Y = 204;
const CAPTION_Y = 290;
const CAPTION_LH = 18;

const MOTION_MS = 520;
const FRAME_MS = 16;
const BUMP = 7;
/** 고정폭 글꼴 한 글자의 폭 (em) 어림 */
const MONO_EM = 0.62;

const SVG_NS = 'http://www.w3.org/2000/svg';

const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
};

const colX = (k: number): number => PAD_X + k * (COL_W + GAP);

/** 논리 자리 → 토큰 왼쪽 위. */
function placeXY(p: Place): { x: number; y: number } {
  const x = colX(p.idx) + (COL_W - TOK_W) / 2;
  if (p.row === 'queue') return { x, y: QUEUE_Y };
  if (p.row === 'pipe') return { x, y: SLOT_Y + (SLOT_H - TOK_H) / 2 };
  return { x, y: OUT_Y };
}

function asm(ins: PipelineInstrView): string {
  if (ins.op === 'lw') return `${ins.op} ${ins.rd}, ${ins.imm ?? 0}(${ins.rs[0] ?? ''})`;
  return `${ins.op} ${ins.rd}, ${ins.rs.join(', ')}`;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r1(v) : v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  s: string,
  x: number,
  y: number,
  fill: string,
  opts: { size?: string; anchor?: string; weight?: string; family?: string; italic?: boolean } = {},
): SVGTextElement {
  const node = el(
    'text',
    {
      x,
      y,
      fill,
      'font-family': opts.family ?? fonts.body,
      'font-size': opts.size ?? fontSizes.sm,
      'text-anchor': opts.anchor ?? 'start',
      ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      ...(opts.italic ? { 'font-style': 'italic' } : {}),
    },
    parent,
  );
  node.textContent = s;
  return node;
}

/** 글자 폭을 어림해 줄을 나눈다. 띄어쓰기가 없는 글은 글자 단위로 끊는다. */
function wrap(text: string, maxW: number, px: number): string[] {
  const width = (s: string): number => {
    let w = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0) ?? 0;
      w += c >= 0x1100 && !(c >= 0x0900 && c <= 0x097f) ? px : px * 0.52;
    }
    return w;
  };
  const pieces: string[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (part === '') continue;
    if (width(part) > maxW * 0.5) pieces.push(...Array.from(part));
    else pieces.push(part);
  }
  const lines: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    const tryLine = cur + piece;
    if (cur !== '' && width(tryLine.trimEnd()) > maxW) {
      lines.push(cur.trimEnd());
      cur = /^\s+$/.test(piece) ? '' : piece;
    } else {
      cur = tryLine;
    }
  }
  if (cur.trim() !== '') lines.push(cur.trimEnd());
  return lines;
}

function captionText(t: Translate, c: Caption): string {
  const ins = (i: number): string => t('label.instr', 'I{n}', { n: i + 1 });
  switch (c.kind) {
    case 'ready':
      return t('caption.ready', 'Instructions waiting to be fetched: {n}.', { n: c.n });
    case 'flow':
      return t('caption.flow', 'Cycle {c}: everything moves one stage to the right.', { c: c.c });
    case 'stall':
      if (c.behind) {
        return t(
          'caption.stall',
          'Cycle {c}: {prod} is still loading {reg} in MEM, and {cons} needs it in EX now. {cons} stays in ID, the one behind it stays in IF, and an empty slot goes into EX instead.',
          { c: c.c, prod: ins(c.prod), cons: ins(c.cons), reg: c.reg },
        );
      }
      return t(
        'caption.stallAlone',
        'Cycle {c}: {prod} is still loading {reg} in MEM, and {cons} needs it in EX now. {cons} stays in ID, and an empty slot goes into EX instead.',
        { c: c.c, prod: ins(c.prod), cons: ins(c.cons), reg: c.reg },
      );
    case 'forward':
      if (c.value !== null && c.result !== null) {
        return t(
          'caption.forward',
          'Cycle {c}: {reg} = {value} is forwarded from MEM/WB to EX, and {cons} computes {rd} = {result}. The empty slot moves on to MEM.',
          { c: c.c, reg: c.reg, value: c.value, cons: ins(c.cons), rd: c.rd, result: c.result },
        );
      }
      return t(
        'caption.forwardPlain',
        'Cycle {c}: {reg} is forwarded from MEM/WB to EX for {cons}. The empty slot moves on to MEM.',
        { c: c.c, reg: c.reg, cons: ins(c.cons) },
      );
    case 'bubbleWb':
      return t('caption.bubbleWb', 'Cycle {c}: the empty slot reaches WB. Nothing is written back in this cycle.', {
        c: c.c,
      });
    case 'bubbleOut':
      return t(
        'caption.bubbleOut',
        'Cycle {c}: the empty slot has left. What came out of WB now has a hole at cycle {gap}.',
        { c: c.c, gap: c.gap },
      );
    case 'done':
      if (c.lost === 0) {
        return t('caption.doneNoStall', 'All {n} instructions are finished at cycle {end}, with no stalls.', {
          n: c.n,
          end: c.end,
        });
      }
      return t(
        'caption.done',
        'All {n} instructions are finished at cycle {end}. Cycles lost to stalls: {lost}. Without them they would have finished at cycle {ideal}.',
        { n: c.n, end: c.end, lost: c.lost, ideal: c.ideal },
      );
  }
}

type NodeRef = { g: SVGGElement; x: number; y: number };

function narrow(data: Record<string, unknown> | undefined): void {
  // 자료는 장면의 init 이벤트로 온다 — stage 가 initialData 에서 읽는 것은 없다.
  // 좁혀 두는 것은 잘못 꽂힌 facet 을 일찍 드러내기 위해서다.
  if (data !== undefined && data['type'] !== 'pipeline-bubble') {
    throw new Error(`pipeline-bubble-stage: initialData.type 이 'pipeline-bubble' 이 아니다`);
  }
}

export const pipelineBubbleStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PipelineBubbleScene> {
    narrow(params.initialData);
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let nodes = new Map<string, NodeRef>();
    let arc: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number } | null = null;

    function drawToken(layer: Element, s: PipelineBubbleScene, who: string, p: Place, held: boolean): NodeRef {
      const { x, y } = placeXY(p);
      const g = el('g', { transform: `translate(${r1(x)},${r1(y)})` }, layer);
      if (who.startsWith('b')) {
        el(
          'rect',
          {
            x: 0,
            y: 0,
            width: TOK_W,
            height: TOK_H,
            rx: 6,
            fill: colors.itemActive,
            'fill-opacity': '0.12',
            stroke: colors.itemActive,
            'stroke-width': 1.6,
            'stroke-dasharray': '5 4',
          },
          g,
        );
        label(g, t('label.bubble', 'bubble'), TOK_W / 2, TOK_H / 2 + 4, colors.text, {
          anchor: 'middle',
          italic: true,
        });
      } else {
        const i = Number(who.slice(1));
        const ins = s.instrs[i];
        const hue = categorical(Math.max(1, s.instrs.length))[i] ?? colors.primary;
        el(
          'rect',
          {
            x: 0,
            y: 0,
            width: TOK_W,
            height: TOK_H,
            rx: 6,
            fill: colors.bg,
            stroke: held ? colors.itemActive : colors.border,
            'stroke-width': held ? 2 : 1,
          },
          g,
        );
        el('rect', { x: 0, y: 0, width: 5, height: TOK_H, rx: 2, fill: hue }, g);
        label(g, t('label.instr', 'I{n}', { n: i + 1 }), TOK_W / 2 + 2, 17, colors.text, {
          anchor: 'middle',
          weight: '600',
        });
        if (ins) {
          const text = asm(ins);
          const node = label(g, text, TOK_W / 2 + 2, 34, colors.textMuted, {
            anchor: 'middle',
            family: fonts.mono,
            size: fontSizes.xs,
          });
          // 고정폭 글꼴의 어림 폭이 토큰을 넘으면 그 폭에 맞춰 조인다
          const room = TOK_W - 14;
          if (text.length * MONO_EM * parseFloat(fontSizes.xs) > room) {
            node.setAttribute('textLength', String(r1(room)));
            node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
          }
        }
      }
      return { g, x, y };
    }

    function drawStatic(s: PipelineBubbleScene): void {
      svg.textContent = '';
      nodes = new Map();
      arc = null;
      const frame = el('g', {}, svg);
      const bubbles = el('g', {}, svg);
      const instrs = el('g', {}, svg);
      const over = el('g', {}, svg);

      if (s.queue.length > 0) {
        label(frame, t('label.waiting', 'waiting to be fetched'), PAD_X, TOP_LABEL_Y, colors.textMuted, {
          size: fontSizes.xs,
        });
      }
      if (s.tick > 0) {
        const c = s.caption?.kind === 'done' ? s.caption.end : s.tick;
        label(frame, t('label.cycle', 'cycle {c}', { c }), W - PAD_X, TOP_LABEL_Y, colors.text, {
          anchor: 'end',
          weight: '600',
        });
      }

      const stageNames = [t('stage.if', 'IF'), t('stage.id', 'ID'), t('stage.ex', 'EX'), t('stage.mem', 'MEM'), t('stage.wb', 'WB')];
      stageNames.forEach((name, k) => {
        el(
          'rect',
          { x: colX(k), y: SLOT_Y, width: COL_W, height: SLOT_H, rx: 8, fill: colors.bgSubtle, stroke: colors.border },
          frame,
        );
        label(frame, name, colX(k) + COL_W / 2, STAGE_LABEL_Y, colors.textMuted, {
          anchor: 'middle',
          family: fonts.mono,
          size: fontSizes.xs,
        });
      });

      label(frame, t('label.out', 'out of WB, by cycle'), PAD_X, OUT_LABEL_Y, colors.textMuted, {
        size: fontSizes.xs,
      });

      const put = (who: string, p: Place, held: boolean): void => {
        if (p.idx < 0 || p.idx >= COLS) return;
        const layer = who.startsWith('b') ? bubbles : instrs;
        nodes.set(who, drawToken(layer, s, who, p, held));
      };
      s.queue.forEach((who, i) => put(who, { row: 'queue', idx: i }, false));
      s.slots.forEach((who, i) => {
        if (who === null) return;
        const held = s.held.includes(who);
        put(who, { row: 'pipe', idx: i }, held);
        if (held) {
          label(frame, t('label.held', 'held'), colX(i) + COL_W / 2, HELD_Y, colors.itemActive, {
            anchor: 'middle',
            size: fontSizes.xs,
            weight: '600',
          });
        }
      });
      for (const r of s.out) {
        const idx = outIndex(s.tick, r.cycle);
        if (idx < 0 || idx >= COLS) continue;
        put(r.who, { row: 'out', idx }, false);
        const ref = nodes.get(r.who);
        // 사이클 표시는 토큰과 함께 밀린다
        if (ref) {
          label(ref.g, t('label.cycle', 'cycle {c}', { c: r.cycle }), TOK_W / 2, TOK_H + 14, colors.textMuted, {
            anchor: 'middle',
            size: fontSizes.xs,
          });
        }
      }

      // MEM/WB → EX 로 건너간 값 — WB 위에서 EX 위로 넘어가는 호
      if (s.forward) {
        const a = placeXY({ row: 'pipe', idx: COLS - 1 });
        const b = placeXY({ row: 'pipe', idx: 2 });
        // 단계 이름(가운데 위)을 피해 토큰의 오른쪽 어깨로 내려앉는다
        const x0 = a.x + 18;
        const x1 = b.x + TOK_W - 18;
        const y0 = a.y;
        const cy = QUEUE_Y + 34;
        arc = { x0, y0, cx: (x0 + x1) / 2, cy, x1, y1: y0 - 2 };
        el(
          'path',
          {
            d: `M ${r1(x0)} ${r1(y0)} Q ${r1((x0 + x1) / 2)} ${r1(cy)} ${r1(x1)} ${r1(y0 - 7)}`,
            fill: 'none',
            stroke: colors.primary,
            'stroke-width': 1.6,
          },
          over,
        );
        el(
          'path',
          {
            d: `M ${r1(x1 - 5)} ${r1(y0 - 10)} L ${r1(x1)} ${r1(y0 - 1)} L ${r1(x1 + 5)} ${r1(y0 - 10)} Z`,
            fill: colors.primary,
          },
          over,
        );
        const text =
          s.forward.value === null
            ? s.forward.reg
            : t('label.forward', '{reg} = {value}', { reg: s.forward.reg, value: s.forward.value });
        label(over, text, (x0 + x1) / 2, (y0 + cy) / 2 - 6, colors.text, {
          anchor: 'middle',
          family: fonts.mono,
          size: fontSizes.xs,
          weight: '600',
        });
      }

      if (s.caption) {
        const lines = wrap(captionText(t, s.caption), W - PAD_X * 2, 13);
        lines.forEach((line, i) => {
          label(frame, line, PAD_X, CAPTION_Y + i * CAPTION_LH, colors.text, { size: '13px' });
        });
      }
    }

    /** 한 시계로 운동을 흘린다. 첫 프레임은 곧바로 칠한다. */
    function tween(mine: number, frameFn: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / MOTION_MS);
          frameFn(p);
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

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

    async function render(
      next: PipelineBubbleScene,
      prev: PipelineBubbleScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      const step = next.step;
      if (!opts.animate || destroyed || step === null || prev === null) return;

      const moving = step.moves
        .map((m) => {
          const ref = nodes.get(m.who);
          if (!ref) return null;
          const from = placeXY(m.from);
          return { ref, dx: from.x - ref.x, dy: from.y - ref.y };
        })
        .filter((m): m is { ref: NodeRef; dx: number; dy: number } => m !== null);
      const bumping = step.bump
        .map((who) => nodes.get(who))
        .filter((r): r is NodeRef => r !== undefined);
      const path = arc;
      let dot: SVGCircleElement | null = null;
      if (path) {
        dot = el('circle', { cx: path.x0, cy: path.y0, r: 4, fill: colors.primary, opacity: 0 }, svg);
      }

      await tween(mine, (p) => {
        const e = ease(p);
        for (const m of moving) {
          const k = 1 - e;
          m.ref.g.setAttribute('transform', `translate(${r1(m.ref.x + m.dx * k)},${r1(m.ref.y + m.dy * k)})`);
        }
        const push = Math.sin(Math.PI * Math.min(1, p * 1.6));
        for (const r of bumping) {
          r.g.setAttribute('transform', `translate(${r1(r.x + (p >= 1 ? 0 : BUMP * push))},${r1(r.y)})`);
        }
        if (dot && path) {
          const q = Math.max(0, Math.min(1, (p - 0.45) / 0.55));
          const u = 1 - q;
          const x = u * u * path.x0 + 2 * u * q * path.cx + q * q * path.x1;
          const y = u * u * path.y0 + 2 * u * q * path.cy + q * q * path.y1;
          dot.setAttribute('cx', String(r1(x)));
          dot.setAttribute('cy', String(r1(y)));
          dot.setAttribute('opacity', q > 0 && q < 1 ? '1' : '0');
        }
      });
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
