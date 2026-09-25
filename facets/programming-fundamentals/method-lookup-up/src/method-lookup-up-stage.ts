/**
 * method-lookup-up 무대 — 찾는 자리가 객체에서 출발해 상속 사슬을 거슬러 올라간다.
 *
 * 왼쪽은 프로그램 그대로다 — 클래스마다 테를 두르고, 선언된 차례대로 위에서 아래로 놓인다
 * (부모가 먼저 선언되어 위에 있다). 오른쪽의 세로 줄이 상속 사슬이고, 층마다 역이 그 클래스의
 * 테와 이어진다. 부름 하나마다 메서드 이름을 든 알약이 객체 카드에서 떠나 역을 하나씩 올라가며
 * 들여다보고, 처음 찾은 역에서 멈춘다. 그 위는 점선으로 남는다 — 가지 않은 길이다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { MethodLookupUpScene, SceneBase } from './scene.js';

const H = 460;
const PAD = 16;
const CAPTION_Y = 20;
const NOTE_Y = 40;
const TOP = 58;
const BLOCK_GAP = 12;
const LINE_MAX = 20;
const INNER = 10;
const MOVE_MS = 350;
const CODE_SIZE = fontSizes.md;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = { x: number; y: number };

type Layout = {
  lineH: number;
  rowY: number[];
  codeRight: number;
  railX: number;
  markX: number;
  outX: number;
  station: Map<string, number>;
  charW: number;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function layout(base: SceneBase): Layout {
  const W = PIECE_CANVAS_W;
  const n = Math.max(1, base.lines.length);
  const owner = base.lines.map(() => -1);
  base.classes.forEach((c, ci) => {
    for (let i = c.first; i <= c.last && i < owner.length; i += 1) owner[i] = ci;
  });
  const gapsBefore: number[] = [];
  let g = 0;
  owner.forEach((o, i) => {
    if (i > 0 && o !== owner[i - 1]) g += 1;
    gapsBefore.push(g);
  });
  const lineH = Math.min(LINE_MAX, (H - TOP - PAD - g * BLOCK_GAP) / n);
  const rowY = gapsBefore.map((gb, i) => round(TOP + i * lineH + gb * BLOCK_GAP + lineH / 2));

  const charW = parseFloat(CODE_SIZE) * 0.6;
  const cols = base.lines.reduce((m, ln) => Math.max(m, ln.indent * 4 + ln.text.length), 0);
  const codeRight = round(PAD + INNER * 2 + cols * charW);
  const room = W - PAD - codeRight;
  const railX = round(codeRight + room * 0.45);
  const station = new Map<string, number>();
  for (const c of base.classes) {
    station.set(c.name, round(((rowY[c.first] ?? TOP) + (rowY[c.last] ?? TOP)) / 2));
  }
  return {
    lineH,
    rowY,
    codeRight,
    railX,
    markX: round((codeRight + railX - 54) / 2),
    outX: round(railX + 64),
    station,
    charW,
  };
}

type Handles = {
  pill: SVGGElement | null;
  pillAt: Point | null;
  mark: SVGElement | null;
  card: SVGGElement | null;
  cardAt: Point | null;
  lastOut: SVGTextElement | null;
  lastOutAt: Point | null;
};

export const methodLookupUpStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size: string; family: string; fill: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    }

    function caption(scene: MethodLookupUpScene, root: Element): void {
      const step = scene.step;
      if (!step) return;
      let line = '';
      let note = '';
      if (step.kind === 'start') {
        line = t('caption.start', 'The program is in place. Nothing has run yet.');
      } else if (step.kind === 'create') {
        line = t('caption.create', 'New object {name}. Its class: {cls}.', {
          name: step.name,
          cls: step.cls,
        });
      } else if (step.kind === 'look' && !step.found) {
        line = t('caption.miss', '{method}(): not in {cls}. Up one level.', {
          method: step.method,
          cls: step.cls,
        });
      } else if (step.kind === 'look') {
        line = t('caption.found', '{method}(): found in {cls}. Classes looked at: {n}.', {
          method: step.method,
          cls: step.cls,
          n: step.n,
        });
        const above = scene.call?.shadowed ?? [];
        if (above.length > 0) {
          note = t('caption.shadow', 'Also in {above}, higher up. The search never gets there.', {
            above: above.map((s) => s.cls).join(', '),
          });
        }
      } else {
        line = t('caption.run', 'The body of {cls}.{method}() runs. Output: {value}', {
          cls: step.cls,
          method: step.method,
          value: step.output,
        });
      }
      label(root, PAD, CAPTION_Y, line, {
        size: fontSizes.md,
        family: fonts.body,
        fill: colors.text,
      });
      if (note) {
        label(root, PAD, NOTE_Y, note, {
          size: fontSizes.sm,
          family: fonts.body,
          fill: colors.textMuted,
        });
      }
    }

    function drawStatic(scene: MethodLookupUpScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        pill: null,
        pillAt: null,
        mark: null,
        card: null,
        cardAt: null,
        lastOut: null,
        lastOutAt: null,
      };
      const base = scene.base;
      if (!base) return handles;
      const L = layout(base);
      const root = el('g', {}, svg);
      const step = scene.step;
      const call = scene.call;
      const codeSize = CODE_SIZE;
      const textX = (indent: number): number => PAD + INNER + indent * 4 * L.charW;
      const rowTop = (i: number): number => (L.rowY[i] ?? TOP) - L.lineH / 2;
      const boxW = L.codeRight - PAD;

      caption(scene, root);

      // 줄 바탕 — 부르는 줄, 돈 몸, 찾은 메서드, 가지 않은 같은 이름
      const tint = el('g', {}, root);
      if (call) {
        el(
          'rect',
          { x: PAD, y: rowTop(call.line), width: boxW, height: L.lineH, fill: colors.bgSubtle, rx: 3 },
          tint,
        );
      }
      const current = step && step.kind === 'run' ? step.line : -1;
      for (const r of scene.ran) {
        el(
          'rect',
          {
            x: PAD + 4,
            y: rowTop(r) + 1,
            width: boxW - 8,
            height: L.lineH - 2,
            fill: colors.accent,
            'fill-opacity': r === current ? 0.5 : 0.16,
            rx: 3,
          },
          tint,
        );
      }
      const hit = call?.looked.find((l) => l.found);
      if (hit && hit.methodLine >= 0) {
        el(
          'rect',
          {
            x: PAD + 4,
            y: rowTop(hit.methodLine) + 1,
            width: boxW - 8,
            height: L.lineH - 2,
            fill: colors.accent,
            'fill-opacity': 0.5,
            rx: 3,
          },
          tint,
        );
      }
      for (const s of call?.shadowed ?? []) {
        el(
          'rect',
          {
            x: PAD + 4,
            y: rowTop(s.line) + 1,
            width: boxW - 8,
            height: L.lineH - 2,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-dasharray': '3 3',
            rx: 3,
          },
          tint,
        );
      }

      // 클래스 테 — 지금 부름에서 들여다본 것은 테가 달라진다
      const lookedIdx = new Map<string, number>();
      call?.looked.forEach((l, i) => lookedIdx.set(l.cls, i));
      const lastLooked = call ? call.looked[call.looked.length - 1] : undefined;
      for (const c of base.classes) {
        const top = rowTop(c.first) - 3;
        const bottom = rowTop(c.last) + L.lineH + 3;
        let stroke = colors.border;
        let width = 1;
        if (lastLooked && lastLooked.cls === c.name) {
          stroke = lastLooked.found ? colors.accent : colors.itemComparing;
          width = 2.5;
        } else if (lookedIdx.has(c.name)) {
          stroke = colors.textMuted;
          width = 1.5;
        }
        el(
          'rect',
          {
            x: PAD,
            y: top,
            width: boxW,
            height: bottom - top,
            fill: 'none',
            stroke,
            'stroke-width': width,
            rx: 6,
          },
          root,
        );
      }

      // 코드 글자
      base.lines.forEach((ln, i) => {
        const isClassHead = base.classes.some((c) => c.first === i);
        label(root, textX(ln.indent), L.rowY[i] ?? TOP, ln.text, {
          size: codeSize,
          family: fonts.mono,
          fill: colors.text,
          weight: isClassHead ? '600' : undefined,
        });
      });

      // 부르는 줄 옆 — 그 부름에서 들여다본 클래스 수
      for (const c of scene.counts) {
        const ln = base.lines[c.line];
        if (!ln) continue;
        label(
          root,
          textX(ln.indent) + ln.text.length * L.charW + 14,
          L.rowY[c.line] ?? TOP,
          t('label.looked', 'looked at: {n}', { n: c.n }),
          { size: fontSizes.xs, family: fonts.body, fill: colors.textMuted },
        );
      }

      // 사슬 — 역과 이음
      const rail = el('g', {}, root);
      const passed = new Set<string>();
      const unreached = new Set<string>();
      if (call && call.looked.length > 0) {
        for (let i = 1; i < call.looked.length; i += 1) {
          passed.add(`${call.looked[i - 1].cls}>${call.looked[i].cls}`);
        }
        if (hit) {
          let c: string | null = hit.cls;
          while (c !== null) {
            const def = base.classes.find((x) => x.name === c);
            const parent: string | null = def?.parent ?? null;
            if (parent !== null) unreached.add(`${c}>${parent}`);
            c = parent;
          }
        }
      }
      for (const c of base.classes) {
        if (c.parent === null) continue;
        const y1 = L.station.get(c.name);
        const y2 = L.station.get(c.parent);
        if (y1 === undefined || y2 === undefined) continue;
        const key = `${c.name}>${c.parent}`;
        const attrs: Record<string, string | number> = {
          x1: L.railX,
          y1,
          x2: L.railX,
          y2,
          stroke: colors.border,
          'stroke-width': 2,
        };
        if (passed.has(key)) {
          attrs.stroke = colors.itemComparing;
          attrs['stroke-width'] = 3;
        } else if (unreached.has(key)) {
          attrs.stroke = colors.textMuted;
          attrs['stroke-dasharray'] = '4 4';
        }
        el('line', attrs, rail);
      }
      for (const c of base.classes) {
        const y = L.station.get(c.name);
        if (y === undefined) continue;
        el(
          'line',
          { x1: L.codeRight, y1: y, x2: L.railX, y2: y, stroke: colors.border, 'stroke-width': 1 },
          rail,
        );
        el(
          'circle',
          { cx: L.railX, cy: y, r: 5, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 },
          rail,
        );
      }

      // 객체 카드 — 사슬의 바닥. 제 클래스의 역과 이어진다
      const cardW = 96;
      const cardH = L.lineH * 2 - 4;
      for (const o of scene.objects) {
        const cy = (L.rowY[o.line] ?? TOP) + L.lineH / 2;
        const sy = L.station.get(o.cls);
        const receiving = call !== null && call.looked[0]?.cls === o.cls;
        if (sy !== undefined) {
          el(
            'line',
            {
              x1: L.railX,
              y1: cy - cardH / 2,
              x2: L.railX,
              y2: sy,
              stroke: receiving ? colors.itemComparing : colors.border,
              'stroke-width': receiving ? 3 : 2,
            },
            rail,
          );
        }
        const g = el('g', { transform: `translate(${L.railX},${round(cy)})` }, root);
        el(
          'rect',
          {
            x: -cardW / 2,
            y: -cardH / 2,
            width: cardW,
            height: cardH,
            rx: 6,
            fill: colors.bg,
            stroke: colors.text,
            'stroke-width': 1.5,
          },
          g,
        );
        label(g, 0, -cardH / 4, o.name, {
          size: codeSize,
          family: fonts.mono,
          fill: colors.text,
          anchor: 'middle',
          weight: '700',
        });
        label(g, 0, cardH / 4, o.cls, {
          size: fontSizes.xs,
          family: fonts.mono,
          fill: colors.textMuted,
          anchor: 'middle',
        });
        handles.card = g;
        handles.cardAt = { x: L.railX, y: round(cy) };
      }

      // 들여다본 표 — 있다 / 없다
      if (call) {
        call.looked.forEach((l, i) => {
          const y = L.station.get(l.cls);
          if (y === undefined) return;
          const g = el('g', {}, root);
          const text = l.found ? t('label.hit', 'found') : t('label.miss', 'not here');
          if (l.found) {
            const w = text.length * parseFloat(fontSizes.xs) * 0.62 + 14;
            el(
              'rect',
              { x: L.markX - w / 2, y: y - 18, width: w, height: 16, rx: 8, fill: colors.accent },
              g,
            );
            label(g, L.markX, y - 10, text, {
              size: fontSizes.xs,
              family: fonts.body,
              fill: colors.stateInk,
              anchor: 'middle',
              weight: '600',
            });
          } else {
            label(g, L.markX, y - 10, text, {
              size: fontSizes.xs,
              family: fonts.body,
              fill: colors.textMuted,
              anchor: 'middle',
            });
          }
          if (i === call.looked.length - 1) handles.mark = g;
        });

        // 찾는 자리 — 메서드 이름을 든 알약
        const at = lastLooked ? L.station.get(lastLooked.cls) : undefined;
        if (at !== undefined) {
          const name = `${call.method}()`;
          const w = name.length * L.charW + 16;
          const g = el('g', { transform: `translate(${L.railX},${at})` }, root);
          el(
            'rect',
            { x: -w / 2, y: -L.lineH / 2 - 1, width: w, height: L.lineH + 2, rx: L.lineH / 2, fill: colors.primary },
            g,
          );
          label(g, 0, 0, name, {
            size: codeSize,
            family: fonts.mono,
            fill: colors.textInverse,
            anchor: 'middle',
          });
          handles.pill = g;
          handles.pillAt = { x: L.railX, y: at };
        }
      }

      // 출력
      const firstTop = base.lines.findIndex((_, i) => !base.classes.some((c) => i >= c.first && i <= c.last));
      const outTop = rowTop(firstTop >= 0 ? firstTop : base.lines.length - 1);
      label(root, L.outX, outTop + L.lineH / 2, t('label.output', 'Output'), {
        size: fontSizes.xs,
        family: fonts.body,
        fill: colors.textMuted,
        weight: '600',
      });
      el(
        'line',
        {
          x1: L.outX,
          y1: outTop + L.lineH,
          x2: PIECE_CANVAS_W - PAD,
          y2: outTop + L.lineH,
          stroke: colors.border,
          'stroke-width': 1,
        },
        root,
      );
      scene.outputs.forEach((o, k) => {
        const y = round(outTop + L.lineH * (k + 1.5) + 2);
        const node = label(root, L.outX, y, o, {
          size: codeSize,
          family: fonts.mono,
          fill: colors.text,
        });
        handles.lastOut = node;
        handles.lastOutAt = { x: L.outX, y };
      });

      return handles;
    }

    function tween(ms: number, frame: (k: number) => void, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const k = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(k));
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function slide(node: Element, from: Point, to: Point, k: number): void {
      const x = round(from.x + (to.x - from.x) * k);
      const y = round(from.y + (to.y - from.y) * k);
      node.setAttribute('transform', `translate(${x},${y})`);
    }

    async function render(
      next: MethodLookupUpScene,
      _prev: MethodLookupUpScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || !next.base) return;
      const step = next.step;
      if (!step) return;
      const L = layout(next.base);

      if (step.kind === 'create' && h.card && h.cardAt) {
        const ln = next.base.lines[step.line];
        const from: Point = {
          x: PAD + INNER + ((ln?.indent ?? 0) * 4 + (ln?.text.length ?? 0)) * L.charW,
          y: h.cardAt.y,
        };
        const card = h.card;
        const to = h.cardAt;
        await tween(MOVE_MS, (k) => slide(card, from, to, k), mine);
      } else if (step.kind === 'look' && h.pill && h.pillAt) {
        let from: Point | null = null;
        if (step.from !== null) {
          const y = L.station.get(step.from);
          if (y !== undefined) from = { x: L.railX, y };
        } else if (h.cardAt) {
          from = h.cardAt;
        }
        if (from) {
          const pill = h.pill;
          const to = h.pillAt;
          const mark = h.mark;
          const start = from;
          await tween(
            MOVE_MS,
            (k) => {
              slide(pill, start, to, k);
              if (mark) {
                if (k < 1) mark.setAttribute('opacity', '0');
                else mark.removeAttribute('opacity');
              }
            },
            mine,
          );
        }
      } else if (step.kind === 'run' && h.lastOut && h.lastOutAt) {
        const ln = next.base.lines[step.line];
        const from: Point = {
          x: PAD + INNER + (ln?.indent ?? 0) * 4 * L.charW,
          y: L.rowY[step.line] ?? TOP,
        };
        const out = h.lastOut;
        const to = h.lastOutAt;
        await tween(
          MOVE_MS,
          (k) => {
            const dx = round((from.x - to.x) * (1 - k));
            const dy = round((from.y - to.y) * (1 - k));
            out.setAttribute('transform', `translate(${dx},${dy})`);
          },
          mine,
        );
      }

      if (mine === gen && !destroyed) drawStatic(next);
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
