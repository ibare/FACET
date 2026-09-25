/**
 * chain-of-blocks 무대 — 읽는 자리가 FAT 표의 칸에서 칸으로 건너간다.
 *
 * 위: 디렉터리 항목 (파일 이름 · 첫 번호). 가운데: FAT 칸 한 줄 — 칸 i 는 블록 i 의 다음 번호.
 * 그 위로 지금까지 건너간 자취가 호로 남는다. 아래: 같은 번호 열에 선 데이터 블록 — 읽은 블록에
 * 조각 차례가 찍힌다. 다음 번호는 블록 안이 아니라 표에 있다는 것이 두 줄의 갈림으로 보인다.
 *
 * 운동은 하나다 — 읽는 자리(점)가 앞 칸(처음엔 디렉터리)에서 이번 칸으로 호를 타고 건너간다.
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
import type { ChainScene } from './scene.js';

const H = 320;
const SIDE = 16;
/** 칸 폭 상한 — 칸이 적으면 이 폭에서 멈추고 가운데로 모은다 */
const CELL_MAX = 44;
const GAP = 4;

const DIR_LABEL_Y = 16;
const DIR_TOP = 24;
const DIR_H = 28;
const NAME_W = 64;
const NUM_W = 30;
const ENTRY_GAP = 14;

const FAT_TOP = 150;
const CELL_H = 34;
const INDEX_Y = FAT_TOP + CELL_H + 16;
const DISK_TOP = INDEX_Y + 8;
const DISK_LABEL_Y = DISK_TOP + CELL_H + 16;
const CAPTION_Y = H - 34;
const CAPTION2_Y = H - 12;

/** 호의 꼭대기 높이 상한 — 디렉터리 줄에 닿지 않게 */
const ARC_PEAK_MAX = 84;
const HOP_MS = 650;
const CURSOR_R = 6;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

function r1(v: number): string {
  const n = Math.round(v * 10) / 10;
  return String(n === 0 ? 0 : n);
}

function bez(c: Curve, u: number): Pt {
  const [a, b, d, e] = c;
  const v = 1 - u;
  const k0 = v * v * v;
  const k1 = 3 * v * v * u;
  const k2 = 3 * v * u * u;
  const k3 = u * u * u;
  return {
    x: k0 * a.x + k1 * b.x + k2 * d.x + k3 * e.x,
    y: k0 * a.y + k1 * b.y + k2 * d.y + k3 * e.y,
  };
}

/** 곡선의 0..upTo 구간을 꺾은선 경로로 */
function curvePath(c: Curve, upTo: number): string {
  const segs = 28;
  const parts: string[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const p = bez(c, (upTo * i) / segs);
    parts.push(`${i === 0 ? 'M' : 'L'}${r1(p.x)} ${r1(p.y)}`);
  }
  return parts.join(' ');
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const chainOfBlocksStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

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
        node.setAttribute(k, typeof v === 'number' ? r1(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      content: string,
      attrs: Record<string, string | number>,
    ): void {
      const node = el(parent, 'text', { x, y, ...attrs });
      node.textContent = content;
    }

    // ---- 자리 셈 (캔버스에서 역산) ----
    function columns(n: number): { cw: number; x0: number } {
      const cw = Math.min(CELL_MAX, (PIECE_CANVAS_W - 2 * SIDE) / n);
      return { cw, x0: (PIECE_CANVAS_W - cw * n) / 2 };
    }

    function entryX(i: number, x0: number): number {
      return x0 + i * (NAME_W + NUM_W + ENTRY_GAP);
    }

    function cellTop(i: number, cw: number, x0: number): Pt {
      return { x: x0 + (i + 0.5) * cw, y: FAT_TOP };
    }

    function dirPoint(scene: ChainScene, x0: number): Pt | null {
      const idx = scene.entries.findIndex((e) => e.id === scene.follow);
      if (idx < 0) return null;
      return { x: entryX(idx, x0) + NAME_W + NUM_W / 2, y: DIR_TOP + DIR_H };
    }

    function hopCurve(from: Pt, to: Pt, fromDir: boolean): Curve {
      if (fromDir) {
        return [from, { x: from.x, y: from.y + 44 }, { x: to.x, y: to.y - 52 }, to];
      }
      const peak = Math.min(ARC_PEAK_MAX, 12 + Math.abs(to.x - from.x) * 0.17);
      const cy = from.y - (peak * 4) / 3;
      return [from, { x: from.x, y: cy }, { x: to.x, y: cy }, to];
    }

    /** 자취의 호 전부 — i 번째 호는 path[i] 로 건너온 것 */
    function hops(scene: ChainScene, cw: number, x0: number): Curve[] {
      const out: Curve[] = [];
      const dir = dirPoint(scene, x0);
      scene.path.forEach((b, i) => {
        const to = cellTop(b, cw, x0);
        if (i === 0) {
          if (dir) out.push(hopCurve(dir, to, true));
          return;
        }
        const prevBlock = scene.path[i - 1];
        if (prevBlock === undefined) return;
        out.push(hopCurve(cellTop(prevBlock, cw, x0), to, false));
      });
      return out;
    }

    function arrowHead(parent: Element, c: Curve, color: string): void {
      const tip = bez(c, 1);
      const back = bez(c, 0.94);
      const dx = tip.x - back.x;
      const dy = tip.y - back.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const s = 6;
      const a = { x: tip.x - ux * s - uy * s * 0.6, y: tip.y - uy * s + ux * s * 0.6 };
      const b = { x: tip.x - ux * s + uy * s * 0.6, y: tip.y - uy * s - ux * s * 0.6 };
      el(parent, 'path', {
        d: `M${r1(tip.x)} ${r1(tip.y)} L${r1(a.x)} ${r1(a.y)} L${r1(b.x)} ${r1(b.y)} Z`,
        fill: color,
      });
    }

    /**
     * 장면 전체를 세운다. `hop` 은 이번 걸음의 건너감이 얼마나 왔는가 (1 = 다 옴).
     * 1 보다 작으면 이번 칸의 도착 표시(칸 강조 · 블록의 조각 차례)는 아직 없다.
     */
    function draw(scene: ChainScene, hop: number): void {
      svg.textContent = '';
      const n = scene.fat.length;
      if (n === 0) return;
      const { cw, x0 } = columns(n);
      const step = scene.step;
      const arriving = step.kind === 'read' && hop < 1;
      const current = step.kind === 'read' && !arriving ? step.block : null;
      const shownPath = arriving ? scene.path.slice(0, -1) : scene.path;
      const pieceOf = new Map<number, number>();
      shownPath.forEach((b, i) => pieceOf.set(b, i + 1));

      // 디렉터리
      write(svg, x0, DIR_LABEL_Y, t('label.dir', 'Directory'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      scene.entries.forEach((e, i) => {
        const x = entryX(i, x0);
        const on = scene.started && e.id === scene.follow;
        el(svg, 'rect', {
          x,
          y: DIR_TOP,
          width: NAME_W,
          height: DIR_H,
          fill: colors.bg,
          stroke: on ? colors.itemActive : colors.border,
          'stroke-width': on ? 2 : 1,
        });
        el(svg, 'rect', {
          x: x + NAME_W,
          y: DIR_TOP,
          width: NUM_W,
          height: DIR_H,
          fill: on ? colors.accent : colors.bgSubtle,
          stroke: on ? colors.itemActive : colors.border,
          'stroke-width': on ? 2 : 1,
        });
        write(svg, x + NAME_W / 2, DIR_TOP + DIR_H / 2, e.id, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: colors.text,
        });
        write(svg, x + NAME_W + NUM_W / 2, DIR_TOP + DIR_H / 2, String(e.first), {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': on ? 700 : 400,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: on ? colors.stateInk : colors.text,
        });
      });

      // FAT 칸 줄
      write(svg, x0, FAT_TOP - 8, t('label.fat', 'FAT'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      scene.fat.forEach((v, i) => {
        const x = x0 + i * cw + GAP / 2;
        const w = cw - GAP;
        const passed = pieceOf.has(i) && i !== current;
        const isCurrent = i === current;
        el(svg, 'rect', {
          x,
          y: FAT_TOP,
          width: w,
          height: CELL_H,
          fill: passed || isCurrent ? colors.bgSubtle : colors.bg,
          stroke: isCurrent ? colors.itemActive : passed ? colors.primary : colors.border,
          'stroke-width': isCurrent ? 2.5 : passed ? 1.5 : 1,
          ...(v === null ? { 'stroke-dasharray': '3 3' } : {}),
        });
        if (v !== null) {
          write(svg, x + w / 2, FAT_TOP + CELL_H / 2, String(v), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': isCurrent ? 700 : 400,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: colors.text,
          });
        }
        write(svg, x0 + (i + 0.5) * cw, INDEX_Y, String(i), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: colors.textMuted,
        });
      });

      // 데이터 블록 줄 — 같은 번호 열
      scene.fat.forEach((_v, i) => {
        const x = x0 + i * cw + GAP / 2;
        const w = cw - GAP;
        const piece = pieceOf.get(i);
        const isCurrent = i === current;
        el(svg, 'rect', {
          x,
          y: DISK_TOP,
          width: w,
          height: CELL_H,
          rx: 3,
          fill: piece !== undefined ? colors.primary : colors.bgSubtle,
          stroke: isCurrent ? colors.itemActive : colors.border,
          'stroke-width': isCurrent ? 2.5 : 1,
        });
        if (piece !== undefined) {
          write(svg, x + w / 2, DISK_TOP + CELL_H / 2, String(piece), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: colors.textInverse,
          });
        }
      });
      write(svg, x0, DISK_LABEL_Y, t('label.blocks', 'Data blocks (piece order)'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });

      // 자취의 호 — 다 온 것은 화살촉까지, 오는 중인 것은 온 만큼
      const curves = hops(scene, cw, x0);
      curves.forEach((c, i) => {
        const last = i === curves.length - 1;
        const upTo = last && arriving ? hop : 1;
        el(svg, 'path', {
          d: curvePath(c, upTo),
          fill: 'none',
          stroke: colors.primary,
          'stroke-width': last ? 2 : 1.4,
          'stroke-linecap': 'round',
          opacity: last ? 1 : 0.7,
        });
        if (upTo >= 1) arrowHead(svg, c, colors.primary);
      });

      // 읽는 자리
      let cursor: Pt | null = null;
      if (step.kind === 'start') cursor = dirPoint(scene, x0);
      if (step.kind === 'read') {
        const c = curves[curves.length - 1];
        cursor = c ? bez(c, arriving ? hop : 1) : cellTop(step.block, cw, x0);
      }
      if (cursor) {
        el(svg, 'circle', {
          cx: cursor.x,
          cy: cursor.y,
          r: CURSOR_R,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1.5,
        });
      }

      // 캡션 — 지금 일어나는 일만
      const cap = { 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text };
      const sub = { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted };
      if (step.kind === 'ready') {
        write(svg, x0, CAPTION_Y, t('caption.ready', 'To read {file}, start at the directory.', { file: scene.follow }), cap);
      } else if (step.kind === 'start') {
        write(svg, x0, CAPTION_Y, t('caption.start', 'Directory entry {file}: first block {n}.', { file: step.file, n: step.first }), cap);
      } else if (!arriving) {
        if (step.next === 'END') {
          write(
            svg,
            x0,
            CAPTION_Y,
            t('caption.end', 'Piece {k} is block {b}. FAT[{b}] holds END: the chain stops.', {
              k: step.piece,
              b: step.block,
            }),
            cap,
          );
        } else {
          write(
            svg,
            x0,
            CAPTION_Y,
            t('caption.next', 'Piece {k} is block {b}. FAT[{b}] holds the next number: {next}.', {
              k: step.piece,
              b: step.block,
              next: step.next,
            }),
            cap,
          );
        }
        write(svg, x0, CAPTION2_Y, t('caption.read', 'FAT cells read before this piece: {n}', { n: step.readBefore }), sub);
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
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
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(easeInOut(p));
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

    return {
      async render(next: ChainScene, _prev: ChainScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moving = opts.animate && next.step.kind === 'read';
        draw(next, moving ? 0 : 1);
        if (!moving) return;
        await tween(HOP_MS, mine, (p) => draw(next, p));
        if (mine !== gen || destroyed) return;
        draw(next, 1);
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
