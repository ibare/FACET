import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, categorical, fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { Side } from './algorithm.js';
import type { JankVsSlowScene, JankVsSlowSideScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CAPTION_Y = 20;
const TRACK_X0 = 20;
const TRACK_X1 = PIECE_CANVAS_W - 20;
const MARKER_R = 6;
const ANIM_MS = 350;

// 번호 줄(새 장 · 간격 · 옮긴 거리 · 초당)을 한 줄에 나란히 두면 언어에 따라
// 글자 폭이 달라 옆 칸과 겹친다(예: 프랑스어 "Déplacement"). 세로로 쌓아 폭
// 걱정 없이 전부 620px 를 쓰게 한다.
const LINE_H = 16;
const NUM_LINES = 4; // 새 장 · 간격 · 옮긴 거리 · 초당
const LANE_LABEL_OFFSET = 0;
const LANE_TRACK_OFFSET = 14;
const LANE_NUM0_OFFSET = 32;
const LANE_BLOCK_H = LANE_NUM0_OFFSET + NUM_LINES * LINE_H + 8; // 다음 레인과의 틈
const LANE1_TOP = 40;
const LANE2_TOP = LANE1_TOP + LANE_BLOCK_H;
const H = LANE2_TOP + LANE_BLOCK_H;

/** 두 쪽을 가르는 식별 색 — 카테고리 2 개(색 결정 트리 3번). 인덱스 고정. */
const SIDE_COLOR_INDEX: Record<Side, number> = { steady: 0, uneven: 1 };

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function text(
  x: number,
  y: number,
  content: string,
  fill: string,
  size: string = fontSizes.sm,
): SVGTextElement {
  const t = el('text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-family', fonts.body);
  t.setAttribute('font-size', size);
  t.setAttribute('fill', fill);
  t.textContent = content;
  return t;
}

/** 자리(px) → 트랙 위 x 좌표. */
function scaleX(pos: number, maxPos: number): number {
  const ratio = maxPos > 0 ? Math.min(1, Math.max(0, pos / maxPos)) : 0;
  return TRACK_X0 + ratio * (TRACK_X1 - TRACK_X0);
}

interface StaticConfig {
  speed: number;
  hz: number;
  lastBeat: number;
}

function readConfig(raw: Record<string, unknown> | undefined): StaticConfig {
  const speed = typeof raw?.speed === 'number' ? raw.speed : 1.2;
  const hz = typeof raw?.hz === 'number' ? raw.hz : 60;
  const lastBeat = typeof raw?.lastBeat === 'number' ? raw.lastBeat : 12;
  return { speed, hz, lastBeat };
}

function fmt1(n: number): string {
  return n.toFixed(1);
}

function laneY(side: Side): { label: number; track: number; num: (i: number) => number } {
  const top = side === 'steady' ? LANE1_TOP : LANE2_TOP;
  return {
    label: top + LANE_LABEL_OFFSET,
    track: top + LANE_TRACK_OFFSET,
    num: (i: number) => top + LANE_NUM0_OFFSET + i * LINE_H,
  };
}

const jankVsSlowStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const palette: Palette = getColors(params.theme);
    const config = readConfig(params.initialData as Record<string, unknown> | undefined);
    const maxPos = config.speed * (config.lastBeat * (1000 / config.hz));
    const sideColors = categorical(2, 'vivid');

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function cleanupAll(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    /** 그 장면의 화면 전체를 세운다. 늘 이 장면이 정본이다. */
    function drawStatic(scene: JankVsSlowScene): Record<Side, SVGCircleElement | null> {
      svg.textContent = '';
      const markers: Record<Side, SVGCircleElement | null> = { steady: null, uneven: null };

      const timeMs = fmt1(scene.k * (1000 / config.hz));
      const caption =
        scene.k === 0
          ? t('caption.start', 'Beat 0 — both sides are waiting for their first frame.')
          : t('caption.beat', 'Beat {k} — {ms} ms', { k: scene.k, ms: timeMs });
      svg.appendChild(text(20, CAPTION_Y, caption, palette.text, fontSizes.md));

      const sides: Side[] = ['steady', 'uneven'];
      for (const side of sides) {
        const s: JankVsSlowSideScene = scene[side];
        const y = laneY(side);
        const color = sideColors[SIDE_COLOR_INDEX[side]] ?? palette.primary;
        const label =
          side === 'steady' ? t('label.steady', 'Steady side') : t('label.uneven', 'Uneven side');
        svg.appendChild(text(20, y.label, label, color, fontSizes.sm));

        const track = el('line');
        track.setAttribute('x1', String(TRACK_X0));
        track.setAttribute('x2', String(TRACK_X1));
        track.setAttribute('y1', String(y.track));
        track.setAttribute('y2', String(y.track));
        track.setAttribute('stroke', palette.border);
        track.setAttribute('stroke-width', '2');
        svg.appendChild(track);

        if (s.hasFrame && s.pos !== null) {
          const marker = el('circle');
          marker.setAttribute('cx', String(scaleX(s.pos, maxPos)));
          marker.setAttribute('cy', String(y.track));
          marker.setAttribute('r', String(MARKER_R));
          marker.setAttribute('fill', color);
          svg.appendChild(marker);
          markers[side] = marker;
        }

        svg.appendChild(
          text(TRACK_X0, y.num(0), t('label.count', 'New frames: {n}', { n: s.count }), palette.textMuted),
        );
        svg.appendChild(
          text(
            TRACK_X0,
            y.num(1),
            s.interval === null
              ? t('label.intervalNone', 'Gap: —')
              : t('label.intervalValue', 'Gap: {ms} ms', { ms: fmt1(s.interval) }),
            palette.textMuted,
          ),
        );
        svg.appendChild(
          text(
            TRACK_X0,
            y.num(2),
            s.moved === null
              ? t('label.movedNone', 'Moved: —')
              : t('label.movedValue', 'Moved: {px} px', { px: s.moved }),
            palette.textMuted,
          ),
        );
        svg.appendChild(
          text(
            TRACK_X0,
            y.num(3),
            s.fps === null ? '' : t('label.fpsValue', 'Per second: {n}', { n: fmt1(s.fps) }),
            palette.textMuted,
          ),
        );
      }

      return markers;
    }

    function animateMove(marker: SVGCircleElement, from: number, to: number, mine: number): Promise<void> {
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve();
        };
        const wake = () => finish();
        waiters.add(wake);
        const start = performance.now();
        const step = (now: number) => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ratio = Math.min(1, (now - start) / ANIM_MS);
          marker.setAttribute('cx', String(from + (to - from) * ratio));
          if (ratio >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(step);
          frames.add(id);
        };
        const id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    async function render(
      next: JankVsSlowScene,
      prev: JankVsSlowScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const markers = drawStatic(next);

      if (!opts.animate || prev === null || next.step.length === 0) return;

      const movers: Array<{ side: Side; from: number; to: number }> = [];
      for (const side of next.step) {
        const prevSide = prev[side];
        const nextSide = next[side];
        if (prevSide.hasFrame && prevSide.pos !== null && nextSide.pos !== null) {
          movers.push({ side, from: scaleX(prevSide.pos, maxPos), to: scaleX(nextSide.pos, maxPos) });
        }
      }
      if (movers.length === 0) return;

      for (const m of movers) {
        const marker = markers[m.side];
        if (marker) marker.setAttribute('cx', String(m.from));
      }

      await Promise.all(
        movers.map((m) => {
          const marker = markers[m.side];
          return marker ? animateMove(marker, m.from, m.to, mine) : Promise.resolve();
        }),
      );

      if (mine === gen && !destroyed) drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      cleanupAll();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};

export { jankVsSlowStageView };
