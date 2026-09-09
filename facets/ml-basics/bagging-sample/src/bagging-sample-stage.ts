/**
 * bagging-sample-stage — 뽑고 되돌리는 자리.
 *
 * 화면의 동사는 **왕복**이다. 위 줄이 주머니(원본 여덟)이고, 번호 타일 하나가
 * 거기서 떠올라 아래 벌의 빈 칸으로 날아가 **복제본을 남기고 제자리로
 * 되돌아온다.** 떠난 동안 주머니에는 점선 빈 홈이 드러나고, 되돌아오면 다시
 * 메워진다 — 그 메워짐이 "도로 넣는다" 의 증거다. 되돌리지 않았다면 홈은 계속
 * 비어 있을 것이고 여덟 번 뽑아 주머니가 텅 비었을 것이다.
 *
 * 타일 아래 눈금은 이 벌에서 그 번호가 몇 번 뽑혔는지를 센다. 눈금이 하나도
 * 안 찍힌 타일이 벌이 끝날 때 도드라지고, 그 복제본이 오른쪽 자리로 내려가
 * **화면에 남는다.** 그것이 그 나무를 시험할 자료다.
 *
 * 세로는 mount 뒤 바뀌지 않는다. 벌이 셋보다 많으면 줄 간격을 좁혀 담는다
 * (S-view).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  shiftLightness,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 자리 잡기 ────────────────────────────────────────────────────────────
// 폭은 캔버스에서 역산한다. 상수는 상한만 준다 (S-piece).

const W = PIECE_CANVAS_W;
const SIDE = 10;
/** 왼쪽 열 — 주머니 라벨과 벌 배지가 선다. */
const GUTTER_W = 46;
const GRID_GAP = 12;
/** 남은 것을 담는 오른쪽 자리. */
const TRAY_W = 92;
const TRAY_GAP = 8;
const RATIO_W = 44;
const CELL_MAX_W = 56;
const TILE_H = 34;
/** 칸과 타일 사이의 숨. cellW 에서 이만큼 뺀 것이 타일 폭이다. */
const TILE_INSET = 7;

const CAP_Y = 18;
const POOL_Y = 32;
const TALLY_Y = POOL_Y + TILE_H + 12;
const ROW_Y0 = 98;
const ROW_PITCH_MAX = 46;
const BOTTOM_PAD = 12;
/** 벌 셋을 담는 세로. 넘치면 줄 간격을 좁힌다. */
const STAGE_H = ROW_Y0 + ROW_PITCH_MAX * 2 + TILE_H + BOTTOM_PAD;

const BADGE_W = 26;
const BADGE_H = 22;
const TRAY_TILE_MAX = 24;
const TRAY_TILE_H = 22;
const TRAY_TILE_GAP = 4;
const DOT_R = 2.6;
const DOT_PITCH = 7.5;

// ── 걸음의 길이 ──────────────────────────────────────────────────────────
// 걸음 하나는 이 애니메이션 + stepMs 다. 왕복이 보이는 최소로 잡았다.

const OUT_MS = 165;
const SETTLE_MS = 35;
const BACK_MS = 145;
const LEFT_HOLD_MS = 140;
const TRAY_MS = 240;
/** 날아오를 때의 활 높이. */
const ARC_UP = 16;

const gridLeft = SIDE + GUTTER_W + GRID_GAP;
const ratioRight = W - SIDE;
const ratioLeft = ratioRight - RATIO_W;
const trayRight = ratioLeft - TRAY_GAP;
const trayLeft = trayRight - TRAY_W;
const gridRight = trayLeft - GRID_GAP;
const gridSpan = gridRight - gridLeft;

/** 주머니와 벌이 공유하는 구조. 좌표는 여기서 나오지 않는다 (S-piece). */
export type BaggingSetup = {
  /** 주머니에 든 번호. */
  pool: number[];
  /** 벌마다 뽑은 순서. */
  sets: number[][];
};

/**
 * `initialData` 를 좁히는 유일한 규칙. mount 와 projector 가 함께 쓴다 —
 * 두 벌로 만들면 언젠가 어긋난다 (C9 / S-piece).
 */
export function readBaggingSetup(raw: unknown): BaggingSetup {
  const d = raw as { pool?: unknown; sets?: unknown } | undefined;
  const pool = Array.isArray(d?.pool)
    ? d.pool.filter((v): v is number => typeof v === 'number')
    : [];
  const sets: number[][] = [];
  if (Array.isArray(d?.sets)) {
    for (const row of d.sets) {
      if (!Array.isArray(row)) continue;
      sets.push(row.filter((v): v is number => typeof v === 'number'));
    }
  }
  return { pool, sets };
}

export type BaggingDrawInput = {
  set: number;
  slot: number;
  value: number;
  poolIndex: number;
  count: number;
  first: boolean;
  caption: string;
};

export type BaggingLeftOutInput = {
  set: number;
  values: number[];
  indices: number[];
  ratioLabel: string;
  caption: string;
};

type PoolState = 'idle' | 'flying' | 'drawn' | 'leftOut';

function attr(node: Element, map: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(map)) node.setAttribute(k, String(v));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  map: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  attr(node, map);
  return node;
}

/** 시작과 끝을 눅인 가속. 왕복이 툭 끊기지 않게 한다. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const baggingSampleStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        let cur = 0;
        const tick = (): void => {
          frames.delete(cur);
          if (destroyed) return finish();
          const raw = Math.min(1, (performance.now() - start) / ms);
          apply(ease(raw));
          if (raw >= 1) return finish();
          cur = requestAnimationFrame(tick);
          frames.add(cur);
        };
        cur = requestAnimationFrame(tick);
        frames.add(cur);
      });
    }

    // ── 장면 상태 ──────────────────────────────────────────────────────
    let pool: number[] = [];
    let sets: number[][] = [];
    /** 격자의 칸 수 — 주머니와 벌 가운데 긴 쪽이 정한다. */
    let cols = 1;
    let cellW = 0;
    let tileW = 0;
    let rowPitch = ROW_PITCH_MAX;
    let setInks: readonly string[] = [];

    let caption = el('text');
    let holes = el('g');
    let tallyLayer = el('g');
    let poolLayer = el('g');
    let rowsLayer = el('g');
    let flight = el('g');

    let tileGroups: SVGGElement[] = [];
    let tileRects: SVGRectElement[] = [];
    let tileTexts: SVGTextElement[] = [];
    let tallyGroups: SVGGElement[] = [];
    let slotRects: SVGRectElement[][] = [];
    let slotTexts: SVGTextElement[][] = [];
    let trayGroups: SVGGElement[] = [];
    let ratioTexts: SVGTextElement[] = [];

    function tileX(i: number): number {
      const gridX = gridLeft + Math.round((gridSpan - cellW * cols) / 2);
      return gridX + i * cellW + Math.round((cellW - tileW) / 2);
    }

    function rowTop(s: number): number {
      return ROW_Y0 + s * rowPitch;
    }

    function setPoolState(i: number, state: PoolState, ink?: string): void {
      const rect = tileRects[i];
      const text = tileTexts[i];
      if (!rect || !text) return;
      if (state === 'flying') {
        attr(rect, {
          fill: c.itemActive,
          stroke: shiftLightness(c.itemActive, -0.14),
          'stroke-dasharray': 'none',
        });
        text.setAttribute('fill', c.stateInk);
      } else if (state === 'drawn' && ink) {
        attr(rect, {
          fill: shiftLightness(ink, 0.22),
          stroke: ink,
          'stroke-dasharray': 'none',
        });
        text.setAttribute('fill', c.text);
      } else if (state === 'leftOut') {
        attr(rect, {
          fill: c.accent,
          stroke: shiftLightness(c.accent, -0.18),
          'stroke-dasharray': 'none',
        });
        text.setAttribute('fill', c.stateInk);
      } else {
        attr(rect, { fill: c.bg, stroke: c.border, 'stroke-dasharray': 'none' });
        text.setAttribute('fill', c.text);
      }
    }

    function setTally(i: number, count: number, ink: string): void {
      const g = tallyGroups[i];
      if (!g) return;
      while (g.firstChild) g.removeChild(g.firstChild);
      if (count <= 0) return;
      const cx = tileX(i) + tileW / 2;
      const cap = Math.max(1, Math.floor((tileW - 4) / DOT_PITCH));
      if (count > cap) {
        // 점으로 담기지 않는 수는 숫자로 말한다. 잘라 보이면 화면이 거짓이 된다.
        const t = el('text', {
          x: cx,
          y: TALLY_Y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: ink,
        });
        t.textContent = `×${count}`;
        g.appendChild(t);
        return;
      }
      const span = (count - 1) * DOT_PITCH;
      for (let k = 0; k < count; k += 1) {
        g.appendChild(
          el('circle', {
            cx: cx - span / 2 + k * DOT_PITCH,
            cy: TALLY_Y,
            r: DOT_R,
            fill: ink,
          }),
        );
      }
    }

    function clearSlots(s: number): void {
      const rects = slotRects[s] ?? [];
      const texts = slotTexts[s] ?? [];
      for (let i = 0; i < rects.length; i += 1) {
        attr(rects[i], {
          fill: 'none',
          stroke: c.border,
          'stroke-dasharray': '3 3',
        });
        texts[i].textContent = '';
      }
    }

    function fillSlot(s: number, slot: number, value: number, ink: string): void {
      const rect = slotRects[s]?.[slot];
      const text = slotTexts[s]?.[slot];
      if (!rect || !text) return;
      attr(rect, { fill: ink, stroke: ink, 'stroke-dasharray': 'none' });
      text.setAttribute('fill', c.stateInk);
      text.textContent = String(value);
    }

    function clearTray(s: number): void {
      const g = trayGroups[s];
      if (g) while (g.firstChild) g.removeChild(g.firstChild);
      const r = ratioTexts[s];
      if (r) {
        r.textContent = '';
        attr(r, { fill: c.textMuted, 'font-weight': '400' });
      }
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    /** 새 벌로 갈아 끼운다 — 눈금과 주머니 색을 처음으로 되돌린다. */
    function beginSet(s: number): void {
      for (let i = 0; i < pool.length; i += 1) {
        setPoolState(i, 'idle');
        setTally(i, 0, setInks[s] ?? c.text);
      }
      clearSlots(s);
      clearTray(s);
    }

    function build(setup: BaggingSetup): void {
      pool = setup.pool;
      sets = setup.sets;
      setInks = categorical(Math.max(1, sets.length), 'vivid');

      cols = Math.max(1, pool.length, ...sets.map((row) => row.length));
      cellW = Math.min(CELL_MAX_W, Math.floor(gridSpan / cols));
      tileW = Math.max(12, cellW - TILE_INSET);
      const rowsSpan = STAGE_H - BOTTOM_PAD - ROW_Y0 - TILE_H;
      rowPitch =
        sets.length > 1
          ? Math.min(ROW_PITCH_MAX, Math.floor(rowsSpan / (sets.length - 1)))
          : ROW_PITCH_MAX;

      while (svg.firstChild) svg.removeChild(svg.firstChild);

      caption = el('text', {
        x: SIDE,
        y: CAP_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      holes = el('g');
      tallyLayer = el('g');
      poolLayer = el('g');
      rowsLayer = el('g');
      flight = el('g');
      svg.appendChild(caption);
      svg.appendChild(holes);
      svg.appendChild(tallyLayer);
      svg.appendChild(poolLayer);
      svg.appendChild(rowsLayer);
      svg.appendChild(flight);

      // 주머니 라벨.
      const poolLabel = el('text', {
        x: SIDE + GUTTER_W / 2,
        y: POOL_Y + TILE_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      poolLabel.textContent = tr('label.pool', 'Data');
      rowsLayer.appendChild(poolLabel);

      // 남은 것 자리의 머리말.
      const trayLabel = el('text', {
        x: trayLeft + TRAY_W / 2,
        y: POOL_Y + TILE_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      trayLabel.textContent = tr('label.leftOut', 'Left out');
      rowsLayer.appendChild(trayLabel);

      // 주머니 — 빈 홈과 그 위의 타일.
      tileGroups = [];
      tileRects = [];
      tileTexts = [];
      tallyGroups = [];
      for (let i = 0; i < pool.length; i += 1) {
        const x = tileX(i);
        holes.appendChild(
          el('rect', {
            x,
            y: POOL_Y,
            width: tileW,
            height: TILE_H,
            rx: 5,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '3 3',
          }),
        );

        const g = el('g', { transform: 'translate(0 0)' });
        const rect = el('rect', {
          x,
          y: POOL_Y,
          width: tileW,
          height: TILE_H,
          rx: 5,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1.4,
        });
        const text = el('text', {
          x: x + tileW / 2,
          y: POOL_Y + TILE_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        text.textContent = String(pool[i]);
        g.appendChild(rect);
        g.appendChild(text);
        poolLayer.appendChild(g);
        tileGroups.push(g);
        tileRects.push(rect);
        tileTexts.push(text);
        tallyGroups.push(tallyLayer.appendChild(el('g')));
      }

      // 벌 — 배지 · 여덟 칸 · 남은 것 자리 · 비율.
      slotRects = [];
      slotTexts = [];
      trayGroups = [];
      ratioTexts = [];
      for (let s = 0; s < sets.length; s += 1) {
        const top = rowTop(s);
        const ink = setInks[s] ?? c.text;

        rowsLayer.appendChild(
          el('rect', {
            x: SIDE + (GUTTER_W - BADGE_W) / 2,
            y: top + (TILE_H - BADGE_H) / 2,
            width: BADGE_W,
            height: BADGE_H,
            rx: 6,
            fill: ink,
          }),
        );
        const badge = el('text', {
          x: SIDE + GUTTER_W / 2,
          y: top + TILE_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.stateInk,
        });
        badge.textContent = String(s + 1);
        rowsLayer.appendChild(badge);

        const rects: SVGRectElement[] = [];
        const texts: SVGTextElement[] = [];
        for (let k = 0; k < sets[s].length; k += 1) {
          const x = tileX(k);
          const rect = el('rect', {
            x,
            y: top,
            width: tileW,
            height: TILE_H,
            rx: 5,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '3 3',
          });
          const text = el('text', {
            x: x + tileW / 2,
            y: top + TILE_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: c.stateInk,
          });
          rowsLayer.appendChild(rect);
          rowsLayer.appendChild(text);
          rects.push(rect);
          texts.push(text);
        }
        slotRects.push(rects);
        slotTexts.push(texts);

        trayGroups.push(rowsLayer.appendChild(el('g')));
        const ratio = el('text', {
          x: ratioRight,
          y: top + TILE_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        rowsLayer.appendChild(ratio);
        ratioTexts.push(ratio);
      }
    }

    function resetScene(): void {
      setCaption('');
      for (let i = 0; i < pool.length; i += 1) {
        tileGroups[i]?.setAttribute('transform', 'translate(0 0)');
        poolLayer.appendChild(tileGroups[i]);
        setPoolState(i, 'idle');
        setTally(i, 0, c.text);
      }
      for (let s = 0; s < sets.length; s += 1) {
        clearSlots(s);
        clearTray(s);
      }
    }

    async function draw(p: BaggingDrawInput): Promise<void> {
      if (destroyed) return;
      const ink = setInks[p.set] ?? c.text;
      if (p.first) beginSet(p.set);
      setCaption(p.caption);

      const g = tileGroups[p.poolIndex];
      if (!g) return;

      const fromX = tileX(p.poolIndex);
      const toX = tileX(p.slot);
      const dx = toX - fromX;
      const dy = rowTop(p.set) - POOL_Y;

      setPoolState(p.poolIndex, 'flying');
      flight.appendChild(g);

      // 뽑혀 나간다 — 주머니에 점선 홈이 드러난다.
      await tween(OUT_MS, (t) => {
        const lift = -ARC_UP * Math.sin(Math.PI * t);
        g.setAttribute('transform', `translate(${dx * t} ${dy * t + lift})`);
      });
      if (destroyed) return;

      // 복제본이 칸에 굳는다.
      fillSlot(p.set, p.slot, p.value, ink);
      await wait(SETTLE_MS);
      if (destroyed) return;

      // 그리고 도로 넣는다 — 홈이 다시 메워진다.
      await tween(BACK_MS, (t) => {
        const u = 1 - t;
        const lift = -ARC_UP * 0.6 * Math.sin(Math.PI * t);
        g.setAttribute('transform', `translate(${dx * u} ${dy * u + lift})`);
      });
      if (destroyed) return;

      g.setAttribute('transform', 'translate(0 0)');
      poolLayer.appendChild(g);
      setPoolState(p.poolIndex, 'drawn', ink);
      setTally(p.poolIndex, p.count, ink);
    }

    async function leftOut(p: BaggingLeftOutInput): Promise<void> {
      if (destroyed) return;
      setCaption(p.caption);
      const ink = setInks[p.set] ?? c.text;
      for (const i of p.indices) setPoolState(i, 'leftOut');

      const tray = trayGroups[p.set];
      const count = p.values.length;
      if (tray && count > 0) {
        await wait(LEFT_HOLD_MS);
        if (destroyed) return;

        const tw = Math.max(
          10,
          Math.min(
            TRAY_TILE_MAX,
            Math.floor((TRAY_W - TRAY_TILE_GAP * (count - 1)) / count),
          ),
        );
        const total = count * tw + TRAY_TILE_GAP * (count - 1);
        const startX = trayLeft + Math.round((TRAY_W - total) / 2);
        const ty = rowTop(p.set) + Math.round((TILE_H - TRAY_TILE_H) / 2);
        const moving: Array<{ g: SVGGElement; dx: number; dy: number }> = [];

        for (let k = 0; k < count; k += 1) {
          const x = startX + k * (tw + TRAY_TILE_GAP);
          const g = el('g');
          g.appendChild(
            el('rect', {
              x,
              y: ty,
              width: tw,
              height: TRAY_TILE_H,
              rx: 4,
              fill: c.bg,
              stroke: ink,
              'stroke-width': 1.4,
              'stroke-dasharray': '3 2',
            }),
          );
          const t = el('text', {
            x: x + tw / 2,
            y: ty + TRAY_TILE_H / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
          });
          t.textContent = String(p.values[k]);
          g.appendChild(t);
          tray.appendChild(g);

          const srcX = tileX(p.indices[k]) + (tileW - tw) / 2;
          const srcY = POOL_Y + (TILE_H - TRAY_TILE_H) / 2;
          const mdx = srcX - x;
          const mdy = srcY - ty;
          g.setAttribute('transform', `translate(${mdx} ${mdy})`);
          moving.push({ g, dx: mdx, dy: mdy });
        }

        // 남겨진 것의 복제본이 제 자리로 내려와 화면에 남는다.
        await tween(TRAY_MS, (t) => {
          const u = 1 - t;
          for (const m of moving) {
            m.g.setAttribute('transform', `translate(${m.dx * u} ${m.dy * u})`);
          }
        });
        if (destroyed) return;
        for (const m of moving) m.g.setAttribute('transform', 'translate(0 0)');
      }

      const ratio = ratioTexts[p.set];
      if (ratio) {
        ratio.textContent = p.ratioLabel;
        ratio.setAttribute('fill', c.text);
      }
    }

    function finish(text: string): void {
      if (destroyed) return;
      setCaption(text);
      for (const r of ratioTexts) attr(r, { 'font-weight': '600', fill: c.text });
    }

    build(readBaggingSetup(params.initialData));

    return {
      setup(setup: BaggingSetup): void {
        if (destroyed) return;
        build(setup);
      },
      draw,
      leftOut,
      finish,
      rewind(): void {
        if (destroyed) return;
        resetScene();
      },
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
