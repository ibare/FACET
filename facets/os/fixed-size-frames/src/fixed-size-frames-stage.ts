/**
 * fixed-size-frames 무대.
 *
 * 동사: 잘려 흩어져 들어간다.
 *   - 위 줄은 프로세스 한 덩어리. 잘리는 걸음에서 같은 길이로 갈라져 틈이 벌어진다.
 *   - 아래 줄은 메모리 칸. 넣는 걸음마다 페이지 하나가 위 줄의 제자리에서 떨어져
 *     서로 떨어진 빈 칸 하나로 날아 들어간다. 떠난 자리에는 윤곽만 남는다.
 *   - 마지막 페이지는 칸보다 짧아 칸의 남은 몫이 빈 윤곽으로 드러난다.
 *
 * 크기는 캔버스 폭에서 역산한다 — 위 줄과 아래 줄이 같은 KiB 눈금을 써서,
 * 잘린 조각의 길이가 칸의 길이와 같다는 것이 눈으로 맞아떨어진다.
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
} from '@ffacet/core/runtime';
import type { FixedSizeFramesScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 300;
const W = PIECE_CANVAS_W;

/** 왼쪽 줄 이름 칸 폭 */
const LABEL_COL = 92;
const PAD_RIGHT = 12;
/** 1 KiB 의 가로 길이 상한 */
const KIB_PX_MAX = 24;
const CELL_H = 52;
const STRIP_Y = 44;
const MEM_Y = 178;
const CAPTION_Y = 286;
const CUT_MS = 520;
const DROP_MS = 720;

function r1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size: string; fill: string; anchor?: string; weight?: number; family?: string },
): SVGTextElement {
  const node = el(
    'text',
    {
      x: r1(x),
      y: r1(y),
      'font-size': opts.size,
      'font-family': opts.family ?? fonts.body,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
      ...(opts.weight ? { 'font-weight': opts.weight } : {}),
    },
    parent,
  );
  node.textContent = body;
  return node;
}

interface Geometry {
  kibPx: number;
  frameW: number;
  gap: number;
}

function geometry(scene: FixedSizeFramesScene): Geometry {
  const totalKib = scene.frameCount * scene.pageKib;
  const kibPx = Math.min(KIB_PX_MAX, (W - LABEL_COL - PAD_RIGHT) / totalKib);
  const frameW = scene.pageKib * kibPx;
  const gap = Math.min(12, frameW * 0.16);
  return { kibPx, frameW, gap };
}

/** 잘린 뒤 위 줄에서 페이지의 왼쪽 끝 */
function stripX(g: Geometry, page: number, loKib: number): number {
  return LABEL_COL + loKib * g.kibPx + page * g.gap;
}

function frameX(g: Geometry, frame: number): number {
  return LABEL_COL + frame * g.frameW;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

export const fixedSizeFramesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /** 이번 그리기에서 만든 손잡이 — 운동이 옮길 것들 */
    let stripPieces = new Map<number, SVGGElement>();
    let memPieces = new Map<number, SVGGElement>();

    function drawStatic(scene: FixedSizeFramesScene): void {
      svg.textContent = '';
      stripPieces = new Map();
      memPieces = new Map();
      const g = geometry(scene);
      const sm = fontSizes.sm;
      const md = fontSizes.md;

      // 줄 이름
      label(svg, 8, STRIP_Y + CELL_H / 2 - 9, t('label.process', 'Process {id}', { id: scene.processId }), {
        size: sm,
        fill: colors.text,
        weight: 600,
      });
      label(svg, 8, STRIP_Y + CELL_H / 2 + 9, t('label.size', '{n} KiB', { n: scene.sizeKib }), {
        size: sm,
        fill: colors.textMuted,
      });
      label(svg, 8, MEM_Y + CELL_H / 2, t('label.memory', 'Memory', {}), {
        size: sm,
        fill: colors.text,
        weight: 600,
      });
      label(svg, 8, MEM_Y + CELL_H + 16, t('label.frames', 'Frame', {}), {
        size: sm,
        fill: colors.textMuted,
      });

      // 메모리 칸
      const memLayer = el('g', {}, svg);
      for (let f = 0; f < scene.frameCount; f += 1) {
        const x = frameX(g, f);
        const owner = scene.owners[f] ?? null;
        el(
          'rect',
          {
            x: r1(x + 1),
            y: MEM_Y,
            width: r1(g.frameW - 2),
            height: CELL_H,
            rx: 3,
            fill: owner === null ? colors.bg : colors.bgSubtle,
            stroke: owner === null ? colors.textMuted : colors.border,
            'stroke-width': 1,
            ...(owner === null ? { 'stroke-dasharray': '4 3' } : {}),
          },
          memLayer,
        );
        if (owner !== null) {
          label(memLayer, x + g.frameW / 2, MEM_Y + CELL_H / 2, owner, {
            size: md,
            fill: colors.textMuted,
            anchor: 'middle',
            family: fonts.mono,
          });
        }
        label(svg, x + g.frameW / 2, MEM_Y + CELL_H + 16, String(f), {
          size: sm,
          fill: colors.textMuted,
          anchor: 'middle',
          family: fonts.mono,
        });
      }

      const placedAt = new Map<number, number>();
      for (const p of scene.placed) placedAt.set(p.page, p.frame);
      const current = scene.step.kind === 'place' ? scene.step.page : null;

      // 위 줄 — 아직 안 잘렸으면 한 덩어리
      const stripLayer = el('g', {}, svg);
      if (scene.pieces.length === 0) {
        el(
          'rect',
          {
            x: LABEL_COL + 1,
            y: STRIP_Y,
            width: r1(scene.sizeKib * g.kibPx - 2),
            height: CELL_H,
            rx: 3,
            fill: colors.primary,
          },
          stripLayer,
        );
        label(stripLayer, LABEL_COL + (scene.sizeKib * g.kibPx) / 2, STRIP_Y + CELL_H / 2, scene.processId, {
          size: md,
          fill: colors.textInverse,
          anchor: 'middle',
          family: fonts.mono,
          weight: 600,
        });
        tick(LABEL_COL, 0);
        tick(LABEL_COL + scene.sizeKib * g.kibPx, scene.sizeKib);
      } else {
        for (const piece of scene.pieces) {
          const x = stripX(g, piece.page, piece.loKib);
          const w = (piece.hiKib - piece.loKib) * g.kibPx;
          const gone = placedAt.has(piece.page);
          const grp = el('g', {}, stripLayer);
          el(
            'rect',
            {
              x: r1(x + 1),
              y: STRIP_Y,
              width: r1(w - 2),
              height: CELL_H,
              rx: 3,
              fill: gone ? colors.bg : colors.primary,
              stroke: gone ? (current === piece.page ? colors.accent : colors.primary) : colors.primary,
              'stroke-width': gone && current === piece.page ? 2 : 1,
              ...(gone ? { 'stroke-dasharray': '4 3' } : {}),
            },
            grp,
          );
          label(grp, x + w / 2, STRIP_Y + CELL_H / 2, String(piece.page), {
            size: md,
            fill: gone ? colors.textMuted : colors.textInverse,
            anchor: 'middle',
            family: fonts.mono,
            weight: 600,
          });
          if (!gone) stripPieces.set(piece.page, grp);
          tick(x, piece.loKib);
        }
        const last = scene.pieces[scene.pieces.length - 1];
        if (last) tick(stripX(g, last.page, last.loKib) + (last.hiKib - last.loKib) * g.kibPx, last.hiKib);
      }

      // 들어간 페이지
      const placedLayer = el('g', {}, svg);
      for (const p of scene.placed) {
        const piece = scene.pieces.find((x) => x.page === p.page);
        if (!piece) throw new Error(`fixed-size-frames 무대: 페이지 ${p.page} 가 조각에 없다`);
        const x = frameX(g, p.frame);
        const w = (piece.hiKib - piece.loKib) * g.kibPx;
        const grp = el('g', {}, placedLayer);
        el(
          'rect',
          {
            x: r1(x + 1),
            y: MEM_Y,
            width: r1(w - 2),
            height: CELL_H,
            rx: 3,
            fill: colors.primary,
            stroke: current === p.page ? colors.accent : colors.primary,
            'stroke-width': current === p.page ? 2 : 1,
          },
          grp,
        );
        label(grp, x + w / 2, MEM_Y + CELL_H / 2, String(p.page), {
          size: md,
          fill: colors.textInverse,
          anchor: 'middle',
          family: fonts.mono,
          weight: 600,
        });
        memPieces.set(p.page, grp);
      }

      // 캡션 — 지금 일어나는 일만
      label(svg, W / 2, CAPTION_Y, caption(scene), {
        size: md,
        fill: colors.text,
        anchor: 'middle',
      });

      function tick(x: number, kib: number): void {
        label(stripLayer, x, STRIP_Y + CELL_H + 14, String(kib), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
          family: fonts.mono,
        });
      }
    }

    function caption(scene: FixedSizeFramesScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        const free = scene.owners.filter((o) => o === null).length;
        return t('caption.start', 'Process {id}: {size} KiB. Free frames: {free}.', {
          id: scene.processId,
          size: scene.sizeKib,
          free,
        });
      }
      if (step.kind === 'cut') {
        return t('caption.cut', 'Cut every {page} KiB. Pages: {n}.', {
          page: scene.pageKib,
          n: scene.pieces.length,
        });
      }
      const piece = scene.pieces.find((x) => x.page === step.page);
      if (!piece) throw new Error(`fixed-size-frames 무대: 페이지 ${step.page} 가 조각에 없다`);
      const used = piece.hiKib - piece.loKib;
      if (used < scene.pageKib) {
        return t('caption.placeShort', 'Page {page} → frame {frame}. Used {used} KiB, unused {slack} KiB.', {
          page: step.page,
          frame: step.frame,
          used,
          slack: scene.pageKib - used,
        });
      }
      return t('caption.place', 'Page {page} → free frame {frame}.', {
        page: step.page,
        frame: step.frame,
      });
    }

    /** 한 시계로 진행률을 흘린다. destroy 되면 곧바로 풀린다. */
    function tween(ms: number, mine: number, draw: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let frameId = 0;
        const finish = (): void => {
          if (done) return;
          done = true;
          frames.delete(frameId);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tickFrame = (now: number): void => {
          frames.delete(frameId);
          if (destroyed || mine !== gen) return finish();
          const u = Math.min(1, Math.max(0, (now - start) / ms));
          draw(easeInOut(u));
          if (u >= 1) return finish();
          frameId = requestAnimationFrame(tickFrame);
          frames.add(frameId);
        };
        frameId = requestAnimationFrame(tickFrame);
        frames.add(frameId);
      });
    }

    async function render(
      next: FixedSizeFramesScene,
      _prev: FixedSizeFramesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;
      const g = geometry(next);
      const step = next.step;

      if (step.kind === 'cut') {
        // 조각이 제 자리(틈 벌어진 곳)까지 아직 못 온 만큼 왼쪽에 둔다
        const moves = [...stripPieces.entries()];
        const set = (u: number): void => {
          for (const [page, grp] of moves) {
            grp.setAttribute('transform', `translate(${r1(-(1 - u) * page * g.gap)},0)`);
          }
        };
        set(0);
        await tween(CUT_MS, mine, set);
      } else if (step.kind === 'place') {
        const grp = memPieces.get(step.page);
        const piece = next.pieces.find((x) => x.page === step.page);
        if (grp && piece) {
          const dx = stripX(g, piece.page, piece.loKib) - frameX(g, step.frame);
          const dy = STRIP_Y - MEM_Y;
          const set = (u: number): void => {
            const k = 1 - u;
            // 위로 살짝 떴다가 떨어지는 호
            const lift = -Math.sin(Math.PI * u) * 18;
            grp.setAttribute('transform', `translate(${r1(dx * k)},${r1(dy * k + (u > 0 && u < 1 ? lift : 0))})`);
          };
          set(0);
          await tween(DROP_MS, mine, set);
        }
      }

      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
