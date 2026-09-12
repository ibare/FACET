/**
 * silent-truncation-stage — 그릇보다 넓은 수를 담고, 테두리 밖 자리가 떨어지는 것을 그린다.
 *
 * ── 형태는 동사에서 나왔다
 *
 * 가로는 값이 흘러가는 축이다. 새 값은 왼쪽에서 들어오고, 다 담긴 값은 오른쪽으로
 * 나간다. 세로는 두 갈래로 갈린다 — **그릇 안으로 내려가는 것은 바닥에 닿아 멈추고,
 * 테두리 밖에서 내려가는 것은 받쳐 줄 바닥이 없어 캔버스 밖까지 간다.** 두 내림의
 * 차이가 이 조각이 하는 말 전부다.
 *
 * 그래서 그릇은 가운데 놓이지 않는다. 16자리 띠를 캔버스 폭에 맞춰 펴면 8자리 그릇은
 * 그 오른쪽 절반밖에 덮지 못하고, 덮지 못한 왼쪽 절반이 곧 벼랑이다. 이 어긋남은
 * 다듬을 결함이 아니라 보여야 할 사실이다.
 *
 * 떨어지는 자리에는 아무 표시도 하지 않는다. 색도 바꾸지 않고 경고도 띄우지 않는다 —
 * 알려 주는 것이 없다는 것이 주장이므로, 화면이 미리 알려 주면 그 주장이 무너진다.
 * 자리의 운명을 말하는 것은 그 아래에 바닥이 있는가뿐이다.
 *
 * 세로는 이 파일이 정하고, 가로는 러너가 PIECE_CANVAS_W 로 정한다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 칸 크기는 캔버스에서 역산한다. 상수는 상한과 최소 여백일 뿐 (S-piece). */
const CELL_MAX_W = 36;
const SIDE_MIN = 24;
const CELL_H = 38;

const CAPTION_Y = 24;
const MARK_Y = 60;
/** 띠가 처음 서는 자리 (칸 위쪽). */
const HOME_Y = 76;
/** 그릇 안 슬롯의 위쪽. */
const SLOT_Y = 166;
const KEPT_Y = 254;
/** 그릇 테두리와 비트 칸 사이. */
const RIM = 15;

const DESCEND_DY = SLOT_Y - HOME_Y;
/** 캔버스 밖까지 — 받쳐 줄 바닥이 없다는 것을 끝까지 보인다. */
const FALL_DY = 210;
const FALL_DX = -40;
const FALL_TILT = 10;

const SLIDE_MS = 420;
const DESCEND_MS = 480;
const FALL_MS = 560;
const EXIT_MS = 320;

export type TruncationScene = {
  /** 그릇의 비트 폭. */
  width: number;
  /** 원래 값을 세던 비트 폭. */
  from: number;
};

/**
 * initialData 를 좁힌다. 받는 자리가 mount 이고 projector 가 없어도 반드시 불리는
 * 유일한 경로이므로 좁히개도 여기 둔다 (S-piece).
 */
export function readScene(data: unknown): TruncationScene {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const from = typeof d.from === 'number' && d.from > 0 ? d.from : 16;
  const width = typeof d.width === 'number' && d.width > 0 ? d.width : 8;
  return { from, width: Math.min(width, from) };
}

export const silentTruncationStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const { from, width } = readScene(params.initialData);

    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / from));
    const stripW = cellW * from;
    const originX = Math.round((W - stripW) / 2);
    /** 테두리 밖에 걸리는 자리 수. */
    const over = from - width;
    /** 그릇의 왼쪽 벽 = 벼랑. */
    const cutX = originX + cellW * over;
    const vesselW = cellW * width;

    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      return node;
    }

    const root = el('g', {});
    svg.appendChild(root);

    // ── 그릇. 위는 열려 있고 좌·우·아래가 막혀 있다. 왼쪽 벽이 벼랑이다.
    root.appendChild(
      el('rect', {
        x: cutX,
        y: SLOT_Y - RIM,
        width: vesselW,
        height: CELL_H + RIM * 2,
        rx: 6,
        fill: c.bgSubtle,
      }),
    );
    root.appendChild(
      el('path', {
        d:
          `M ${cutX} ${SLOT_Y - RIM}` +
          ` L ${cutX} ${SLOT_Y + CELL_H + RIM}` +
          ` L ${cutX + vesselW} ${SLOT_Y + CELL_H + RIM}` +
          ` L ${cutX + vesselW} ${SLOT_Y - RIM}`,
        fill: 'none',
        stroke: c.text,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
      }),
    );

    // ── 표식. 자료형 표기는 그 분야가 원어 그대로 쓰는 말이라 키를 만들지 않는다 (C10).
    root.appendChild(
      el(
        'text',
        {
          x: originX,
          y: MARK_Y,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        },
        `uint${from}`,
      ),
    );
    root.appendChild(
      el(
        'text',
        {
          x: cutX + 9,
          y: SLOT_Y - RIM - 9,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        },
        `uint${width}`,
      ),
    );

    /*
     * 두 수를 위아래로 벌려 둔다. 가지고 온 값은 띠 한가운데 위에, 그릇에 남은 값은
     * 그릇 한가운데 아래에. 두 글자의 가로 위치가 어긋나 있는 것 자체가 잃은 폭이다.
     */
    const sourceValue = el('text', {
      x: originX + stripW / 2,
      y: MARK_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.xl,
    });
    const keptValue = el('text', {
      x: cutX + vesselW / 2,
      y: KEPT_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.xl,
    });
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    root.appendChild(sourceValue);
    root.appendChild(keptValue);
    root.appendChild(caption);

    // 띠는 그릇 위에 얹힌다. 마지막에 붙여 그리는 차례를 잡는다.
    const flow = el('g', {});
    root.appendChild(flow);

    // ── 걸어 둔 것과 기다리는 것. destroy 에서 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function animate(ms: number, ease: (t: number) => number, apply: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return finish();
          const t = Math.min(1, (performance.now() - started) / ms);
          apply(ease(t));
          if (t >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    const easeOut = (t: number): number => 1 - (1 - t) ** 3;
    const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);
    /** 떨어지는 것은 가속한다. */
    const easeIn = (t: number): number => t * t;

    /** 지금 들고 있는 값의 띠. */
    let strip: SVGGElement | null = null;
    /** 그중 테두리 밖에 걸린 자리. 떨어질 때 홀로 움직인다. */
    let high: SVGGElement | null = null;

    function buildStrip(bits: string): { g: SVGGElement; highG: SVGGElement } {
      const g = el('g', {});
      const lowG = el('g', {});
      const highG = el('g', {});
      const glyphs = bits.padStart(from, '0').slice(-from);

      for (let i = 0; i < from; i += 1) {
        const x = originX + i * cellW;
        // 모든 자리를 똑같이 그린다 — 떨어질 자리를 미리 표시하지 않는다.
        const box = el('rect', {
          x: x + 1,
          y: HOME_Y,
          width: cellW - 2,
          height: CELL_H,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const glyph = el(
          'text',
          {
            x: x + cellW / 2,
            y: HOME_Y + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
          },
          glyphs.charAt(i),
        );
        const target = i < over ? highG : lowG;
        target.appendChild(box);
        target.appendChild(glyph);
      }

      g.appendChild(lowG);
      g.appendChild(highG);
      return { g, highG };
    }

    function clear(): void {
      flow.textContent = '';
      strip = null;
      high = null;
      sourceValue.textContent = '';
      keptValue.textContent = '';
    }

    /** 값이 왼쪽에서 들어온다. 앞 값이 남아 있으면 오른쪽으로 내보낸다. */
    async function offer(o: { value: number; bits: string }): Promise<void> {
      const leaving = strip;
      const built = buildStrip(o.bits);
      strip = built.g;
      high = built.highG;
      built.g.setAttribute('transform', `translate(${-(originX + stripW)} 0)`);
      flow.appendChild(built.g);
      sourceValue.textContent = String(o.value);
      keptValue.textContent = '';

      const exit = leaving
        ? animate(EXIT_MS, easeIn, (e) => {
            leaving.setAttribute('transform', `translate(${e * (W - cutX + 60)} ${DESCEND_DY})`);
          }).then(() => leaving.remove())
        : Promise.resolve();

      const enter = animate(SLIDE_MS, easeOut, (e) => {
        built.g.setAttribute('transform', `translate(${(e - 1) * (originX + stripW)} 0)`);
      });

      await Promise.all([exit, enter]);
    }

    /** 띠가 그릇으로 내려앉는다. 아래 여덟은 슬롯에 들어가고 윗자리는 허공에 걸린다. */
    async function pour(o: { lost: number }): Promise<void> {
      const g = strip;
      if (!g) return;

      await animate(DESCEND_MS, easeInOut, (e) => {
        g.setAttribute('transform', `translate(0 ${e * DESCEND_DY})`);
      });

      // 걸린 자리가 지닌 값은 그 자리에 매달아 둔다. 옆의 계기로 날려 보내지 않는다.
      if (high && over > 0) {
        high.appendChild(
          el(
            'text',
            {
              x: originX + (over * cellW) / 2,
              y: HOME_Y - 9,
              'text-anchor': 'middle',
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
            },
            String(o.lost),
          ),
        );
      }
    }

    /** 받쳐 줄 바닥이 없는 자리가 값을 달고 떨어진다. 캔버스 밖으로 나가면 그것으로 끝이다. */
    async function truncate(o: { kept: number }): Promise<void> {
      const falling = high;
      high = null;

      if (falling) {
        const cx = originX + (over * cellW) / 2;
        const cy = HOME_Y + CELL_H / 2;
        await animate(FALL_MS, easeIn, (e) => {
          falling.setAttribute(
            'transform',
            `translate(${e * FALL_DX} ${e * FALL_DY}) rotate(${e * FALL_TILT} ${cx} ${cy})`,
          );
        });
        falling.remove();
      }

      keptValue.textContent = String(o.kept);
    }

    return {
      offer,
      pour,
      truncate,

      rewind(): void {
        clear();
        caption.textContent = '';
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
