/**
 * 1비트 예측기 stage — 한 칸짜리 기억(타일)이 결과 열 위를 건너가며 짐작을 떨어뜨리고,
 * 틀릴 때마다 그 자리에서 뒤집힌다.
 *
 * 동사는 "뒤집힌다". 타일은 실제로 납작해졌다가 반대 면으로 펴진다. 뒤집힌 타일이 다음
 * 칸으로 건너가 그 면을 그대로 짐작으로 떨어뜨리므로, 한 번 뒤집힌 탓에 다음 분기가
 * 어긋나는 것이 이어진 운동으로 보인다. 이어진 두 틀림은 틀림 표시 아래 호로 묶는다.
 *
 * 정적 그리기는 자취(`judged` · `memory`)에서만 파생한다. 운동은 그 끝 자리에 아직 못 온
 * 만큼만 그린다.
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
} from '@ffacet/core/runtime';
import type { Bit } from './algorithm.js';
import { isChainedMiss, type OneBitScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 290;
const W = PIECE_CANVAS_W;

/** 행 이름이 끝나는 x 와 칸 열이 시작하는 x */
const LABEL_X = 70;
const GRID_X0 = 82;
const GRID_PAD_R = 14;
/** 반복문 사이 틈 — 칸 간격에 대한 비 */
const LOOP_GAP = 0.6;

const Y_LEGEND = 18;
const Y_MEMORY = 60;
const Y_GUESS = 116;
const Y_OUTCOME = 158;
const Y_MARK = 198;
const Y_BRACKET = 240;
const Y_CAPTION = 278;

/** 칸 크기 상한 */
const CELL_MAX = 34;
const TILE_MAX = 40;

const SLIDE_MS = 260;
const DROP_MS = 300;
const FLIP_MS = 360;

/** 캡션 한 글자 폭 어림 (px) — 넘치면 textLength 로 눌러 담는다 */
const CAPTION_CHAR_W = 6.4;

type Geometry = {
  pitch: number;
  cell: number;
  tile: number;
  /** 칸 중심 x */
  xs: number[];
  /** 반복문마다 [첫 칸, 끝 칸] */
  loops: [number, number][];
};

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'dominant-baseline': 'middle', ...attrs });
  node.textContent = body;
  return node;
}

/** 결과 열을 반복문으로 가른다 — N(안 탄다)이 한 반복문의 끝이다 */
function loopsOf(outcomes: readonly Bit[]): [number, number][] {
  const out: [number, number][] = [];
  let first = 0;
  for (const [i, b] of outcomes.entries()) {
    if (b === 'N' || i === outcomes.length - 1) {
      out.push([first, i]);
      first = i + 1;
    }
  }
  return out;
}

function geometryOf(outcomes: readonly Bit[]): Geometry {
  const n = Math.max(outcomes.length, 1);
  const loops = loopsOf(outcomes);
  const gaps = Math.max(loops.length - 1, 0);
  const pitch = (W - GRID_X0 - GRID_PAD_R) / (n + LOOP_GAP * gaps);
  const xs: number[] = [];
  for (const [g, [a, b]] of loops.entries()) {
    for (let i = a; i <= b; i += 1) {
      xs.push(GRID_X0 + pitch * (i + LOOP_GAP * g) + pitch / 2);
    }
  }
  return {
    pitch,
    cell: Math.min(pitch * 0.78, CELL_MAX),
    tile: Math.min(pitch * 0.92, TILE_MAX),
    xs,
    loops,
  };
}

function narrow(initialData: unknown): { outcomes: Bit[] } {
  const d =
    typeof initialData === 'object' && initialData !== null
      ? (initialData as Record<string, unknown>)
      : {};
  const outcomes = Array.isArray(d.outcomes)
    ? d.outcomes.filter((b): b is Bit => b === 'T' || b === 'N')
    : [];
  return { outcomes };
}

export const oneBitDoubleFaultStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance & SceneRenderer<OneBitScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [colorT, colorN] = categorical(2, 'vivid');
    const bitColor = (b: Bit): string => (b === 'T' ? (colorT ?? colors.accent) : (colorN ?? colors.primary));
    const sym = (b: Bit): string => (b === 'T' ? t('sym.T', 'T') : t('sym.N', 'N'));

    const base = narrow(params.initialData);
    let geo = geometryOf(base.outcomes);
    let geoKey = base.outcomes.join('');

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 매번 새로 짓는 손잡이 — 운동이 만진다 */
    type Handles = {
      tile: SVGGElement | null;
      tileRect: SVGRectElement | null;
      tileText: SVGTextElement | null;
      chip: SVGGElement | null;
      mark: SVGGElement | null;
      arc: SVGPathElement | null;
    };
    let handles: Handles = { tile: null, tileRect: null, tileText: null, chip: null, mark: null, arc: null };

    function ensureGeometry(outcomes: readonly Bit[]): void {
      const key = outcomes.join('');
      if (key !== geoKey) {
        geo = geometryOf(outcomes);
        geoKey = key;
      }
    }

    function drawTile(parent: Element, x: number, bit: Bit): Handles['tile'] {
      const g = el(parent, 'g', { transform: `translate(${r(x)} ${Y_MEMORY})` });
      const s = geo.tile;
      const rect = el(g, 'rect', {
        x: -s / 2,
        y: -s / 2,
        width: s,
        height: s,
        rx: 6,
        fill: bitColor(bit),
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      const text = label(g, 0, 1, sym(bit), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      handles.tileRect = rect;
      handles.tileText = text;
      return g;
    }

    function drawChip(parent: Element, x: number, bit: Bit): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${r(x)} ${Y_GUESS})` });
      const s = geo.cell * 0.82;
      el(g, 'rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: 5, fill: bitColor(bit) });
      label(g, 0, 1, sym(bit), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      return g;
    }

    function drawMark(parent: Element, x: number, hit: boolean): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${r(x)} ${Y_MARK})` });
      if (hit) {
        el(g, 'circle', { cx: 0, cy: 0, r: 7, fill: 'none', stroke: colors.text, 'stroke-width': 2 });
      } else {
        const a = 7;
        el(g, 'path', {
          d: `M ${-a} ${-a} L ${a} ${a} M ${a} ${-a} L ${-a} ${a}`,
          stroke: colors.danger,
          'stroke-width': 2.5,
          fill: 'none',
        });
      }
      return g;
    }

    function arcPath(i: number): string {
      const x1 = geo.xs[i - 1] ?? 0;
      const x2 = geo.xs[i] ?? 0;
      const y = Y_MARK + 11;
      return `M ${r(x1)} ${y} Q ${r((x1 + x2) / 2)} ${y + 22} ${r(x2)} ${y}`;
    }

    function captionOf(scene: OneBitScene): string {
      const step = scene.step;
      if (step.kind === 'init') return t('caption.init', 'Memory starts at {bit}.', { bit: sym(scene.start) });
      if (step.kind === 'done' && scene.tally !== null) {
        return t('caption.done', 'Misses: {misses} of {total}. Right after a flip: {chained}.', {
          misses: scene.tally.misses,
          total: scene.tally.total,
          chained: scene.tally.chained,
        });
      }
      if (step.kind === 'branch') {
        const j = scene.judged[step.index];
        if (j === undefined) return '';
        const vars = {
          n: step.index + 1,
          guess: sym(j.guess),
          outcome: sym(j.outcome),
          bit: sym(j.outcome),
        };
        if (j.hit) {
          return t('caption.hit', 'Branch {n}: guess {guess}, actual {outcome} — right. Memory stays {bit}.', vars);
        }
        if (isChainedMiss(scene.judged, step.index)) {
          return t(
            'caption.missAgain',
            'Branch {n}: the flipped memory guesses {guess}, actual {outcome} — wrong again. Flips to {bit}.',
            vars,
          );
        }
        return t('caption.miss', 'Branch {n}: guess {guess}, actual {outcome} — wrong. Memory flips to {bit}.', vars);
      }
      return '';
    }

    function drawStatic(scene: OneBitScene): void {
      ensureGeometry(scene.outcomes);
      svg.textContent = '';
      handles = { tile: null, tileRect: null, tileText: null, chip: null, mark: null, arc: null };

      label(svg, GRID_X0, Y_LEGEND, t('legend', 'T = taken · N = not taken'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });

      const rowLabel = (y: number, body: string): void => {
        label(svg, LABEL_X, y, body, {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      };
      rowLabel(Y_MEMORY, t('row.memory', 'memory'));
      rowLabel(Y_GUESS, t('row.guess', 'guess'));
      rowLabel(Y_OUTCOME, t('row.outcome', 'actual'));

      const current = scene.judged.length - 1;

      // 결과 열
      const cells = el(svg, 'g', {});
      for (const [i, b] of scene.outcomes.entries()) {
        const x = geo.xs[i] ?? 0;
        const s = geo.cell;
        const seen = i <= current;
        el(cells, 'rect', {
          x: x - s / 2,
          y: Y_OUTCOME - s / 2,
          width: s,
          height: s,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: i === current ? colors.accent : colors.border,
          'stroke-width': i === current ? 2.5 : 1,
        });
        el(cells, 'rect', {
          x: x - s / 2 + 3,
          y: Y_OUTCOME + s / 2 - 5,
          width: s - 6,
          height: 3,
          fill: bitColor(b),
          opacity: seen ? 1 : 0.35,
        });
        label(cells, x, Y_OUTCOME - 1, sym(b), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': seen ? 700 : 400,
          fill: seen ? colors.text : colors.textMuted,
        });
      }

      // 반복문 묶음
      const loopsG = el(svg, 'g', {});
      for (const [g, [a, b]] of geo.loops.entries()) {
        const xa = (geo.xs[a] ?? 0) - geo.cell / 2;
        const xb = (geo.xs[b] ?? 0) + geo.cell / 2;
        el(loopsG, 'path', {
          d: `M ${r(xa)} ${Y_BRACKET - 5} L ${r(xa)} ${Y_BRACKET} L ${r(xb)} ${Y_BRACKET} L ${r(xb)} ${Y_BRACKET - 5}`,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        });
        label(loopsG, (xa + xb) / 2, Y_BRACKET + 11, t('label.pass', 'pass {k}', { k: g + 1 }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // 짐작 · 맞음/틀림 · 이어진 틀림
      const judgedG = el(svg, 'g', {});
      for (const [i, j] of scene.judged.entries()) {
        const x = geo.xs[i] ?? 0;
        const chip = drawChip(judgedG, x, j.guess);
        const mark = drawMark(judgedG, x, j.hit);
        let arc: SVGPathElement | null = null;
        if (isChainedMiss(scene.judged, i)) {
          arc = el(judgedG, 'path', {
            d: arcPath(i),
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': 1.5,
          });
        }
        if (i === current) {
          handles.chip = chip;
          handles.mark = mark;
          handles.arc = arc;
        }
      }

      // 기억 타일 — 지금 분기 칸 위에 선다
      const tileCol = Math.max(current, 0);
      if (scene.outcomes.length > 0 && scene.step.kind !== 'idle') {
        handles.tile = drawTile(svg, geo.xs[tileCol] ?? 0, scene.memory);
      }

      const caption = captionOf(scene);
      if (caption !== '') {
        const node = label(svg, W / 2, Y_CAPTION, caption, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        const room = W - 2 * GRID_PAD_R;
        if (caption.length * CAPTION_CHAR_W > room) {
          node.setAttribute('textLength', String(room));
          node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      }
    }

    function flow(total: number, mine: number, frame: (ms: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ms = Math.min(total, performance.now() - start);
          frame(ms);
          if (ms >= total) {
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

    const ease = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : 1 - (1 - k) * (1 - k));

    async function playBranch(scene: OneBitScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'branch') return;
      const { tile, tileRect, tileText, chip, mark, arc } = handles;
      if (tile === null || tileRect === null || tileText === null || chip === null || mark === null) return;

      const i = step.index;
      const toX = geo.xs[i] ?? 0;
      const fromX = geo.xs[i - 1] ?? toX;
      const arcLen = arc !== null ? Math.hypot((geo.xs[i] ?? 0) - (geo.xs[i - 1] ?? 0), 0) * 1.3 : 0;
      const total = SLIDE_MS + DROP_MS + (step.flipped ? FLIP_MS : 0);

      const showFace = (b: Bit): void => {
        tileRect.setAttribute('fill', bitColor(b));
        tileText.textContent = sym(b);
      };

      const frame = (ms: number): void => {
        // 1) 타일이 앞 칸에서 건너온다 — 짐작한 면(was)을 보인 채
        const kSlide = ease(ms / SLIDE_MS);
        const x = fromX + (toX - fromX) * kSlide;
        // 2) 짐작이 타일에서 떨어져 짐작 줄에 앉는다
        const kDrop = ease((ms - SLIDE_MS) / DROP_MS);
        const chipY = Y_MEMORY + (Y_GUESS - Y_MEMORY) * kDrop;
        chip.setAttribute('transform', `translate(${r(toX)} ${r(chipY)})`);
        if (ms < SLIDE_MS) chip.setAttribute('visibility', 'hidden');
        else chip.removeAttribute('visibility');
        // 3) 결과를 본 뒤 맞음/틀림이 서고, 틀렸으면 타일이 뒤집힌다
        const judgedNow = ms >= SLIDE_MS + DROP_MS;
        if (judgedNow) mark.removeAttribute('visibility');
        else mark.setAttribute('visibility', 'hidden');
        let sy = 1;
        if (step.flipped) {
          const kFlip = (ms - SLIDE_MS - DROP_MS) / FLIP_MS;
          if (kFlip < 0.5) {
            showFace(step.was);
            sy = 1 - ease(Math.max(kFlip, 0) * 2);
          } else {
            showFace(scene.memory);
            sy = ease((kFlip - 0.5) * 2);
          }
          if (arc !== null) {
            const k = Math.max(0, Math.min(1, kFlip));
            arc.setAttribute('stroke-dasharray', `${r(arcLen)} ${r(arcLen)}`);
            arc.setAttribute('stroke-dashoffset', String(r(arcLen * (1 - k))));
          }
        } else {
          showFace(step.was);
        }
        tile.setAttribute('transform', `translate(${r(x)} ${Y_MEMORY}) scale(1 ${r(Math.max(sy, 0.02))})`);
      };

      frame(0);
      await flow(total, mine, frame);
    }

    return {
      async render(next: OneBitScene, _prev: OneBitScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'branch') {
          await playBranch(next, mine);
          if (destroyed || mine !== gen) return;
          drawStatic(next);
        }
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
