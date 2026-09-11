/**
 * leading-zeros-tell 무대 — 눈금이 올라서는 것을 그린다.
 *
 * 형태는 질문의 동사에서 나왔다. 열쇠는 왼쪽에서 들어와 읽히고 오른쪽으로
 * 흘러 나간다 — 지나가는 것이지 쌓이는 것이 아니다. 읽힌 열쇠는 **첫 1 이 선
 * 자리**에서 빔을 위로 밀어 올리고, 그 빔이 지금 눈금보다 높으면 눈금이 한 칸
 * 올라선다. 빔은 열쇠와 함께 사라지고 눈금은 남는다 — 끝에 화면에 남는 것은
 * 눈금 하나와 그 위의 수뿐이다. 그것이 이 조각의 주장이다.
 *
 * 잰 값은 재는 자리에 남긴다 — 추정값은 옆의 계기로 날아가지 않고 눈금 딱지에
 * 매달려 눈금과 함께 올라간다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 세로는 그림이 정하고, 마운트한 뒤로 바뀌지 않는다 (S-view). */
const W = PIECE_CANVAS_W;
const STAGE_H = 300;

const SIDE = 28;
/** 눈금 이름(ρ=n) 이 앉을 왼쪽 여백. */
const RUNG_LABEL_W = 34;
const LADDER_X0 = SIDE + RUNG_LABEL_W;
const LADDER_X1 = W - SIDE;

/** 열쇠판. 빔은 여기서 위로 뻗는다. */
const TILE_Y = 200;
const TILE_H = 58;
const TILE_PAD = 12;
const BITS_X0 = SIDE + TILE_PAD;
const BITS_W = W - SIDE - TILE_PAD - BITS_X0;
const BITS = 32;
const CELL_W = BITS_W / BITS;
const NAME_BASE = TILE_Y + 22;
const BITS_BASE = TILE_Y + 46;
const MARK_Y = TILE_Y + 32;
const MARK_H = 20;

/** 맨 아래 눈금과 열쇠판 사이. 눈금이 서기 전 딱지가 숨어 있는 자리이기도 하다. */
const BASE_GAP = 44;
const RUNG_GAP_MAX = 48;
/** 맨 위 눈금이 넘지 않는 선 — 그 위로 딱지가 설 자리를 남긴다. */
const LADDER_TOP = 44;

const BEAM_W = 7;
const BAR_H = 6;
const PILL_W = 74;
const PILL_H = 20;
const CAPTION_BASE = 282;

const ENTER_MS = 200;
const BEAM_MS = 220;
const NOTCH_MS = 260;
const EXIT_MS = 180;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** easeOutCubic — 올라선 뒤 자리를 잡는 느낌. */
function ease(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

type SceneKey = { key: string; bits: string };

/**
 * 선언을 좁히는 자리는 여기다 (S-piece). projector 가 같은 것을 다시 좁혀
 * 밀어 넣지 않는다 — mount 가 이미 받았다.
 */
function readScene(initialData: Record<string, unknown> | undefined): SceneKey[] {
  const rows = initialData?.keys;
  if (!Array.isArray(rows)) return [];
  const out: SceneKey[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.key !== 'string' || typeof r.bits !== 'string') continue;
    out.push({ key: r.key, bits: r.bits });
  }
  return out;
}

/**
 * 첫 1 이 선 자리. **사다리를 몇 칸으로 세울지 정하려고** 여기서도 센다 —
 * 화면에 뜨는 ρ 는 알고리즘이 셈해 이벤트로 보낸 값이고, 이것은 자리 배치를
 * 캔버스에서 역산하기 위한 것이다.
 */
function rhoOf(bits: string): number {
  let zeros = 0;
  while (zeros < bits.length && bits[zeros] === '0') zeros += 1;
  return zeros + 1;
}

type KeyView = {
  index: number;
  key: string;
  bits: string;
  rho: number;
  record: boolean;
  estimate: number;
  caption: string;
};

export const leadingZerosTellStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);

    let rungCount = 1;
    for (const row of scene) rungCount = Math.max(rungCount, rhoOf(row.bits));

    const gap = Math.min(
      RUNG_GAP_MAX,
      Math.floor((TILE_Y - BASE_GAP - LADDER_TOP) / Math.max(1, rungCount - 1)),
    );
    const rungY = (rho: number): number => TILE_Y - BASE_GAP - (rho - 1) * gap;
    /** 눈금이 아직 서지 않았을 때 숨어 있는 자리 — 첫 기록은 여기서 올라온다. */
    const notchHome = TILE_Y - 8;

    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    /** 되감기가 지나간 세대. 앞 세대의 애니메이션은 더 이상 화면에 손대지 않는다. */
    let gen = 0;

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const schedule = (): void => {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        const tick = (): void => {
          if (destroyed) return finish();
          const t = Math.min(1, (Date.now() - started) / ms);
          apply(ease(t));
          if (t < 1) schedule();
          else finish();
        };
        schedule();
      });
    }

    // ── 사다리 ────────────────────────────────────────────────────────────
    for (let rho = 1; rho <= rungCount; rho += 1) {
      const y = rungY(rho);
      svg.appendChild(
        el('line', {
          x1: LADDER_X0,
          y1: y,
          x2: LADDER_X1,
          y2: y,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 5',
        }),
      );
      const label = el('text', {
        x: SIDE,
        y: y + 4,
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      // 수식 표기는 표식이다 — 번역하지 않는다 (C10).
      label.textContent = `ρ=${rho}`;
      svg.appendChild(label);
    }

    // ── 빔 — 열쇠가 첫 1 의 자리에서 위로 밀어 올리는 것 ───────────────────
    const beam = el('rect', {
      x: BITS_X0,
      y: TILE_Y,
      width: BEAM_W,
      height: 0,
      rx: 3,
      fill: colors.itemActive,
    });
    svg.appendChild(beam);

    function setBeam(centerX: number, height: number): void {
      beam.setAttribute('x', String(centerX - BEAM_W / 2));
      beam.setAttribute('y', String(TILE_Y - height));
      beam.setAttribute('height', String(Math.max(0, height)));
    }

    // ── 눈금 — 한 번 올라서면 내려오지 않는다 ─────────────────────────────
    const notch = el('g', { transform: `translate(0 ${notchHome})`, display: 'none' });
    notch.appendChild(
      el('rect', {
        x: LADDER_X0,
        y: -BAR_H / 2,
        width: LADDER_X1 - LADDER_X0,
        height: BAR_H,
        rx: BAR_H / 2,
        fill: colors.primary,
      }),
    );
    notch.appendChild(
      el('rect', {
        x: LADDER_X1 - PILL_W,
        y: -BAR_H / 2 - 6 - PILL_H,
        width: PILL_W,
        height: PILL_H,
        rx: 6,
        fill: colors.primary,
      }),
    );
    const pillText = el('text', {
      x: LADDER_X1 - PILL_W / 2,
      y: -BAR_H / 2 - 6 - PILL_H / 2 + 4,
      fill: colors.textInverse,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      'text-anchor': 'middle',
    });
    notch.appendChild(pillText);
    svg.appendChild(notch);

    let notchY: number | null = null;

    // ── 캡션 ─────────────────────────────────────────────────────────────
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_BASE,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'text-anchor': 'middle',
    });
    svg.appendChild(caption);

    // ── 열쇠판 ───────────────────────────────────────────────────────────
    type Tile = { group: SVGGElement; mark: SVGRectElement; firstOne: SVGTextElement | null };
    let tile: Tile | null = null;

    function cellCenter(i: number): number {
      return BITS_X0 + (i + 0.5) * CELL_W;
    }

    function buildTile(view: KeyView): Tile {
      const group = el('g', { transform: `translate(${-W} 0)` });
      group.appendChild(
        el('rect', {
          x: SIDE,
          y: TILE_Y,
          width: W - SIDE * 2,
          height: TILE_H,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const name = el('text', {
        x: BITS_X0,
        y: NAME_BASE,
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      name.textContent = view.key;
      group.appendChild(name);

      // 첫 1 의 표. 열쇠가 다 들어선 뒤에 얹는다.
      const mark = el('rect', {
        x: BITS_X0 + (view.rho - 1) * CELL_W,
        y: MARK_Y,
        width: CELL_W,
        height: MARK_H,
        rx: 3,
        fill: colors.accent,
        display: 'none',
      });
      group.appendChild(mark);

      let firstOne: SVGTextElement | null = null;
      for (let i = 0; i < BITS && i < view.bits.length; i += 1) {
        const isPrefix = i < view.rho - 1;
        const isFirstOne = i === view.rho - 1;
        const glyph = el('text', {
          x: cellCenter(i),
          y: BITS_BASE,
          // 앞자리 0 과 첫 1 이 뜻을 지닌 자리다. 뒤는 흐리게 둔다 — 색이 곧 값이다.
          fill: isPrefix || isFirstOne ? colors.text : colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        });
        glyph.textContent = view.bits[i];
        if (isFirstOne) firstOne = glyph;
        group.appendChild(glyph);
      }

      svg.appendChild(group);
      return { group, mark, firstOne };
    }

    function shift(t: Tile, dx: number): void {
      t.group.setAttribute('transform', `translate(${dx} 0)`);
    }

    async function exitTile(): Promise<void> {
      const dying = tile;
      if (!dying) return;
      tile = null;
      const mine = gen;
      const beamH = Number(beam.getAttribute('height') ?? 0);
      const beamX = Number(beam.getAttribute('x') ?? BITS_X0) + BEAM_W / 2;
      await tween(EXIT_MS, (t) => {
        if (mine !== gen) return;
        shift(dying, W * t);
        setBeam(beamX, beamH * (1 - t));
      });
      dying.group.remove();
      if (mine === gen) setBeam(beamX, 0);
    }

    function clearAll(): void {
      if (tile) {
        tile.group.remove();
        tile = null;
      }
      setBeam(BITS_X0, 0);
      notch.setAttribute('display', 'none');
      notchY = null;
      caption.textContent = '';
    }

    return {
      async showKey(view: KeyView): Promise<void> {
        const mine = gen;
        await exitTile();
        if (mine !== gen || destroyed) return;

        const built = buildTile(view);
        tile = built;
        const beamX = cellCenter(view.rho - 1);

        // 흘러 들어온다.
        await tween(ENTER_MS, (t) => {
          if (mine !== gen) return;
          shift(built, -W * (1 - t));
        });
        if (mine !== gen || destroyed) return;

        // 첫 1 에 표가 얹힌다.
        built.mark.removeAttribute('display');
        built.firstOne?.setAttribute('fill', colors.stateInk);
        caption.textContent = view.caption;

        // 빔이 제 자리까지 올라간다.
        const target = TILE_Y - rungY(view.rho);
        await tween(BEAM_MS, (t) => {
          if (mine !== gen) return;
          setBeam(beamX, target * t);
        });
        if (mine !== gen || destroyed) return;

        if (!view.record) return;

        // 눈금이 한 칸 올라선다. 추정값 딱지도 함께 올라간다.
        const from = notchY ?? notchHome;
        const to = rungY(view.rho);
        pillText.textContent = `2^${view.rho} = ${view.estimate}`;
        notch.removeAttribute('display');
        await tween(NOTCH_MS, (t) => {
          if (mine !== gen) return;
          notch.setAttribute('transform', `translate(0 ${from + (to - from) * t})`);
        });
        if (mine !== gen) return;
        notchY = to;
      },

      async finish(view: { estimate: number; caption: string }): Promise<void> {
        const mine = gen;
        await exitTile();
        if (mine !== gen || destroyed) return;
        caption.textContent = view.caption;
      },

      rewind(): void {
        gen += 1;
        clearAll();
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
