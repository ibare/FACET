/**
 * filter-keep-some 의 무대 — 걸려 떨어진다.
 *
 * 옛 목록의 원소가 하나씩 내려와 조건의 문 안에 선다. 참이면 값 그대로 문을 지나 새 목록
 * 끝에 빈틈 없이 붙고, 거짓이면 기울며 옆 바닥으로 떨어진다. 새 목록의 닫는 괄호는 붙은
 * 원소만큼만 벌어진다. 옛 목록은 제자리에 그대로 남는다 — filter 는 옛 목록을 고치지 않는다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { FilterKeepSomeScene, SceneCell, SceneList } from './scene';

const H = 400;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE = 24;
/** 목록 이름 칸 뒤에서 원소 칸이 시작한다 */
const CELLS_LEFT = 104;
const CELL_MAX_W = 62;
const CELL_H = 44;
const GAP = 14;

const Y_SRC = 122;
const Y_GATE = 200;
const Y_DST = 276;
const Y_DROP = 350;
const Y_CAPTION = 392;

const CODE_TOP = 26;
const CODE_LINE_H = 22;
/** 고정폭 글꼴의 글자 폭 / 글꼴 크기 */
const MONO_RATIO = 0.6;

const TO_GATE_MS = 220;
const PAST_GATE_MS = 240;
const SHOW_MS = 380;
const ASSIGN_MS = 380;
const FRAME_MS = 16;
/** 떨어진 원소의 기울기 (도) — 차례마다 번갈아 */
const DROP_TILT = [-11, 8, -6, 12, -9, 5];

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(node);
  return node;
}

function place(x: number, y: number, rot = 0, scale = 1): string {
  let s = `translate(${r2(x)} ${r2(y)})`;
  if (r2(rot) !== 0) s += ` rotate(${r2(rot)})`;
  if (r2(scale) !== 1) s += ` scale(${r2(scale)})`;
  return s;
}

function listText(items: number[]): string {
  return '[' + items.join(', ') + ']';
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Geometry = {
  n: number;
  cellW: number;
  pitch: number;
  slotX(i: number): number;
  dropX(j: number): number;
  gateX: number;
  rowRight: number;
};

function geometry(n: number): Geometry {
  const count = Math.max(1, n);
  const avail = W - SIDE - CELLS_LEFT;
  const cellW = Math.min(CELL_MAX_W, Math.floor((avail - GAP * (count - 1)) / count));
  const pitch = cellW + GAP;
  const rowRight = CELLS_LEFT + count * pitch - GAP;
  return {
    n: count,
    cellW,
    pitch,
    slotX: (i) => CELLS_LEFT + i * pitch + cellW / 2,
    dropX: (j) => rowRight - cellW / 2 - j * pitch,
    gateX: (CELLS_LEFT + rowRight) / 2,
    rowRight,
  };
}

type Handles = {
  /** 이번 걸음에 움직이는 원소 */
  moving: SVGGElement | null;
  /** 문 곁의 판정 글자 — 원소가 문에 닿기 전에는 숨긴다 */
  verdict: SVGGElement | null;
  /** 막 세운 목록의 칸들 */
  born: SVGGElement[];
  /** 내보낸 값 */
  output: SVGGElement | null;
};

export const filterKeepSomeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const codePx = parseFloat(fontSizes.md);
    const charW = codePx * MONO_RATIO;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let h: Handles = { moving: null, verdict: null, born: [], output: null };

    function codeX(indent: number): number {
      return SIDE + 14 + indent * 4 * charW;
    }

    function codeBaseline(line: number): number {
      return CODE_TOP + line * CODE_LINE_H;
    }

    function sourceOf(s: FilterKeepSomeScene): SceneList | null {
      if (s.filter !== null) return s.lists.find((l) => l.name === s.filter?.source) ?? null;
      return s.lists[0] ?? null;
    }

    function cell(
      parent: Element,
      value: number,
      x: number,
      y: number,
      w: number,
      look: { stroke: string; ink: string; dash?: boolean; width?: number },
      rot = 0,
    ): SVGGElement {
      const g = el('g', { transform: place(x, y, rot) }, parent);
      const rect: Attrs = {
        x: -w / 2,
        y: -CELL_H / 2,
        width: w,
        height: CELL_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: look.stroke,
        'stroke-width': look.width ?? 1.5,
      };
      if (look.dash === true) rect['stroke-dasharray'] = '4 3';
      el('rect', rect, g);
      const tx = el('text', {
        x: 0,
        y: 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: look.ink,
      }, g);
      tx.textContent = String(value);
      return g;
    }

    function rowLabel(name: string, y: number): void {
      const tx = el('text', {
        x: SIDE,
        y: y + 5,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
      }, svg);
      tx.textContent = name;
    }

    function bracket(x: number, y: number, open: boolean): void {
      const top = y - CELL_H / 2 - 4;
      const bottom = y + CELL_H / 2 + 4;
      const arm = open ? 6 : -6;
      el('path', {
        d: `M ${r2(x + arm)} ${top} L ${r2(x)} ${top} L ${r2(x)} ${bottom} L ${r2(x + arm)} ${bottom}`,
        fill: 'none',
        stroke: c.textMuted,
        'stroke-width': 1.5,
      }, svg);
    }

    function caption(s: FilterKeepSomeScene): string {
      const step = s.step;
      if (step.kind === 'assign') {
        const list = s.lists.find((l) => l.name === step.name);
        return t('caption.assign', 'New list {name}. Elements: {n}.', { name: step.name, n: list?.items.length ?? 0 });
      }
      if (step.kind === 'item') {
        const target = s.filter?.target ?? '';
        return step.keep
          ? t('caption.keep', 'Position {i}: {test} is true. Value added to {target}: {value}.', {
            i: step.index,
            test: step.test,
            target,
            value: step.value,
          })
          : t('caption.drop', 'Position {i}: {test} is false. It drops out.', { i: step.index, test: step.test });
      }
      if (step.kind === 'show') {
        const src = sourceOf(s);
        return t('caption.show', 'Output: {out}. Length: {source} {from} → {target} {to}.', {
          out: listText(s.output ?? []),
          source: src?.name ?? '',
          from: src?.items.length ?? 0,
          target: s.filter?.target ?? '',
          to: s.kept.length,
        });
      }
      return t('caption.start', 'Nothing has run yet.');
    }

    function drawStatic(s: FilterKeepSomeScene): void {
      svg.textContent = '';
      h = { moving: null, verdict: null, born: [], output: null };

      // 코드
      s.lines.forEach((line, i) => {
        const y = codeBaseline(i);
        if (s.at === i) {
          el('rect', { x: SIDE - 6, y: y - 15, width: 4, height: 20, rx: 2, fill: c.accent }, svg);
        }
        const tx = el('text', {
          x: codeX(line.indent),
          y,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: s.at === i ? c.text : c.textMuted,
        }, svg);
        tx.textContent = line.text;
      });

      const src = sourceOf(s);
      const geo = geometry(src?.items.length ?? 1);
      const step = s.step;

      // 조건의 문 — filter 가 돌기 시작한 뒤에만
      if (s.filter !== null) {
        const half = geo.cellW / 2 + 9;
        const top = Y_GATE - CELL_H / 2 - 10;
        const bottom = Y_GATE + CELL_H / 2 + 10;
        for (const side of [-1, 1]) {
          el('rect', {
            x: geo.gateX + side * half - 3,
            y: top,
            width: 6,
            height: bottom - top,
            rx: 2,
            fill: c.border,
          }, svg);
        }
        el('rect', { x: geo.gateX - half - 3, y: top - 6, width: half * 2 + 6, height: 6, rx: 2, fill: c.border }, svg);
        const fn = el('text', {
          x: geo.gateX - half - 14,
          y: Y_GATE + 5,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        }, svg);
        fn.textContent = s.filter.fn;

        if (step.kind === 'item') {
          const v = el('g', { transform: place(geo.gateX + half + 14, Y_GATE + 5) }, svg);
          const test = el('text', { x: 0, y: 0, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text }, v);
          test.textContent = step.test;
          const verdict = el('text', {
            x: (step.test.length + 1) * charW,
            y: 0,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: step.keep ? c.success : c.danger,
          }, v);
          verdict.textContent = step.keep ? 'true' : 'false';
          h.verdict = v;
        }
      }

      // 옛 목록 — 제자리에 그대로 남는다
      if (src !== null) {
        rowLabel(src.name, Y_SRC);
        const passed = s.kept.length + s.dropped.length;
        src.items.forEach((value, i) => {
          const current = step.kind === 'item' && step.index === i;
          const visited = s.filter !== null && i < passed && !current;
          const g = cell(svg, value, geo.slotX(i), Y_SRC, geo.cellW, {
            stroke: current ? c.accent : visited ? c.border : c.textMuted,
            ink: visited ? c.textMuted : c.text,
            width: current ? 2.5 : 1.5,
          });
          if (step.kind === 'assign' && step.name === src.name) h.born.push(g);
        });
      }

      // 새 목록 — 붙은 원소만큼 괄호가 벌어진다
      if (s.filter !== null) {
        rowLabel(s.filter.target, Y_DST);
        const k = s.kept.length;
        bracket(CELLS_LEFT - 9, Y_DST, true);
        bracket(k === 0 ? CELLS_LEFT + 3 : CELLS_LEFT + k * geo.pitch - GAP + 9, Y_DST, false);
        s.kept.forEach((kc: SceneCell, slot) => {
          const g = cell(svg, kc.value, geo.slotX(slot), Y_DST, geo.cellW, { stroke: c.success, ink: c.text });
          if (step.kind === 'item' && step.keep && step.index === kc.index) h.moving = g;
        });

        if (s.dropped.length > 0) {
          const lab = el('text', {
            x: geo.rowRight,
            y: Y_DROP - CELL_H / 2 - 12,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }, svg);
          lab.textContent = t('label.dropped', 'dropped');
        }
        s.dropped.forEach((dc: SceneCell, j) => {
          const g = cell(
            svg,
            dc.value,
            geo.dropX(j),
            Y_DROP,
            geo.cellW,
            { stroke: c.danger, ink: c.textMuted, dash: true },
            DROP_TILT[j % DROP_TILT.length] ?? 0,
          );
          if (step.kind === 'item' && !step.keep && step.index === dc.index) h.moving = g;
        });
      }

      // 내보낸 값
      if (s.output !== null) {
        const g = el('g', { transform: place(W - SIDE, CODE_TOP + 30) }, svg);
        const lab = el('text', {
          x: 0,
          y: -28,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        }, g);
        lab.textContent = t('label.output', 'output');
        const val = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: c.text,
        }, g);
        val.textContent = listText(s.output);
        h.output = g;
      }

      const cap = el('text', {
        x: SIDE,
        y: Y_CAPTION,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      }, svg);
      cap.textContent = caption(s);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /** ms 동안 frame(p) 를 부른다. 세대가 바뀌거나 거두면 손대지 않고 물러난다. */
    async function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      frame(0);
      for (;;) {
        await wait(FRAME_MS);
        if (destroyed || mine !== gen) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frame(p);
        if (p >= 1) return true;
      }
    }

    async function moveItem(mine: number, s: FilterKeepSomeScene): Promise<void> {
      const step = s.step;
      const moving = h.moving;
      const verdict = h.verdict;
      if (step.kind !== 'item' || moving === null) return;
      const src = sourceOf(s);
      const geo = geometry(src?.items.length ?? 1);
      const fromX = geo.slotX(step.index);
      let toX: number;
      let toY: number;
      let toRot = 0;
      if (step.keep) {
        toX = geo.slotX(s.kept.length - 1);
        toY = Y_DST;
      } else {
        const j = s.dropped.length - 1;
        toX = geo.dropX(j);
        toY = Y_DROP;
        toRot = DROP_TILT[j % DROP_TILT.length] ?? 0;
      }
      if (verdict !== null) verdict.setAttribute('visibility', 'hidden');
      // 문 앞으로 내려와 선다
      const ok = await tween(mine, TO_GATE_MS, (p) => {
        const e = ease(p);
        moving.setAttribute('transform', place(lerp(fromX, geo.gateX, e), lerp(Y_SRC, Y_GATE, e)));
      });
      if (!ok) return;
      if (verdict !== null) verdict.removeAttribute('visibility');
      // 지나가거나, 떨어진다
      await tween(mine, PAST_GATE_MS, (p) => {
        if (step.keep) {
          const e = ease(p);
          moving.setAttribute('transform', place(lerp(geo.gateX, toX, e), lerp(Y_GATE, toY, e)));
        } else {
          moving.setAttribute('transform', place(lerp(geo.gateX, toX, p), lerp(Y_GATE, toY, p * p), toRot * p));
        }
      });
    }

    async function bornList(mine: number, s: FilterKeepSomeScene): Promise<void> {
      const at = s.at;
      const src = sourceOf(s);
      if (at === null || src === null || h.born.length === 0) return;
      const line = s.lines[at];
      if (line === undefined) return;
      const geo = geometry(src.items.length);
      // 목록 글자 안에서 각 수가 선 자리에서 출발한다
      const starts: number[] = [];
      let from = line.text.indexOf('[');
      for (const v of src.items) {
        const idx = line.text.indexOf(String(v), Math.max(0, from));
        const col = idx < 0 ? 0 : idx;
        starts.push(codeX(line.indent) + (col + String(v).length / 2) * charW);
        from = col + String(v).length;
      }
      const y0 = codeBaseline(at) - 5;
      const born = h.born;
      await tween(mine, ASSIGN_MS, (p) => {
        const e = ease(p);
        born.forEach((g, i) => {
          g.setAttribute('transform', place(lerp(starts[i] ?? 0, geo.slotX(i), e), lerp(y0, Y_SRC, e), 0, lerp(0.4, 1, e)));
        });
      });
    }

    async function showOutput(mine: number, s: FilterKeepSomeScene): Promise<void> {
      const out = h.output;
      if (out === null) return;
      const src = sourceOf(s);
      const geo = geometry(src?.items.length ?? 1);
      const k = Math.max(1, s.kept.length);
      const fromX = CELLS_LEFT + (k * geo.pitch - GAP) / 2;
      const toX = W - SIDE;
      const toY = CODE_TOP + 30;
      // 글자 끝(오른쪽)이 기준이라, 출발점은 새 목록 가운데에 글자 가운데가 오도록 민다
      const halfText = (listText(s.output ?? []).length * parseFloat(fontSizes.xl) * MONO_RATIO) / 2;
      await tween(mine, SHOW_MS, (p) => {
        const e = ease(p);
        out.setAttribute('transform', place(lerp(fromX + halfText, toX, e), lerp(Y_DST, toY, e)));
      });
    }

    const renderer: SceneRenderer<FilterKeepSomeScene> = {
      async render(next, _prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const kind = next.step.kind;
        if (kind === 'item') await moveItem(mine, next);
        else if (kind === 'assign') await bornList(mine, next);
        else if (kind === 'show') await showOutput(mine, next);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
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
    return renderer;
  },
};
