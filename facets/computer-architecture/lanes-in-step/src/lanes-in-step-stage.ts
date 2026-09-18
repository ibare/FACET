/**
 * 차선을 나란히 — stage.
 *
 * 위는 스칼라, 아래는 SIMD. 두 쪽이 같은 a · b 를 세로 셈(a 위, b 아래, 줄 긋고 c)으로
 * 놓는다. 명령 하나는 막대 하나다 — 막대가 덮은 열의 a · b 복제본을 c 줄로 밀어 내린다.
 * 스칼라의 막대는 한 열 폭, SIMD 의 막대는 차선 수만큼 넓다. 두 막대는 한 시계로 함께
 * 내려오므로, 같은 동안 한쪽은 한 칸, 다른 쪽은 네 칸이 채워진다.
 *
 * 원본 a · b 는 제자리에 남는다. 움직이는 것은 복제본과 막대다.
 */
import {
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
} from '@ffacet/core/runtime';
import type { LanesInStepScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 320;
/** 왼쪽 띠 — 쪽 이름 · 명령 수 · 명령 눈금 */
const LEFT = 104;
/** 줄 이름(a · b · c) 자리 */
const ROW_NAME_W = 22;
const RIGHT = 10;
/** 열 간격 상한 — 원소가 적어도 칸이 지나치게 커지지 않게 */
const PITCH_MAX = 72;
const ROW_H = 26;
const ROW_GAP = 4;
/** b 줄과 c 줄 사이 — 복제본이 떨어지는 거리 */
const DROP = 28;
const PANEL_TOPS = [22, 158] as const;
const CAPTION_Y = H - 18;
const BAR_H = 6;
const MOTION_MS = 700;
const FRAME_MS = 16;

type Side = 'scalar' | 'simd';

type Geometry = {
  n: number;
  x0: number;
  pitch: number;
  cellW: number;
};

function r(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function geometry(n: number): Geometry {
  const x0 = LEFT + ROW_NAME_W;
  const avail = PIECE_CANVAS_W - x0 - RIGHT;
  const pitch = Math.min(PITCH_MAX, avail / Math.max(n, 1));
  const gap = Math.min(8, pitch * 0.14);
  return { n, x0, pitch, cellW: pitch - gap };
}

function rowsOf(top: number): { aY: number; bY: number; cY: number } {
  const aY = top;
  const bY = aY + ROW_H + ROW_GAP;
  const cY = bY + ROW_H + DROP;
  return { aY, bY, cY };
}

function cellX(g: Geometry, i: number): number {
  return g.x0 + i * g.pitch;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  }
  return node;
}

function label(
  x: number,
  y: number,
  content: string,
  opts: { fill: string; size: string; family: string; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el('text', {
    x,
    y,
    fill: opts.fill,
    'font-size': opts.size,
    'font-family': opts.family,
    'text-anchor': opts.anchor ?? 'start',
  });
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = content;
  return node;
}

/** 이번 걸음에 이 쪽이 민 열들. 없으면 빈 배열 */
function pushedColumns(scene: LanesInStepScene, side: Side): number[] {
  const step = scene.step;
  if (!step || step.kind !== 'beat') return [];
  if (side === 'scalar') return step.scalar === null ? [] : [step.scalar];
  if (!step.simd) return [];
  const cols: number[] = [];
  for (let k = 0; k < step.simd.count; k += 1) cols.push(step.simd.start + k);
  return cols;
}

function sameC(scene: LanesInStepScene): boolean {
  if (scene.scalarC.length !== scene.simdC.length) return false;
  return scene.scalarC.every((v, i) => v !== null && v === scene.simdC[i]);
}

function narrow(initialData: Record<string, unknown> | undefined): void {
  // 이 stage 는 initialData 에서 읽는 것이 없다 — 바탕은 init 이벤트가 장면으로 가져온다.
  // 좁히개는 형태만 확인해 둔다.
  if (initialData && initialData.type !== 'lanes-in-step') {
    throw new Error('lanes-in-step-stage: initialData.type 이 lanes-in-step 이 아니다');
  }
}

/** 한 쪽 칸 묶음 — 움직임이 손댈 손잡이 */
type PanelHandles = {
  /** 이번 걸음에 채워진 c 칸들 (열 순서) */
  freshC: SVGGElement[];
  bar: SVGRectElement | null;
};

export const lanesInStepStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance & SceneRenderer<LanesInStepScene> {
    narrow(params.initialData);
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawPanel(
      scene: LanesInStepScene,
      side: Side,
      top: number,
      g: Geometry,
    ): PanelHandles {
      const layer = el('g', {});
      svg.appendChild(layer);
      const { aY, bY, cY } = rowsOf(top);
      const c = side === 'scalar' ? scene.scalarC : scene.simdC;
      const issued = side === 'scalar' ? scene.scalarIssued : scene.simdIssued;
      const pushed = pushedColumns(scene, side);
      const done = scene.step?.kind === 'done';
      const matched = done && sameC(scene);

      // 왼쪽 띠: 쪽 이름 · 명령 수 · 명령 눈금
      const title =
        side === 'scalar'
          ? t('label.scalar', 'Scalar')
          : t('label.simd', 'SIMD · {width} lanes', { width: scene.width });
      layer.appendChild(
        label(0, aY + 13, title, {
          fill: colors.text,
          size: fontSizes.md,
          family: fonts.body,
          weight: '600',
        }),
      );
      layer.appendChild(
        label(0, aY + 32, t('label.issued', 'instructions: {n}', { n: issued }), {
          fill: colors.textMuted,
          size: fontSizes.xs,
          family: fonts.body,
        }),
      );
      const tickPitch = Math.min(11, (LEFT - 12) / Math.max(g.n, 1));
      const tick = tickPitch * 0.72;
      for (let k = 0; k < issued; k += 1) {
        layer.appendChild(
          el('rect', {
            x: k * tickPitch,
            y: aY + 40,
            width: tick,
            height: tick,
            rx: 1.5,
            fill: colors.itemActive,
          }),
        );
      }

      // 줄 이름
      const names: Array<[string, number]> = [
        [t('label.a', 'a'), aY],
        [t('label.b', 'b'), bY],
        [t('label.c', 'c'), cY],
      ];
      for (const [name, y] of names) {
        layer.appendChild(
          label(g.x0 - 8, y + ROW_H / 2 + 4, name, {
            fill: colors.textMuted,
            size: fontSizes.sm,
            family: fonts.mono,
            anchor: 'end',
          }),
        );
      }

      // SIMD 레지스터 — 차선 width 개를 한 통으로 두른다
      if (side === 'simd') {
        for (let start = 0; start < g.n; start += scene.width) {
          const end = Math.min(start + scene.width, g.n) - 1;
          for (const y of [aY, bY, cY]) {
            layer.appendChild(
              el('rect', {
                x: cellX(g, start) - 3,
                y: y - 3,
                width: cellX(g, end) + g.cellW - cellX(g, start) + 6,
                height: ROW_H + 6,
                rx: 5,
                fill: 'none',
                stroke: colors.border,
                'stroke-width': 1,
              }),
            );
          }
        }
      }

      // 합 줄 — 세로 셈의 긋는 선
      const lineY = bY + ROW_H + DROP / 2;
      layer.appendChild(
        el('line', {
          x1: g.x0,
          y1: lineY,
          x2: cellX(g, g.n - 1) + g.cellW,
          y2: lineY,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // a · b 원본 — 제자리에 남는다
      for (let i = 0; i < g.n; i += 1) {
        for (const [y, v] of [
          [aY, scene.a[i]!],
          [bY, scene.b[i]!],
        ] as const) {
          layer.appendChild(
            el('rect', {
              x: cellX(g, i),
              y,
              width: g.cellW,
              height: ROW_H,
              rx: 4,
              fill: colors.bgSubtle,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
          layer.appendChild(
            label(cellX(g, i) + g.cellW / 2, y + ROW_H / 2 + 4, String(v), {
              fill: colors.text,
              size: fontSizes.sm,
              family: fonts.mono,
              anchor: 'middle',
            }),
          );
        }
      }

      // c
      const freshC: SVGGElement[] = [];
      for (let i = 0; i < g.n; i += 1) {
        const v = c[i];
        const cell = el('g', {});
        layer.appendChild(cell);
        if (v === null || v === undefined) {
          cell.appendChild(
            el('rect', {
              x: cellX(g, i),
              y: cY,
              width: g.cellW,
              height: ROW_H,
              rx: 4,
              fill: 'none',
              stroke: colors.border,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            }),
          );
          continue;
        }
        const fresh = pushed.includes(i);
        cell.appendChild(
          el('rect', {
            x: cellX(g, i),
            y: cY,
            width: g.cellW,
            height: ROW_H,
            rx: 4,
            fill: colors.bg,
            stroke: matched ? colors.success : fresh ? colors.itemActive : colors.primary,
            'stroke-width': fresh || matched ? 2 : 1.25,
          }),
        );
        cell.appendChild(
          label(cellX(g, i) + g.cellW / 2, cY + ROW_H / 2 + 4, String(v), {
            fill: colors.text,
            size: fontSizes.sm,
            family: fonts.mono,
            anchor: 'middle',
            weight: '600',
          }),
        );
        if (fresh) freshC.push(cell);
      }

      // 명령 막대 — 이번 걸음에 민 열들 위에, 끝 자리(c 줄 바로 위)에 머문다
      let bar: SVGRectElement | null = null;
      if (pushed.length > 0) {
        const first = pushed[0]!;
        const last = pushed[pushed.length - 1]!;
        bar = el('rect', {
          x: cellX(g, first),
          y: cY - BAR_H - 3,
          width: cellX(g, last) + g.cellW - cellX(g, first),
          height: BAR_H,
          rx: 3,
          fill: colors.itemActive,
        });
        layer.appendChild(bar);
      }
      return { freshC, bar };
    }

    function caption(scene: LanesInStepScene): string {
      const step = scene.step;
      if (!step) return '';
      if (step.kind === 'init') {
        return t('caption.init', 'Both sides compute c = a + b over {n} elements.', {
          n: scene.a.length,
        });
      }
      if (step.kind === 'beat') {
        const beat = step.beat + 1;
        if (step.simd && step.scalar !== null) {
          return t(
            'caption.both',
            'Instruction {beat}: scalar adds c[{i}]; SIMD adds c[{from}..{to}] together.',
            { beat, i: step.scalar, from: step.simd.start, to: step.simd.start + step.simd.count - 1 },
          );
        }
        if (step.scalar !== null) {
          return t(
            'caption.scalarOnly',
            'Instruction {beat}: scalar adds c[{i}]. SIMD has nothing left to add.',
            { beat, i: step.scalar },
          );
        }
        return '';
      }
      if (sameC(scene)) {
        return t('caption.doneSame', 'Same c on both sides. Scalar: {scalar} instructions · SIMD: {simd}.', {
          scalar: step.scalar,
          simd: step.simd,
        });
      }
      return t('caption.doneDiffer', 'The two c rows differ. Scalar: {scalar} instructions · SIMD: {simd}.', {
        scalar: step.scalar,
        simd: step.simd,
      });
    }

    function drawStatic(scene: LanesInStepScene): Record<Side, PanelHandles> | null {
      svg.textContent = '';
      if (!scene.step || scene.a.length === 0) return null;
      const g = geometry(scene.a.length);
      const handles = {
        scalar: drawPanel(scene, 'scalar', PANEL_TOPS[0], g),
        simd: drawPanel(scene, 'simd', PANEL_TOPS[1], g),
      };
      svg.appendChild(
        label(PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene), {
          fill: colors.text,
          size: fontSizes.md,
          family: fonts.body,
          anchor: 'middle',
        }),
      );
      return handles;
    }

    /** 한 시계 — 프레임 수로 센다. destroy 되면 곧바로 풀린다 */
    function tween(mine: number, onFrame: (p: number) => void): Promise<void> {
      const frames = Math.max(1, Math.ceil(MOTION_MS / FRAME_MS));
      return new Promise<void>((resolve) => {
        let k = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          k += 1;
          const p = Math.min(1, k / frames);
          onFrame(p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    /** 한 쪽의 복제본 — a · b 에서 떼어 c 로 떨어뜨릴 것 */
    function makeCopies(
      scene: LanesInStepScene,
      side: Side,
      top: number,
      g: Geometry,
    ): { layer: SVGGElement; a: SVGGElement[]; b: SVGGElement[]; aY: number; bY: number; cY: number } {
      const { aY, bY, cY } = rowsOf(top);
      const layer = el('g', {});
      svg.appendChild(layer);
      const a: SVGGElement[] = [];
      const b: SVGGElement[] = [];
      for (const i of pushedColumns(scene, side)) {
        for (const [y, v, bucket] of [
          [aY, scene.a[i]!, a],
          [bY, scene.b[i]!, b],
        ] as const) {
          const grp = el('g', {});
          grp.appendChild(
            el('rect', {
              x: cellX(g, i),
              y,
              width: g.cellW,
              height: ROW_H,
              rx: 4,
              fill: colors.bg,
              stroke: colors.itemActive,
              'stroke-width': 1.5,
            }),
          );
          grp.appendChild(
            label(cellX(g, i) + g.cellW / 2, y + ROW_H / 2 + 4, String(v), {
              fill: colors.text,
              size: fontSizes.sm,
              family: fonts.mono,
              anchor: 'middle',
            }),
          );
          layer.appendChild(grp);
          bucket.push(grp);
        }
      }
      return { layer, a, b, aY, bY, cY };
    }

    async function push(scene: LanesInStepScene, mine: number): Promise<void> {
      const handles = drawStatic(scene);
      if (!handles) return;
      const g = geometry(scene.a.length);
      const sides: Array<[Side, number]> = [
        ['scalar', PANEL_TOPS[0]],
        ['simd', PANEL_TOPS[1]],
      ];
      const moving = sides.map(([side, top]) => ({
        handles: handles[side],
        copies: makeCopies(scene, side, top, g),
      }));

      const frame = (p: number): void => {
        for (const { handles: h, copies } of moving) {
          const { aY, bY, cY } = copies;
          // 막대: a 줄 위에서 출발해 c 줄 위 끝 자리까지. 정적 그림이 끝 자리에 세워 두었다
          const barFrom = aY - BAR_H - 3;
          const barTo = cY - BAR_H - 3;
          if (h.bar) h.bar.setAttribute('transform', `translate(0 ${r((barFrom - barTo) * (1 - p))})`);
          // a 복제본은 cY - aY 를, b 복제본은 cY - bY 를 내려간다. 아직 못 온 만큼만 위에 있다
          for (const node of copies.a) node.setAttribute('transform', `translate(0 ${r((cY - aY) * p)})`);
          for (const node of copies.b) node.setAttribute('transform', `translate(0 ${r((cY - bY) * p)})`);
          // 두 복제본이 c 칸에 닿으며 합이 드러난다
          const reveal = p < 0.75 ? 0 : (p - 0.75) / 0.25;
          const fade = 1 - reveal;
          for (const node of [...copies.a, ...copies.b]) node.setAttribute('opacity', String(r(fade)));
          for (const cell of h.freshC) cell.setAttribute('opacity', String(r(reveal)));
        }
      };
      frame(0);
      await tween(mine, frame);
    }

    return {
      async render(next: LanesInStepScene, _prev: LanesInStepScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step?.kind !== 'beat') {
          drawStatic(next);
          return;
        }
        await push(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
