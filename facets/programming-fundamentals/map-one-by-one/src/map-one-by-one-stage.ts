/**
 * map-one-by-one 무대.
 *
 * 동사는 "지나며 바뀐다". 원소 하나가 들어간 목록의 제 자리에서 **복제되어** 내려와 함수 칸 하나를
 * 지나고, 그 안에서 값이 바뀐 채 새 목록의 **같은 차례 자리**로 내려가 선다. 함수 칸은 하나뿐이라
 * 넷이 모두 같은 함수를 지나고, 나갈 때는 저마다 제 줄(세로)로 돌아간다 — 자리가 섞이지 않는다.
 * 원본은 제 자리에 남는다.
 *
 * 정적 그리기가 정본이다. 운동은 아직 못 온 자리를 비워 둔 채 그 위를 흐르고, 끝나면 다시 그린다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { MapOneByOneScene, MapValue } from './scene.js';

const H = 412;
const PAD = 20;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 고정폭 글꼴의 글자 폭 / 글꼴 크기 */
const MONO_RATIO = 0.6;
const CELL_MAX_W = 76;

const MS_LIST = 560;
const MS_ITEM = 900;
const MS_SHOW = 500;

type Hide = { nums?: boolean; out?: number; output?: boolean };

type Layout = {
  codePx: number;
  valPx: number;
  codeCharW: number;
  valCharW: number;
  lineH: number;
  codeBase: (i: number) => number;
  left: number;
  right: number;
  colX: (i: number) => number;
  cellW: number;
  cellH: number;
  idxY: number;
  numsY: number;
  boxTop: number;
  boxH: number;
  chipY: number;
  tensY: number;
  tensIdxY: number;
  outY: number;
  captionY: number;
};

function fmt(v: MapValue): string {
  return Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
}

/** 목록 글자 `[a, b, …]` 안에서 원소 k 가 가운데 오는 글자 자리 (0 부터, 반 칸 단위). */
function charCenter(values: number[], k: number): number {
  let at = 1;
  for (let j = 0; j < k; j += 1) at += String(values[j]).length + 2;
  return at + String(values[k]).length / 2;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function r2(n: number): string {
  const v = Math.round(n * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
}

function layout(scene: MapOneByOneScene, n: number): Layout {
  const codePx = parseFloat(fontSizes.sm);
  const valPx = parseFloat(fontSizes.md);
  const codeCharW = codePx * MONO_RATIO;
  const valCharW = valPx * MONO_RATIO;
  const lineH = Math.round(codePx * 1.5);
  const codeTop = 26;
  const codeEnd = codeTop + Math.max(0, scene.lines.length - 1) * lineH;

  const names = [...scene.lists.map((l) => l.name), scene.map?.into ?? ''];
  const nameChars = Math.max(4, ...names.map((s) => s.length));
  const left = PAD + nameChars * codeCharW + 24;
  const right = PIECE_CANVAS_W - PAD;
  const cols = Math.max(1, n);
  const colW = (right - left) / cols;
  const cellW = Math.min(CELL_MAX_W, colW * 0.62);
  const cellH = Math.round(valPx * 2.6);

  const idxY = codeEnd + 26;
  const numsY = idxY + 30;
  const boxTop = numsY + 44;
  const boxH = 70;
  const chipY = boxTop + 46;
  const tensY = boxTop + boxH + 44;
  const tensIdxY = tensY + 34;
  const outY = tensIdxY + 30;

  return {
    codePx,
    valPx,
    codeCharW,
    valCharW,
    lineH,
    codeBase: (i) => codeTop + i * lineH,
    left,
    right,
    colX: (i) => left + colW * (i + 0.5),
    cellW,
    cellH,
    idxY,
    numsY,
    boxTop,
    boxH,
    chipY,
    tensY,
    tensIdxY,
    outY,
    captionY: H - 18,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? r2(v) : v);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function sourceRow(scene: MapOneByOneScene): { name: string; values: number[] } | null {
  if (scene.map && scene.map.source !== null) {
    const hit = scene.lists.find((l) => l.name === scene.map?.source);
    if (hit) return hit;
  }
  return scene.lists[0] ?? null;
}

function columns(scene: MapOneByOneScene): number {
  return Math.max(sourceRow(scene)?.values.length ?? 0, scene.map?.outs.length ?? 0);
}

function currentLine(scene: MapOneByOneScene): number {
  return scene.step.kind === 'start' ? -1 : scene.step.line;
}

function caption(scene: MapOneByOneScene, t: Translate): string {
  const s = scene.step;
  if (s.kind === 'start') return scene.lines.length > 0 ? t('caption.start', 'Nothing has run yet.') : '';
  if (s.kind === 'assign') {
    const row = scene.lists.find((l) => l.name === s.name);
    return t('caption.assign', 'List {name}, length {count}.', { name: s.name, count: row?.values.length ?? 0 });
  }
  if (s.kind === 'item') {
    return t('caption.item', 'Position {index}: in {input}, out {output} → {into}[{index}]', {
      index: s.index,
      input: s.input,
      output: s.output,
      into: scene.map?.into ?? '',
    });
  }
  const out = scene.output;
  return t('caption.show', 'Items in: {inCount} · items out: {outCount}', {
    inCount: sourceRow(scene)?.values.length ?? 0,
    outCount: Array.isArray(out) ? out.length : 0,
  });
}

export const mapOneByOneStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function chip(parent: Element, x: number, y: number, L: Layout, label: string, stroke: string): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${r2(x)} ${r2(y)})` });
      el(g, 'rect', {
        x: -L.cellW / 2,
        y: -L.cellH / 2,
        width: L.cellW,
        height: L.cellH,
        rx: 6,
        fill: colors.bg,
        stroke,
        'stroke-width': 2,
      });
      el(
        g,
        'text',
        {
          x: 0,
          y: L.valPx * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        label,
      );
      return g;
    }

    function cell(parent: Element, x: number, y: number, L: Layout, label: string | null, stroke: string, width: number, dashed: boolean): void {
      el(parent, 'rect', {
        x: x - L.cellW / 2,
        y: y - L.cellH / 2,
        width: L.cellW,
        height: L.cellH,
        rx: 6,
        fill: dashed ? 'none' : colors.bgSubtle,
        stroke,
        'stroke-width': width,
        ...(dashed ? { 'stroke-dasharray': '4 4' } : {}),
      });
      if (label !== null) {
        el(
          parent,
          'text',
          {
            x,
            y: y + L.valPx * 0.36,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: colors.text,
          },
          label,
        );
      }
    }

    function drawStatic(scene: MapOneByOneScene, hide: Hide = {}): void {
      svg.textContent = '';
      if (scene.lines.length === 0) return;
      const L = layout(scene, columns(scene));
      const cur = currentLine(scene);
      const step = scene.step;

      // 프로그램
      scene.lines.forEach((ln, i) => {
        const y = L.codeBase(i);
        if (i === cur) {
          el(svg, 'rect', { x: PAD - 10, y: y - L.codePx * 0.9, width: 3, height: L.codePx * 1.2, rx: 1.5, fill: colors.primary });
        }
        el(
          svg,
          'text',
          {
            x: PAD + ln.indent * 4 * L.codeCharW,
            y,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: cur === -1 || i === cur ? colors.text : colors.textMuted,
          },
          ln.text,
        );
      });

      // 들어가는 목록 — 원본은 끝까지 제 자리에 있다
      const src = sourceRow(scene);
      if (src && !hide.nums) {
        el(svg, 'text', { x: PAD, y: L.numsY + L.codePx * 0.36, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text }, src.name);
        src.values.forEach((v, i) => {
          const x = L.colX(i);
          el(svg, 'text', { x, y: L.idxY, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted }, String(i));
          const active = step.kind === 'item' && step.index === i;
          cell(svg, x, L.numsY, L, String(v), active ? colors.itemComparing : colors.border, active ? 2 : 1, false);
        });
      }

      // 함수 칸 하나와 새 목록
      const run = scene.map;
      if (run) {
        const fnW = Math.max(run.fn.length * L.codeCharW + 40, L.cellW + 60);
        const cx = (L.left + L.right) / 2;
        el(svg, 'rect', {
          x: cx - fnW / 2,
          y: L.boxTop,
          width: fnW,
          height: L.boxH,
          rx: 10,
          fill: colors.bg,
          stroke: colors.primary,
          'stroke-width': 1.5,
        });
        el(
          svg,
          'text',
          { x: cx, y: L.boxTop + 18, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text },
          run.fn,
        );

        el(svg, 'text', { x: PAD, y: L.tensY + L.codePx * 0.36, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text }, run.into);
        run.outs.forEach((v, i) => {
          const x = L.colX(i);
          el(svg, 'text', { x, y: L.tensIdxY, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted }, String(i));
          const empty = v === null || hide.out === i;
          const landed = step.kind === 'item' && step.index === i;
          if (empty) cell(svg, x, L.tensY, L, null, colors.border, 1, true);
          else cell(svg, x, L.tensY, L, String(v), colors.primary, landed ? 2.5 : 1, false);
        });
      }

      // 출력
      if (scene.output !== null && !hide.output) {
        el(svg, 'text', { x: PAD, y: L.outY, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted }, t('label.output', 'Output'));
        el(svg, 'text', { x: L.left, y: L.outY, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: colors.text }, fmt(scene.output));
      }

      const cap = caption(scene, t);
      if (cap) {
        el(svg, 'text', { x: PIECE_CANVAS_W / 2, y: L.captionY, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }, cap);
      }
    }

    /** 진행률 p(0→1) 로 그린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, ms: number, draw: (p: number) => void): Promise<void> {
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

    const live = (mine: number): boolean => mine === gen && !destroyed;

    async function render(next: MapOneByOneScene, _prev: MapOneByOneScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || next.lines.length === 0) {
        drawStatic(next);
        return;
      }
      const L = layout(next, columns(next));

      if (step.kind === 'assign') {
        const row = next.lists.find((l) => l.name === step.name);
        const src = sourceRow(next);
        if (!row || !src || src.name !== row.name) {
          drawStatic(next);
          return;
        }
        // 목록이 코드 글자에서 떨어져 나와 제 자리로 내려앉는다
        drawStatic(next, { nums: true });
        const ln = next.lines[step.line];
        const at = ln ? ln.text.indexOf(fmt(row.values)) : -1;
        const codeX = PAD + (ln?.indent ?? 0) * 4 * L.codeCharW;
        const fromY = L.codeBase(step.line) - L.codePx * 0.35;
        const small = L.codePx / L.valPx;
        const chips = row.values.map((v, k) => {
          const fromX = at >= 0 ? codeX + (at + charCenter(row.values, k)) * L.codeCharW : codeX;
          return { g: chip(svg, fromX, fromY, L, String(v), colors.border), fromX, toX: L.colX(k) };
        });
        const lag = 60;
        await tween(mine, MS_LIST, (p) => {
          chips.forEach((c, k) => {
            const span = MS_LIST - lag * (chips.length - 1);
            const q = ease(Math.max(0, Math.min(1, (p * MS_LIST - lag * k) / span)));
            const s = lerp(small, 1, q);
            c.g.setAttribute('transform', `translate(${r2(lerp(c.fromX, c.toX, q))} ${r2(lerp(fromY, L.numsY, q))}) scale(${r2(s)})`);
          });
        });
        if (!live(mine)) return;
        drawStatic(next);
        return;
      }

      if (step.kind === 'item') {
        // 제 자리에서 복제되어 함수 칸을 지나고, 같은 차례 자리로 내려선다
        drawStatic(next, { out: step.index });
        const x0 = L.colX(step.index);
        const cx = (L.left + L.right) / 2;
        const g = chip(svg, x0, L.numsY, L, String(step.input), colors.itemComparing);
        const rect = g.querySelector('rect');
        const label = g.querySelector('text');
        let switched = false;
        await tween(mine, MS_ITEM, (p) => {
          let x: number;
          let y: number;
          let s = 1;
          if (p < 0.4) {
            const q = ease(p / 0.4);
            x = lerp(x0, cx, q);
            y = lerp(L.numsY, L.chipY, q);
          } else if (p < 0.6) {
            const q = (p - 0.4) / 0.2;
            x = cx;
            y = L.chipY;
            s = 1 + 0.15 * Math.sin(Math.PI * q);
            if (q >= 0.5 && !switched) {
              switched = true;
              if (label) label.textContent = String(step.output);
              if (rect) rect.setAttribute('stroke', colors.primary);
            }
          } else {
            const q = ease((p - 0.6) / 0.4);
            x = lerp(cx, x0, q);
            y = lerp(L.chipY, L.tensY, q);
          }
          g.setAttribute('transform', `translate(${r2(x)} ${r2(y)}) scale(${r2(s)})`);
        });
        if (!live(mine)) return;
        drawStatic(next);
        return;
      }

      if (step.kind === 'show' && Array.isArray(next.output) && next.map) {
        // 새 목록의 값들이 출력 줄로 내려가 글자가 된다
        const values = next.output;
        drawStatic(next, { output: true });
        const moving = values.map((v, k) => {
          const node = el(
            svg,
            'text',
            { x: 0, y: 0, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: colors.text },
            String(v),
          );
          const toX = L.left + charCenter(values, k) * L.valCharW;
          return { node, fromX: L.colX(k), toX };
        });
        const fromY = L.tensY + L.valPx * 0.36;
        await tween(mine, MS_SHOW, (p) => {
          const q = ease(p);
          for (const m of moving) {
            m.node.setAttribute('x', r2(lerp(m.fromX, m.toX, q)));
            m.node.setAttribute('y', r2(lerp(fromY, L.outY, q)));
          }
        });
        if (!live(mine)) return;
        drawStatic(next);
        return;
      }

      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
