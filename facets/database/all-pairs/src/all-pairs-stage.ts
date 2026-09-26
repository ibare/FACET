/**
 * all-pairs 무대 — 왼쪽 표의 줄 하나가 오른쪽 표의 모든 줄로 한꺼번에 가지를 뻗는다.
 *
 * 왼쪽에 FROM 쪽 표, 가운데에 CROSS JOIN 쪽 표, 오른쪽에 결과. 결과는 왼쪽 줄마다
 * 한 덩이(오른쪽 줄 수만큼의 짝 줄)로 쌓여, 덩이가 늘어나는 것으로 곱이 보인다.
 * 짝 줄의 자리는 오른쪽 표의 그 줄과 같은 높이 — 가지가 닿은 줄이 곧장 오른쪽으로 밀려 나간다.
 *
 * 운동 (퍼져 나가는 걸음)
 *   앞 절반  왼쪽 줄에서 가지 넷이 한꺼번에 자라고, 그 줄의 복사본이 가지를 타고 간다
 *   뒤 절반  복사본이 오른쪽 줄과 붙어 짝 줄이 되어 결과 덩이 자리로 미끄러진다
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { AllPairsScene } from './scene.js';

const H = 356;
const PAD = 20;
const MOTION_MS = 900;
const SPLIT = 0.5;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌표 · 크기를 글자로 만들 때 끝자리와 -0 을 걷어 낸다 */
function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

type Geometry = {
  sqlY: (i: number) => number;
  nameY: number;
  columnY: number;
  rowY: (i: number) => number;
  chipH: number;
  leftX: number;
  leftW: number;
  rightX: number;
  rightW: number;
  resultX: number;
  blockW: number;
  blockGap: number;
  sizePartW: number;
  countY: number;
  captionY: number;
};

function layout(scene: AllPairsScene): Geometry {
  const W = PIECE_CANVAS_W;
  const codePx = parseFloat(fontSizes.md);
  const lineH = Math.round(codePx * 1.35);
  const sqlTop = PAD + codePx * 0.4;
  const sqlBottom = sqlTop + lineH * Math.max(0, scene.sql.length - 1);
  const nameY = sqlBottom + 40;
  const columnY = nameY + 20;
  const rowsTop = columnY + 12;
  const countY = H - 58;
  const rowsBottom = countY - 22;
  const n = Math.max(scene.left.rows.length, scene.right.rows.length, 1);
  const pitch = Math.min(38, (rowsBottom - rowsTop) / n);
  const chipH = Math.min(28, pitch - 6);

  const leftX = PAD;
  const leftW = Math.min(64, W * 0.1);
  const rightX = Math.round(W * 0.24);
  const rightW = Math.min(96, W * 0.14);
  const resultX = Math.round(W * 0.47);
  const blockGap = 10;
  const blocks = Math.max(scene.left.rows.length, 1);
  const blockW = Math.min(150, (W - PAD - resultX - (blocks - 1) * blockGap) / blocks);
  const sizePartW = Math.round(blockW * 0.32);

  return {
    sqlY: (i) => sqlTop + i * lineH,
    nameY,
    columnY,
    rowY: (i) => rowsTop + pitch * i + pitch / 2,
    chipH,
    leftX,
    leftW,
    rightX,
    rightW,
    resultX,
    blockW,
    blockGap,
    sizePartW,
    countY,
    captionY: H - 22,
  };
}

/** 가지 — 왼쪽 줄의 오른쪽 가에서 오른쪽 줄의 왼쪽 가로 휘어 가는 곡선의 한 점 */
function branchPoint(
  g: Geometry,
  size: number,
  color: number,
  u: number,
): { x: number; y: number } {
  const x0 = g.leftX + g.leftW;
  const y0 = g.rowY(size);
  const x3 = g.rightX;
  const y3 = g.rowY(color);
  const mid = (x0 + x3) / 2;
  const v = 1 - u;
  const x = v * v * v * x0 + 3 * v * v * u * mid + 3 * v * u * u * mid + u * u * u * x3;
  const y = v * v * v * y0 + 3 * v * v * u * y0 + 3 * v * u * u * y3 + u * u * u * y3;
  return { x, y };
}

function branchPath(g: Geometry, size: number, color: number, upTo: number): string {
  const steps = 24;
  const parts: string[] = [];
  for (let k = 0; k <= steps; k += 1) {
    const p = branchPoint(g, size, color, (k / steps) * upTo);
    parts.push(`${k === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`);
  }
  return parts.join(' ');
}

export const allPairsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; family?: string; fill?: string; anchor?: string; weight?: string },
    ): void {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'central',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
    }

    /** 한 칸짜리 줄 — 표의 줄 하나 */
    function chip(
      parent: Element,
      x: number,
      cy: number,
      w: number,
      h: number,
      body: string,
      tone: { stroke: string; strokeW: number; fill: string; ink: string },
    ): void {
      el(parent, 'rect', {
        x,
        y: cy - h / 2,
        width: w,
        height: h,
        rx: 4,
        fill: tone.fill,
        stroke: tone.stroke,
        'stroke-width': tone.strokeW,
      });
      label(parent, x + w / 2, cy, body, {
        family: fonts.mono,
        size: fontSizes.sm,
        fill: tone.ink,
        anchor: 'middle',
      });
    }

    /** 결과 줄 하나 — 두 칸(왼쪽 값 | 오른쪽 값) */
    function pairRow(
      parent: Element,
      x: number,
      cy: number,
      w: number,
      sizeW: number,
      h: number,
      a: string,
      b: string,
      fresh: boolean,
    ): void {
      const stroke = fresh ? colors.itemActive : colors.border;
      el(parent, 'rect', {
        x,
        y: cy - h / 2,
        width: w,
        height: h,
        rx: 4,
        fill: colors.bg,
        stroke,
        'stroke-width': fresh ? 2 : 1,
      });
      el(parent, 'line', {
        x1: x + sizeW,
        y1: cy - h / 2,
        x2: x + sizeW,
        y2: cy + h / 2,
        stroke,
        'stroke-width': 1,
      });
      label(parent, x + sizeW / 2, cy, a, { family: fonts.mono, anchor: 'middle' });
      label(parent, x + sizeW + (w - sizeW) / 2, cy, b, { family: fonts.mono, anchor: 'middle' });
    }

    type Hold = { branches: boolean };

    /** 장면 하나의 화면 전체. hold 가 있으면 이번 걸음의 가지와 새 줄을 비워 둔다 (운동이 그린다) */
    function drawStatic(scene: AllPairsScene, hold: Hold | null): SVGGElement {
      svg.textContent = '';
      const g = layout(scene);
      const root = el(svg, 'g', {});
      const step = scene.step;
      const current = step.kind === 'spread' ? step.size : -1;
      const freshFrom = scene.result.length - (step.kind === 'spread' ? step.added : 0);

      // SQL
      scene.sql.forEach((line, i) => {
        label(root, PAD, g.sqlY(i), line, { family: fonts.mono, size: fontSizes.md });
      });

      // 표 이름 · 열 이름
      const heads: Array<[number, string, string]> = [
        [g.leftX + g.leftW / 2, scene.left.name, scene.left.column],
        [g.rightX + g.rightW / 2, scene.right.name, scene.right.column],
      ];
      for (const [x, name, column] of heads) {
        label(root, x, g.nameY, name, { family: fonts.mono, size: fontSizes.md, anchor: 'middle', weight: '600' });
        label(root, x, g.columnY, column, { family: fonts.mono, size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      }
      label(root, g.resultX, g.nameY, t('label.result', 'Result'), { size: fontSizes.md, weight: '600' });

      // 가지 — 이번 걸음에 퍼져 나간 왼쪽 줄에서 오른쪽 줄 전부로
      if (current >= 0 && !hold?.branches) {
        scene.right.rows.forEach((_, c) => {
          el(root, 'path', {
            d: branchPath(g, current, c, 1),
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 1.5,
          });
        });
      }

      // 왼쪽 표
      scene.left.rows.forEach((v, i) => {
        const spent = scene.spent.includes(i);
        const now = i === current;
        chip(root, g.leftX, g.rowY(i), g.leftW, g.chipH, v, {
          stroke: now ? colors.itemActive : colors.border,
          strokeW: now ? 2 : 1,
          fill: now ? colors.bg : colors.bgSubtle,
          ink: spent && !now ? colors.textMuted : colors.text,
        });
      });

      // 오른쪽 표 — 퍼지는 걸음에는 전부가 닿는다
      scene.right.rows.forEach((v, i) => {
        const touched = current >= 0;
        chip(root, g.rightX, g.rowY(i), g.rightW, g.chipH, v, {
          stroke: touched ? colors.itemActive : colors.border,
          strokeW: touched ? 1.5 : 1,
          fill: colors.bgSubtle,
          ink: colors.text,
        });
      });

      // 결과 — 왼쪽 줄마다 한 덩이. 덩이마다 열 이름
      scene.spent.forEach((s, b) => {
        const bx = g.resultX + b * (g.blockW + g.blockGap);
        label(root, bx + g.sizePartW / 2, g.columnY, scene.left.column, {
          family: fonts.mono,
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
        });
        label(root, bx + g.sizePartW + (g.blockW - g.sizePartW) / 2, g.columnY, scene.right.column, {
          family: fonts.mono,
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
        });
        if (hold && s === current) return;
        scene.result.forEach((p, k) => {
          if (p.size !== s) return;
          const a = scene.left.rows[p.size];
          const bv = scene.right.rows[p.color];
          if (a === undefined || bv === undefined) {
            throw new Error(`all-pairs 무대: 결과 줄 ${k} 의 짝이 표에 없다`);
          }
          pairRow(root, bx, g.rowY(p.color), g.blockW, g.sizePartW, g.chipH, a, bv, k >= freshFrom);
        });
      });

      // 결과 줄 수 — 곱이 보이게
      const used = scene.spent.length;
      const count =
        used === 0
          ? t('label.rows', 'Result rows: {rows}', { rows: scene.rows })
          : t('label.product', 'Result rows: {used} × {per} = {rows}', {
              used,
              per: scene.right.rows.length,
              rows: scene.rows,
            });
      label(root, g.resultX, g.countY, count, { size: fontSizes.md, weight: '600' });

      // 캡션 — 지금 일어나는 일
      const spreading = step.kind === 'spread' ? scene.left.rows[step.size] : undefined;
      if (step.kind === 'spread' && spreading === undefined) {
        throw new Error(`all-pairs 무대: 왼쪽 줄 ${step.size} 이 표에 없다`);
      }
      const caption =
        step.kind === 'start' || spreading === undefined
          ? t('caption.start', 'Rows in {a}: {an} · Rows in {b}: {bn}', {
              a: scene.left.name,
              an: scene.left.rows.length,
              b: scene.right.name,
              bn: scene.right.rows.length,
            })
          : t('caption.spread', 'Row {size} pairs with every row of {table} at once — new rows: {added}', {
              size: spreading,
              table: scene.right.name,
              added: step.added,
            });
      label(root, PAD, g.captionY, caption, { size: fontSizes.md, fill: colors.text });
      return root;
    }

    /** 한 시계로 흐르는 운동. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function run(mine: number, frame: (u: number) => void): Promise<void> {
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
          const u = Math.min(1, (Date.now() - start) / MOTION_MS);
          frame(u);
          if (u >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function spread(scene: AllPairsScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'spread') return;
      const root = drawStatic(scene, { branches: true });
      const g = layout(scene);
      const layer = el(root, 'g', {});
      const s = step.size;
      const sizeValue = scene.left.rows[s];
      if (sizeValue === undefined) throw new Error(`all-pairs 무대: 왼쪽 줄 ${s} 이 표에 없다`);
      const block = scene.spent.indexOf(s);
      const bx = g.resultX + block * (g.blockW + g.blockGap);
      const fresh = scene.result.slice(scene.result.length - step.added);

      await run(mine, (raw) => {
        layer.textContent = '';
        if (raw < SPLIT) {
          // 가지가 한꺼번에 자라고, 왼쪽 줄의 복사본이 가지 끝을 타고 간다
          const u = ease(raw / SPLIT);
          for (const p of fresh) {
            el(layer, 'path', {
              d: branchPath(g, s, p.color, u),
              fill: 'none',
              stroke: colors.itemActive,
              'stroke-width': 1.5,
            });
            const at = branchPoint(g, s, p.color, u);
            chip(layer, at.x - g.sizePartW / 2, at.y, g.sizePartW, g.chipH, sizeValue, {
              stroke: colors.itemActive,
              strokeW: 1.5,
              fill: colors.bg,
              ink: colors.text,
            });
          }
          return;
        }
        // 복사본이 오른쪽 줄과 붙어 짝 줄이 되어 결과 덩이로 미끄러진다
        const u = ease((raw - SPLIT) / (1 - SPLIT));
        for (const p of fresh) {
          el(layer, 'path', {
            d: branchPath(g, s, p.color, 1),
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 1.5,
          });
          const colorValue = scene.right.rows[p.color];
          if (colorValue === undefined) throw new Error(`all-pairs 무대: 오른쪽 줄 ${p.color} 이 표에 없다`);
          const fromX = g.rightX - g.sizePartW;
          const fromW = g.sizePartW + g.rightW;
          const x = fromX + (bx - fromX) * u;
          const w = fromW + (g.blockW - fromW) * u;
          const sizeW = g.sizePartW;
          pairRow(layer, x, g.rowY(p.color), w, sizeW, g.chipH, sizeValue, colorValue, true);
        }
      });
    }

    return {
      render(next: AllPairsScene, _prev: AllPairsScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind !== 'spread') {
          drawStatic(next, null);
          return;
        }
        return spread(next, mine).then(() => {
          if (destroyed || mine !== gen) return;
          drawStatic(next, null);
        });
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
