/**
 * immutable-copy 의 stage — 두 프로그램을 나란히 두고, 목록을 **정체 하나 = 칸 한 줄**로 그린다.
 *
 * 동사는 둘이다.
 * - 덮어써 사라진다 (A) — 넣는 값이 코드 줄에서 내려와 목록의 그 자리에 들어가고, 있던 값은 칸 밖으로 밀려 떨어진다.
 *   목록은 여전히 한 줄이고, 밀려난 값은 어디에도 다시 그려지지 않는다.
 * - 베껴 나란히 선다 (B) — 옛 목록의 칸들이 옆으로 베껴 나가 새 줄로 서고, 넣는 값은 그 새 줄의 자리에만 내려온다.
 *   옛 줄은 제자리에 그대로 있다.
 *
 * 화면은 장면에서 통째로 세운다(drawStatic). 운동은 이미 끝 자리에 선 요소를 "아직 못 온 만큼" 옮겨 그린다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  listsHolding,
  listsOfProgram,
  type ImmutableCopyList,
  type ImmutableCopyScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 360;
const W = PIECE_CANVAS_W;

/** 운동 길이 — 걸음 하나의 운동 전부가 이 한 시계로 흐른다 */
const MOVE_MS = 420;
/** 칸 크기의 상한 */
const CELL_MAX = 44;
/** 한 줄의 코드 줄 높이 상한 */
const CODE_LINE_MAX = 20;
/** 목록 줄 사이 틈 */
const LIST_GAP = 26;
/** 들여쓰기 한 칸의 글자 수 (표기 규약: 빈칸 넷) */
const INDENT_CHARS = 4;
/** 고정폭 글꼴의 글자 폭 / 글꼴 크기 */
const MONO_RATIO = 0.6;

const PAD = 20;
const HEAD_Y = 26;
const CODE_TOP = 40;
const CODE_BOTTOM = 128;
const TAG_Y = 158;
const CELL_TOP = 166;
const OUT_LABEL_Y = 248;
const OUT_TOP = 270;
const OUT_LINE = 20;
const COL_BOTTOM = 300;
const CAPTION_Y1 = 326;
const CAPTION_Y2 = 348;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function fmtList(items: number[]): string {
  return `[${items.join(', ')}]`;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 0‥1 의 전체 진행에서 [a, b] 구간의 진행 */
function span(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

/** 장면에서 셈하는 자리 — 좌표는 여기서만 나온다 */
type Layout = {
  colW: number;
  colX(prog: number): number;
  codePx: number;
  charW: number;
  lineH: number;
  lineY(line: number): number;
  cell: number;
  listX(prog: number, slot: number): number;
  cellCx(prog: number, slot: number, i: number): number;
  cellCy: number;
  outY(k: number): number;
};

function layoutOf(scene: ImmutableCopyScene): Layout {
  const n = Math.max(1, scene.programs.length);
  const colW = W / n;
  let maxChars = 1;
  let maxLines = 1;
  for (const p of scene.programs) {
    maxLines = Math.max(maxLines, p.lines.length);
    for (const l of p.lines) maxChars = Math.max(maxChars, l.indent * INDENT_CHARS + l.text.length);
  }
  const basePx = parseFloat(fontSizes.sm);
  const codePx = Math.min(basePx, (colW - 2 * PAD - 8) / (maxChars * MONO_RATIO));
  const charW = codePx * MONO_RATIO;
  const lineH = Math.min(CODE_LINE_MAX, (CODE_BOTTOM - CODE_TOP) / maxLines);

  let maxItems = 1;
  let perProg = 2;
  for (const [i] of scene.programs.entries()) perProg = Math.max(perProg, listsOfProgram(scene, i).length);
  for (const l of scene.lists) maxItems = Math.max(maxItems, l.items.length);
  if (scene.lists.length === 0) maxItems = 3;
  const cell = Math.min(CELL_MAX, (colW - 2 * PAD - (perProg - 1) * LIST_GAP) / (perProg * maxItems));

  const colX = (prog: number): number => prog * colW;
  const listX = (prog: number, slot: number): number => colX(prog) + PAD + slot * (maxItems * cell + LIST_GAP);
  return {
    colW,
    colX,
    codePx,
    charW,
    lineH,
    lineY: (line) => CODE_TOP + line * lineH + lineH * 0.72,
    cell,
    listX,
    cellCx: (prog, slot, i) => listX(prog, slot) + i * cell + cell / 2,
    cellCy: CELL_TOP + cell / 2,
    outY: (k) => OUT_TOP + k * OUT_LINE,
  };
}

type Handles = {
  /** 목록의 정체 → 칸틀과 이름표 묶음 */
  groups: Map<number, SVGGElement>;
  /** `${목록}:${자리}` → 값 글자 */
  values: Map<string, SVGTextElement>;
  /** 출력의 차례 → 출력 글자 */
  outputs: Map<number, SVGTextElement>;
  /** 운동 동안만 있는 것을 얹는 맨 위 층 */
  top: SVGGElement;
};

export const immutableCopyStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      content: string,
      attrs: Record<string, string | number>,
    ): SVGTextElement {
      const node = el('text', { x, y, ...attrs }, parent);
      node.textContent = content;
      return node;
    }

    function programLabel(id: string): string {
      if (id === 'fix') return t('label.fix', 'A · change it');
      if (id === 'copy') return t('label.copy', 'B · make a new one');
      return id;
    }

    /** 코드 줄 안에서 글자 `needle` 이 선 자리 (가운데). 없으면 줄 첫머리 */
    function codePoint(L: Layout, scene: ImmutableCopyScene, prog: number, line: number, needle: string): [number, number] {
      const row = scene.programs[prog]?.lines[line];
      const x0 = L.colX(prog) + PAD + (row ? row.indent * INDENT_CHARS : 0) * L.charW;
      const at = row ? row.text.lastIndexOf(needle) : -1;
      const x = at < 0 ? x0 : x0 + (at + needle.length / 2) * L.charW;
      return [x, L.lineY(line) - L.codePx * 0.35];
    }

    function slotOf(scene: ImmutableCopyScene, list: ImmutableCopyList): number {
      return listsOfProgram(scene, list.prog).findIndex((l) => l.id === list.id);
    }

    function captionLines(scene: ImmutableCopyScene): string[] {
      const s = scene.step;
      if (!s) return scene.programs.length > 0 ? [t('caption.start', 'Two separate programs. Neither has run yet.')] : [];
      const count = (was: number): string =>
        t('caption.count', '{prog} — lists: {lists} · lists holding {was}: {n}', {
          prog: programLabel(scene.programs[s.prog]?.id ?? ''),
          lists: listsOfProgram(scene, s.prog).length,
          was,
          n: listsHolding(scene, s.prog, was),
        });
      if (s.kind === 'create') {
        const list = scene.lists.find((l) => l.id === s.list);
        return [
          t('caption.create', 'A new list {items} is made. The name {name} holds it.', {
            items: fmtList(list?.items ?? []),
            name: list?.name ?? '',
          }),
        ];
      }
      if (s.kind === 'overwrite') {
        return [
          t('caption.overwrite', 'Slot {index} of the same list: {was} → {value}.', {
            index: s.index,
            was: s.was,
            value: s.value,
          }),
          count(s.was),
        ];
      }
      if (s.kind === 'copy') {
        return [
          t('caption.copy', 'The list is copied into a new one; only its slot {index} gets {value}.', {
            index: s.index,
            value: s.value,
          }),
          count(s.was),
        ];
      }
      const out = scene.outputs[s.output];
      return [t('caption.show', 'Output: {value}', { value: fmtList(out?.items ?? []) })];
    }

    function drawStatic(scene: ImmutableCopyScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const s = scene.step;
      const root = el('g', {}, svg);
      const handles: Handles = { groups: new Map(), values: new Map(), outputs: new Map(), top: root };

      for (const [prog, program] of scene.programs.entries()) {
        const x0 = L.colX(prog) + PAD;
        const started = s !== null && s.prog >= prog;
        const ink = started ? c.text : c.textMuted;

        text(root, x0, HEAD_Y, programLabel(program.id), {
          fill: ink,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
        });

        for (const [li, row] of program.lines.entries()) {
          const here = s !== null && s.prog === prog && s.line === li;
          if (here) {
            el('rect', { x: x0 - 8, y: CODE_TOP + li * L.lineH, width: L.colW - 2 * PAD + 8, height: L.lineH, fill: c.bgSubtle, rx: 3 }, root);
            el('rect', { x: x0 - 8, y: CODE_TOP + li * L.lineH, width: 3, height: L.lineH, fill: c.accent }, root);
          }
          text(root, x0 + row.indent * INDENT_CHARS * L.charW, L.lineY(li), row.text, {
            fill: ink,
            'font-family': fonts.mono,
            'font-size': L.codePx,
          });
        }

        const mine = listsOfProgram(scene, prog);
        for (const [slot, list] of mine.entries()) {
          const lx = L.listX(prog, slot);
          const g = el('g', {}, root);
          handles.groups.set(list.id, g);
          text(g, lx, TAG_Y, list.name, {
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          for (const [i] of list.items.entries()) {
            const stays = s?.kind === 'copy' && s.from === list.id && s.index === i;
            const written = list.written === i;
            el('rect', {
              x: lx + i * L.cell,
              y: CELL_TOP,
              width: L.cell,
              height: L.cell,
              fill: stays ? c.accent : c.bg,
              'fill-opacity': stays ? 0.45 : 1,
              stroke: written ? c.primary : c.border,
              'stroke-width': written ? 2 : 1,
            }, g);
          }
        }
        // 값 글자는 칸틀 위 층에 — 넣는 값이 칸틀과 따로 움직일 수 있게
        for (const [slot, list] of mine.entries()) {
          for (const [i, v] of list.items.entries()) {
            const node = text(root, L.cellCx(prog, slot, i), L.cellCy + parseFloat(fontSizes.md) * 0.35, String(v), {
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'text-anchor': 'middle',
              'font-weight': list.written === i ? 700 : 400,
            });
            handles.values.set(`${list.id}:${i}`, node);
          }
        }

        const outs = scene.outputs.map((o, k) => ({ o, k })).filter(({ o }) => o.prog === prog);
        if (outs.length > 0) {
          text(root, x0, OUT_LABEL_Y, t('label.output', 'output'), {
            fill: c.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          });
        }
        for (const [j, { o, k }] of outs.entries()) {
          const node = text(root, x0, L.outY(j), fmtList(o.items), {
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
          });
          handles.outputs.set(k, node);
        }

        if (prog > 0) {
          el('line', { x1: L.colX(prog), y1: 10, x2: L.colX(prog), y2: COL_BOTTOM, stroke: c.border, 'stroke-width': 1 }, root);
        }
      }

      const lines = captionLines(scene);
      for (const [i, line] of lines.entries()) {
        text(root, PAD, i === 0 ? CAPTION_Y1 : CAPTION_Y2, line, {
          fill: i === 0 ? c.text : c.textMuted,
          'font-family': fonts.body,
          'font-size': i === 0 ? fontSizes.md : fontSizes.sm,
        });
      }

      handles.top = el('g', {}, root);
      return handles;
    }

    /** 한 시계 — draw(진행) 를 MOVE_MS 동안 부른다. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function clock(mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
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
          const p = Math.min(1, (performance.now() - start) / MOVE_MS);
          draw(p);
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

    function shift(node: Element | undefined, dx: number, dy: number): void {
      if (!node) return;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    function motion(next: ImmutableCopyScene, h: Handles, mine: number): Promise<void> | null {
      const s = next.step;
      if (!s) return null;
      const L = layoutOf(next);

      if (s.kind === 'create') {
        const list = next.lists.find((l) => l.id === s.list);
        if (!list) return null;
        const slot = slotOf(next, list);
        const [fx, fy] = codePoint(L, next, s.prog, s.line, '[');
        const dx = fx - L.listX(s.prog, slot);
        const dy = fy - L.cellCy;
        const nodes: Element[] = [h.groups.get(list.id), ...list.items.map((_, i) => h.values.get(`${list.id}:${i}`))].filter(
          (x): x is SVGGElement | SVGTextElement => x !== undefined,
        );
        return clock(mine, (p) => {
          const q = 1 - easeInOut(p);
          for (const n of nodes) {
            shift(n, dx * q, dy * q);
            n.setAttribute('opacity', String(r2(Math.min(1, 0.25 + p))));
          }
        });
      }

      if (s.kind === 'overwrite') {
        const list = next.lists.find((l) => l.id === s.list);
        if (!list) return null;
        const slot = slotOf(next, list);
        const cx = L.cellCx(s.prog, slot, s.index);
        const baseY = L.cellCy + parseFloat(fontSizes.md) * 0.35;
        const arriving = h.values.get(`${list.id}:${s.index}`);
        const [fx, fy] = codePoint(L, next, s.prog, s.line, String(s.value));
        const ax = fx - cx;
        const ay = fy - L.cellCy;
        // 밀려나는 옛 값 — 정적 그리기에는 없다. 운동 동안만 맨 위 층에 선다
        const gone = text(h.top, cx, baseY, String(s.was), {
          fill: c.danger,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
        });
        const fall = L.cell * 1.1;
        return clock(mine, (p) => {
          const a = 1 - easeInOut(span(p, 0, 0.7));
          shift(arriving, ax * a, ay * a);
          const b = easeInOut(span(p, 0.35, 1));
          shift(gone, 0, fall * b);
          gone.setAttribute('opacity', String(r2(1 - b)));
        });
      }

      if (s.kind === 'copy') {
        const list = next.lists.find((l) => l.id === s.list);
        const from = next.lists.find((l) => l.id === s.from);
        if (!list || !from) return null;
        const dx = L.listX(s.prog, slotOf(next, from)) - L.listX(s.prog, slotOf(next, list));
        const g = h.groups.get(list.id);
        const rects = g ? Array.from(g.querySelectorAll('rect')) : [];
        const carried = list.items
          .map((_, i) => (i === s.index ? undefined : h.values.get(`${list.id}:${i}`)))
          .filter((x): x is SVGTextElement => x !== undefined);
        const arriving = h.values.get(`${list.id}:${s.index}`);
        const slot = slotOf(next, list);
        const [fx, fy] = codePoint(L, next, s.prog, s.line, String(s.value));
        const ax = fx - L.cellCx(s.prog, slot, s.index);
        const ay = fy - L.cellCy;
        return clock(mine, (p) => {
          const a = 1 - easeInOut(span(p, 0, 0.55));
          shift(g, dx * a, 0);
          for (const n of carried) shift(n, dx * a, 0);
          // 베끼는 동안 칸틀은 비쳐 옛 목록을 가리지 않는다
          for (const r of rects) r.setAttribute('fill-opacity', String(r2(1 - a)));
          const b = 1 - easeInOut(span(p, 0.45, 1));
          shift(arriving, ax * b, ay * b);
          if (arriving) arriving.setAttribute('opacity', String(r2(span(p, 0.4, 0.5))));
        });
      }

      const out = h.outputs.get(s.output);
      const list = next.lists.find((l) => l.id === s.list);
      if (!out || !list) return null;
      const slot = slotOf(next, list);
      const js = next.outputs.filter((o, k) => o.prog === s.prog && k <= s.output).length - 1;
      const dx = L.listX(s.prog, slot) - (L.colX(s.prog) + PAD);
      const dy = L.cellCy + parseFloat(fontSizes.md) * 0.35 - L.outY(js);
      return clock(mine, (p) => {
        const q = 1 - easeInOut(p);
        shift(out, dx * q, dy * q);
      });
    }

    async function render(
      next: ImmutableCopyScene,
      prev: ImmutableCopyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || prev === null || prev === next) return;
      const run = motion(next, handles, mine);
      if (!run) return;
      await run;
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
