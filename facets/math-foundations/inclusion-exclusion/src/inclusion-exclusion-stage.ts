import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import type { InclusionExclusionScene, IeBase, TallyFrom, Term } from './scene.js';

/**
 * 포함배제 무대.
 *
 * 원소는 한 줄로 제자리에 선다. 그 아래 두 줄의 띠가 A · B 의 소속을 보인다. 원소 위에는
 * 표가 쌓인다 — 모음을 셀 때마다 식의 그 항에서 표가 날아와 원소 위에 얹히고, 겹친 원소는
 * 둘이 쌓인다. 교집합을 빼는 걸음에 그 원소들의 맨 위 표가 떨어져 나가 "− 3" 항으로 돌아간다.
 * 마지막 걸음은 원소를 하나씩 짚으며 번호를 붙여 직접 센 수를 식의 값 곁에 세운다.
 */

const H = 320;
const SVG = 'http://www.w3.org/2000/svg';
const MARGIN_X = 36;
/** 원소 상자 한 변의 상한. 실제 크기는 칸 폭에서 역산한다. */
const BOX_MAX = 48;
const BOX_TOP = 158;
const CHIP_H = 12;
const CHIP_GAP = 4;
const BAND_A_Y = 226;
const BAND_B_Y = 248;
const ORDINAL_Y = 276;
const CAPTION_Y = 306;
const SYMBOL_Y = 36;
const NUMBER_Y = 70;
/** 오른쪽 "하나씩 센 수" 칸의 폭. */
const DIRECT_W = 150;
/** 식의 칸 수 — 항 셋과 값 하나. */
const FORMULA_COLS = 4;
const MOTION_MS = 560;

type Attrs = Record<string, string | number>;

function node<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function round(x: number): number {
  const r = Math.round(x * 100) / 100;
  return r === 0 ? 0 : r;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 자리 셈 — 캔버스 폭과 원소 수에서 역산한다. */
function geometry(n: number) {
  const slot = (PIECE_CANVAS_W - 2 * MARGIN_X) / n;
  const box = Math.min(BOX_MAX, slot - 14);
  const colW = (PIECE_CANVAS_W - 2 * MARGIN_X - DIRECT_W) / FORMULA_COLS;
  return {
    slot,
    box,
    cx: (i: number) => MARGIN_X + slot * (i + 0.5),
    chipY: (k: number) => BOX_TOP - 8 - (k + 1) * CHIP_H - k * CHIP_GAP,
    colX: (c: number) => MARGIN_X + colW * (c + 0.5),
    directX: PIECE_CANVAS_W - MARGIN_X - DIRECT_W / 2,
  };
}

function termNumber(term: Term, index: number): string {
  const n = String(term.n);
  if (term.op === 'sub') return `− ${n}`;
  return index === 0 ? n : `+ ${n}`;
}

function termSymbol(term: Term, base: IeBase): string {
  if (term.op === 'sub') return `|${base.a.name} ∩ ${base.b.name}|`;
  return `|${term.which === 'a' ? base.a.name : base.b.name}|`;
}

/** 소속 띠 — 이어진 원소끼리 한 줄로 묶는다. */
function runsOf(member: boolean[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  member.forEach((m, i) => {
    if (!m) return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  });
  return runs;
}

export const inclusionExclusionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [colorA, colorB] = categorical(2);
    if (colorA === undefined || colorB === undefined) throw new Error('categorical(2) 가 색 둘을 주지 않았다');
    const setColor = (from: TallyFrom): string => (from === 'a' ? colorA : colorB);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 돌려주는 손잡이 — 운동이 만질 요소. */
    type Handles = {
      chips: Map<string, SVGRectElement>;
      layer: SVGGElement;
      ordinals: SVGTextElement[];
      directGroup: SVGGElement | null;
    };

    function caption(scene: InclusionExclusionScene, base: IeBase): string {
      const step = scene.step;
      const total = scene.total;
      if (step === null || total === null) throw new Error('무대: 바탕이 선 장면에 걸음 · 센 수가 없다');
      const twice = scene.tallies.filter((s) => s.length >= 2).length;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Nothing counted yet · Count: {total}', { total });
        case 'add': {
          const set = step.which === 'a' ? base.a.name : base.b.name;
          const n = step.indices.length;
          if (twice > 0) {
            return t('caption.addTwice', 'Added |{set}| = {n} · Count: {total} · Elements with two tallies: {twice}', {
              set,
              n,
              total,
              twice,
            });
          }
          return t('caption.add', 'Added |{set}| = {n} · Count: {total}', { set, n, total });
        }
        case 'subtract':
          return t(
            'caption.subtract',
            'Subtracted |{a} ∩ {b}| = {n} · Count: {total} · Elements with two tallies: {twice}',
            { a: base.a.name, b: base.b.name, n: step.indices.length, total, twice },
          );
        case 'direct':
          return t('caption.direct', 'Counted one by one, {a} ∪ {b}: {direct} · Formula: {total}', {
            a: base.a.name,
            b: base.b.name,
            direct: step.direct,
            total,
          });
      }
    }

    function drawStatic(scene: InclusionExclusionScene): Handles | null {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return null;
      const total = scene.total;
      if (total === null) throw new Error('무대: 바탕이 선 장면에 센 수가 없다');
      const g = geometry(base.elements.length);
      const bodySize = parseFloat(fontSizes.md);
      const done = scene.direct !== null;

      // 식 — 항마다 위에 기호, 아래에 수. 마지막 칸이 지금의 센 수.
      scene.terms.forEach((term, c) => {
        const x = round(g.colX(c));
        node(svg, 'text', {
          x, y: SYMBOL_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.textMuted,
        }, termSymbol(term, base));
        node(svg, 'text', {
          x, y: NUMBER_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl, fill: colors.text,
        }, termNumber(term, c));
      });
      const resultX = round(g.colX(scene.terms.length));
      node(svg, 'text', {
        x: resultX, y: SYMBOL_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted,
      }, t('label.count', 'Count'));
      const resultText = scene.terms.length === 0 ? String(total) : `= ${total}`;
      if (done) {
        node(svg, 'rect', {
          x: round(resultX - 34), y: NUMBER_Y - 22, width: 68, height: 30, rx: 6, fill: colors.accent,
        });
      }
      node(svg, 'text', {
        x: resultX, y: NUMBER_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl,
        'font-weight': 600, fill: done ? colors.stateInk : colors.text,
      }, resultText);

      // 하나씩 센 수 — 마지막 걸음에만.
      let directGroup: SVGGElement | null = null;
      if (scene.direct !== null) {
        directGroup = node(svg, 'g', {});
        node(directGroup, 'text', {
          x: round(g.directX), y: SYMBOL_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted,
        }, t('label.direct', 'One by one'));
        node(directGroup, 'rect', {
          x: round(g.directX - 34), y: NUMBER_Y - 22, width: 68, height: 30, rx: 6, fill: colors.accent,
        });
        node(directGroup, 'text', {
          x: round(g.directX), y: NUMBER_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl,
          'font-weight': 600, fill: colors.stateInk,
        }, String(scene.direct));
      }

      // 원소 — 제자리. 표가 둘이면 두 번 센 것이 드러나게 테두리를 붉힌다.
      base.elements.forEach((e, i) => {
        const x = round(g.cx(i) - g.box / 2);
        const doubled = (scene.tallies[i] as TallyFrom[]).length >= 2;
        node(svg, 'rect', {
          x, y: BOX_TOP, width: round(g.box), height: round(g.box), rx: 6,
          fill: colors.bgSubtle, stroke: doubled ? colors.danger : colors.border, 'stroke-width': doubled ? 2.5 : 1,
        });
        node(svg, 'text', {
          x: round(g.cx(i)), y: round(BOX_TOP + g.box / 2 + bodySize * 0.36), 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: colors.text,
        }, e);
      });

      // 소속 띠 — A 와 B 를 두 줄로. 겹친 원소 아래로 두 띠가 함께 지난다.
      const bands: Array<[TallyFrom, boolean[], string, number]> = [
        ['a', base.inA, base.a.name, BAND_A_Y],
        ['b', base.inB, base.b.name, BAND_B_Y],
      ];
      for (const [from, member, name, y] of bands) {
        const runs = runsOf(member);
        runs.forEach(([s, e], k) => {
          const x1 = round(g.cx(s) - g.slot / 2 + 5);
          const x2 = round(g.cx(e) + g.slot / 2 - 5);
          node(svg, 'line', { x1, y1: y, x2, y2: y, stroke: setColor(from), 'stroke-width': 4, 'stroke-linecap': 'round' });
          node(svg, 'line', { x1, y1: y - 7, x2: x1, y2: y + 7, stroke: setColor(from), 'stroke-width': 2 });
          node(svg, 'line', { x1: x2, y1: y - 7, x2, y2: y + 7, stroke: setColor(from), 'stroke-width': 2 });
          if (k === 0) {
            node(svg, 'text', {
              x: round(x1 - 8), y: round(y + bodySize * 0.36), 'text-anchor': 'end', 'font-family': fonts.mono,
              'font-size': fontSizes.md, 'font-weight': 600, fill: setColor(from),
            }, name);
          }
        });
      }

      // 표 — 원소 위에 아래에서 위로 쌓인다.
      const layer = node(svg, 'g', {});
      const chips = new Map<string, SVGRectElement>();
      scene.tallies.forEach((stack, i) => {
        stack.forEach((from, k) => {
          const chip = node(layer, 'rect', {
            x: round(g.cx(i) - g.box / 2), y: round(g.chipY(k)), width: round(g.box), height: CHIP_H, rx: 3,
            fill: setColor(from), stroke: colors.bg, 'stroke-width': 1,
          });
          chips.set(`${i}:${k}`, chip);
        });
      });

      // 하나씩 센 번호.
      const ordinals: SVGTextElement[] = [];
      if (scene.direct !== null) {
        base.elements.forEach((_, i) => {
          ordinals.push(node(svg, 'text', {
            x: round(g.cx(i)), y: ORDINAL_Y, 'text-anchor': 'middle', 'font-family': fonts.mono,
            'font-size': fontSizes.md, fill: colors.text,
          }, String(i + 1)));
        });
      }

      node(svg, 'text', {
        x: round(PIECE_CANVAS_W / 2), y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': fontSizes.md, fill: colors.text,
      }, caption(scene, base));

      return { chips, layer, ordinals, directGroup };
    }

    /** 한 시계 — 진행률 p(0→1)를 frame 에 흘리고, 끝나거나 거둬지면 푼다. */
    function run(mine: number, duration: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const finish = () => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / duration);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animate(scene: InclusionExclusionScene, h: Handles, mine: number): Promise<void> {
      const base = scene.base;
      const step = scene.step;
      if (base === null || step === null) throw new Error('무대: 흘릴 장면에 바탕 · 걸음이 없다');
      const g = geometry(base.elements.length);

      if (step.kind === 'add') {
        // 식의 새 항에서 표가 날아와 원소 위에 얹힌다.
        const col = scene.terms.length - 1;
        const fromX = g.colX(col);
        const fromY = NUMBER_Y + 6;
        const moving = step.indices.map((i) => {
          const k = (scene.tallies[i] as TallyFrom[]).length - 1;
          const chip = h.chips.get(`${i}:${k}`);
          if (chip === undefined) throw new Error(`무대: 원소 ${i} 의 새 표를 찾지 못했다`);
          return { chip, dx: fromX - g.cx(i), dy: fromY - (g.chipY(k) + CHIP_H / 2) };
        });
        const spread = 0.35;
        await run(mine, MOTION_MS, (p) => {
          moving.forEach(({ chip, dx, dy }, k) => {
            const delay = moving.length > 1 ? (spread * k) / (moving.length - 1) : 0;
            const local = Math.max(0, Math.min(1, (p - delay) / (1 - spread)));
            const left = 1 - easeInOut(local);
            chip.setAttribute('transform', `translate(${round(dx * left)} ${round(dy * left)})`);
            chip.setAttribute('opacity', String(round(local === 0 ? 0 : 1)));
          });
        });
        return;
      }

      if (step.kind === 'subtract') {
        // 교집합 원소의 맨 위 표가 떨어져 나가 "−" 항으로 간다.
        const col = scene.terms.length - 1;
        const toX = g.colX(col);
        const toY = NUMBER_Y + 6;
        const ghosts = step.indices.map((i, k) => {
          const from = step.removed[k];
          if (from === undefined) throw new Error(`무대: subtract 의 떨어진 표 ${k} 가 없다`);
          const x = g.cx(i) - g.box / 2;
          const y = g.chipY(1);
          const ghost = node(h.layer, 'rect', {
            x: round(x), y: round(y), width: round(g.box), height: CHIP_H, rx: 3,
            fill: setColor(from), stroke: colors.danger, 'stroke-width': 2,
          });
          return { ghost, dx: toX - g.cx(i), dy: toY - (y + CHIP_H / 2) };
        });
        await run(mine, MOTION_MS, (p) => {
          const lift = Math.min(1, p / 0.3);
          const fly = Math.max(0, (p - 0.3) / 0.7);
          const e = easeInOut(fly);
          ghosts.forEach(({ ghost, dx, dy }) => {
            const up = -10 * lift * (1 - e);
            ghost.setAttribute('transform', `translate(${round(dx * e)} ${round(dy * e + up)})`);
            ghost.setAttribute('opacity', String(round(1 - 0.7 * e)));
          });
        });
        return;
      }

      if (step.kind === 'direct') {
        // 원소를 하나씩 짚으며 번호를 붙인다. 다 짚은 뒤에 센 수가 선다.
        const ring = node(h.layer, 'rect', {
          x: round(g.cx(0) - g.box / 2 - 4), y: BOX_TOP - 4, width: round(g.box + 8), height: round(g.box + 8), rx: 8,
          fill: 'none', stroke: colors.accent, 'stroke-width': 3,
        });
        const n = h.ordinals.length;
        if (h.directGroup === null || n !== base.elements.length) throw new Error('무대: 하나씩 센 수의 손잡이가 없다');
        const directGroup = h.directGroup;
        h.ordinals.forEach((o) => o.setAttribute('opacity', '0'));
        directGroup.setAttribute('opacity', '0');
        await run(mine, MOTION_MS, (p) => {
          const pos = p * (n - 1);
          ring.setAttribute('transform', `translate(${round(pos * g.slot)} 0)`);
          h.ordinals.forEach((o, i) => {
            if (i <= pos + 0.001) o.removeAttribute('opacity');
          });
          if (p >= 1) directGroup.removeAttribute('opacity');
        });
      }
    }

    return {
      async render(next: InclusionExclusionScene, prev: InclusionExclusionScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || handles === null || next.step === null) return;
        // 같은 걸음을 다시 받으면 흘리지 않는다.
        if (prev !== null && prev.step === next.step) return;
        if (next.step.kind === 'start') return;
        await animate(next, handles, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
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
