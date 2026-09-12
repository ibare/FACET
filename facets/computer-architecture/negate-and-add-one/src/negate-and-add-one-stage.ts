/**
 * negate-and-add-one stage — 뒤집히는 자리표와, 번지다 멎는 자리올림.
 *
 * 동사가 형태를 정했다. "뒤집힌다" 는 카드가 세로축을 중심으로 도는 일이라 여덟
 * 칸이 한꺼번에 납작해졌다가 반대 값으로 되선다. "자리올림이 번져 간다" 는 알갱이
 * 하나가 레일을 타고 오른쪽에서 왼쪽으로 옮겨 가는 일이다.
 *
 * 그래서 이 화면의 볼거리는 자리올림이 **어디서 멎는가** 다. `+1` 에서는 맨 오른쪽
 * 한 칸에 앉고 끝나고, 검산에서는 여덟 칸을 전부 훑고 폭 밖으로 빠져나간다. 같은
 * 덧셈인데 결과가 갈리는 것을, 같은 레일 위에서 잇달아 보인다.
 *
 * 세 줄이 위에서 아래로 놓인다.
 *   기억 줄  뒤집히기 직전의 원본이 작업 띠 뒤에서 솟아올라 앉는 자리.
 *   작업 띠  주인공. 여기서 뒤집고 여기에 1 을 더한다. 끝까지 남는다.
 *   합 줄    검산에서만 쓴다. 기억 줄의 칸이 작업 띠 뒤를 지나 여기로 떨어지며
 *            그 자리의 합이 된다 — 여덟 자리가 모두 0 이 되는 것이 결론의 근거다.
 *
 * 가로는 러너가 정하고(`PIECE_CANVAS_W`) 세로만 여기서 갖는다. 칸 폭은 캔버스에서
 * 역산하며 상수는 상한으로만 둔다 (S-piece).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다. 마운트한 뒤로 바꾸지 않는다 (S-view). */
const STAGE_H = 272;

const CELL_MAX_W = 68;
const SIDE_MIN = 36;
const TILE_GAP = 6;

const CAPTION_Y = 20;
const MEMORY_LABEL_Y = 40;
const MEMORY_Y = 50;
const MEMORY_H = 30;
const WORK_Y = 100;
const WORK_H = 58;
const SUM_Y = 176;
const RAIL_Y = 222;
const READING_Y = 256;

const PELLET_R = 12;
const FRAME_MS = 16;

const ENTER_ONE_MS = 220;
const ENTER_STAGGER = 40;
const RISE_MS = 340;
const FLIP_ALL_MS = 460;
const FLIP_ONE_MS = 240;
const PELLET_RUN_MS = 300;
const PELLET_IN_MS = 200;
const SWEEP_MS = 175;
const EXIT_MS = 280;
const COLLAPSE_MS = 320;

const IDENTITY = 'translate(0 0)';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export type NegateScene = {
  /** 자리표의 비트 폭. 칸 수가 곧 이것이다. */
  width: number;
};

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는 유일한
 * 경로가 mount 이기 때문이다 (S-piece). 좁히는 규칙이 두 벌이 되지 않게 이 함수
 * 하나만 둔다.
 */
export function readNegateScene(initialData: Record<string, unknown> | undefined): NegateScene {
  const raw = initialData?.width;
  const ok = typeof raw === 'number' && Number.isFinite(raw) && raw >= 2 && raw <= 16;
  return { width: ok ? Math.trunc(raw) : 8 };
}

type Tile = {
  group: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
};

export const negateAndAddOneStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 러너가 붙여 준 캔버스를 떼면
    // 그림이 DOM 밖에서 그려진다 (S-view).
    svg.textContent = '';

    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readNegateScene(params.initialData);

    const cellCount = scene.width;
    const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / cellCount));
    const originX = Math.round((PIECE_CANVAS_W - cellCount * cellW) / 2);
    const tileW = cellW - TILE_GAP;
    const smallW = Math.round(tileW * 0.64);
    const rightEdge = originX + cellCount * cellW;
    const centerX = (i: number): number => originX + i * cellW + cellW / 2;

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 걸어 둔 것은 집합에 담아 `destroy` 에서 일괄로 거둔다. 취소된 tick 은 아예
     * 불리지 않으므로, 기다리던 promise 를 깨우는 길을 따로 두지 않으면 unmount
     * 뒤에도 알고리즘이 통째로 붙들린다 (S-piece).
     */
    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const p = clamp01((Date.now() - started) / ms);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 층. 기억 줄이 작업 띠보다 먼저 붙으므로, 원본은 작업 띠 **뒤**에서 솟고
    //    검산 때도 작업 띠 뒤를 지나 합 줄로 떨어진다.
    const memoryLayer = el('g', {});
    const workLayer = el('g', {});
    const railLayer = el('g', {});
    const pelletLayer = el('g', {});
    const textLayer = el('g', {});
    svg.appendChild(memoryLayer);
    svg.appendChild(workLayer);
    svg.appendChild(railLayer);
    svg.appendChild(pelletLayer);
    svg.appendChild(textLayer);

    const rail = el('line', {
      x1: originX - 18,
      y1: RAIL_Y,
      x2: rightEdge + 34,
      y2: RAIL_Y,
      stroke: pal.border,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-dasharray': '1 7',
    });
    railLayer.appendChild(rail);

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: pal.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    const reading = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: READING_Y,
      'text-anchor': 'middle',
      fill: pal.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
    });
    textLayer.appendChild(caption);
    textLayer.appendChild(reading);

    // ── 칸 그리기 ────────────────────────────────────────────────────────────

    function makeTile(parent: SVGGElement, i: number, y: number, w: number, h: number, fontSize: string): Tile {
      const group = el('g', { transform: IDENTITY });
      const rect = el('rect', {
        x: centerX(i) - w / 2,
        y,
        width: w,
        height: h,
        rx: 6,
        fill: pal.bg,
        stroke: pal.border,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: centerX(i),
        y: y + h / 2 + 6,
        'text-anchor': 'middle',
        fill: pal.text,
        'font-family': fonts.mono,
        'font-size': fontSize,
      });
      group.appendChild(rect);
      group.appendChild(label);
      parent.appendChild(group);
      return { group, rect, label };
    }

    /** 작업 띠의 한 칸. `bit` 가 음수면 아직 값이 없는 빈 자리다. */
    function paintWork(tile: Tile, bit: number, turning: boolean): void {
      if (turning) {
        tile.rect.setAttribute('fill', pal.itemActive);
        tile.rect.setAttribute('stroke', pal.itemActive);
        tile.label.setAttribute('fill', pal.stateInk);
      } else if (bit === 1) {
        tile.rect.setAttribute('fill', pal.primary);
        tile.rect.setAttribute('stroke', pal.primary);
        tile.label.setAttribute('fill', pal.textInverse);
      } else {
        tile.rect.setAttribute('fill', pal.bg);
        tile.rect.setAttribute('stroke', pal.border);
        tile.label.setAttribute('fill', pal.text);
      }
      tile.rect.setAttribute('stroke-dasharray', bit < 0 ? '4 4' : 'none');
      // 자리표에 새겨진 글리프다 — 번역할 문안이 아니다 (C10).
      tile.label.textContent = bit < 0 ? '' : String(bit);
    }

    /** 기억 줄·합 줄의 칸. 작업 띠보다 옅게 둔다. */
    function paintSmall(tile: Tile, bit: number): void {
      if (bit === 1) {
        tile.rect.setAttribute('fill', pal.border);
        tile.rect.setAttribute('stroke', pal.border);
        tile.label.setAttribute('fill', pal.text);
      } else {
        tile.rect.setAttribute('fill', pal.bg);
        tile.rect.setAttribute('stroke', pal.border);
        tile.label.setAttribute('fill', pal.textMuted);
      }
      tile.label.textContent = String(bit);
    }

    // ── 상태 ─────────────────────────────────────────────────────────────────

    let work: Tile[] = [];
    let bits: number[] = [];
    let memory: Tile[] = [];
    let pellet: { group: SVGGElement; circle: SVGCircleElement } | null = null;

    function buildWork(): void {
      workLayer.textContent = '';
      work = [];
      bits = [];
      for (let i = 0; i < cellCount; i += 1) {
        const tile = makeTile(workLayer, i, WORK_Y, tileW, WORK_H, fontSizes.xl);
        paintWork(tile, -1, false);
        work.push(tile);
        bits.push(-1);
      }
    }

    function clearMemory(): void {
      memoryLayer.textContent = '';
      memoryLayer.setAttribute('transform', IDENTITY);
      memory = [];
    }

    function clearPellet(): void {
      pelletLayer.textContent = '';
      pellet = null;
    }

    function spawnPellet(x: number, y: number): void {
      const group = el('g', { transform: `translate(${x} ${y})` });
      const circle = el('circle', { cx: 0, cy: 0, r: PELLET_R, fill: pal.accent });
      const glyph = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        fill: pal.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      // 알갱이에 새겨진 글리프 — 실어 나르는 자리올림이 1 이라는 표식이다.
      glyph.textContent = '1';
      group.appendChild(circle);
      group.appendChild(glyph);
      pelletLayer.appendChild(group);
      pellet = { group, circle };
    }

    function movePellet(x: number, y: number, r: number): void {
      if (!pellet) return;
      pellet.group.setAttribute('transform', `translate(${x} ${y})`);
      pellet.circle.setAttribute('r', String(Math.max(0.5, r)));
    }

    function setReading(kind: 'unsigned' | 'signed', value: number): void {
      reading.textContent =
        kind === 'signed'
          ? t('label.signed', 'two\'s complement: {n}', { n: value })
          : t('label.unsigned', 'unsigned: {n}', { n: value });
    }

    /** 한 칸이 세로축을 중심으로 돈다. 가로로 납작해졌다가 반대 값으로 되선다. */
    function flipTransform(i: number, sx: number): string {
      const cx = centerX(i);
      return `translate(${cx} 0) scale(${Math.max(0.03, sx)} 1) translate(${-cx} 0)`;
    }

    buildWork();

    // ── projector 가 부르는 손짓 ──────────────────────────────────────────────

    async function showValue(v: { bits: number[]; unsigned: number }): Promise<void> {
      clearMemory();
      clearPellet();
      bits = v.bits.slice(0, cellCount);
      for (let i = 0; i < cellCount; i += 1) paintWork(work[i], bits[i], false);
      setReading('unsigned', v.unsigned);

      // 칸들이 왼쪽부터 차례로 제자리에 내려앉는다.
      const total = ENTER_ONE_MS + (cellCount - 1) * ENTER_STAGGER;
      await tween(total, (p) => {
        for (let i = 0; i < cellCount; i += 1) {
          const local = clamp01((p * total - i * ENTER_STAGGER) / ENTER_ONE_MS);
          work[i].group.setAttribute('transform', `translate(0 ${(1 - ease(local)) * 26})`);
        }
      });
      for (let i = 0; i < cellCount; i += 1) work[i].group.setAttribute('transform', IDENTITY);
    }

    async function flipAll(v: { bits: number[]; unsigned: number }): Promise<void> {
      // 1. 뒤집히기 직전의 모습이 작업 띠 뒤에서 솟아올라 기억 줄에 앉는다.
      clearMemory();
      const memoryLabel = el('text', {
        x: originX,
        y: MEMORY_LABEL_Y,
        fill: pal.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      memoryLabel.textContent = t('label.original', 'original');
      memoryLayer.appendChild(memoryLabel);
      for (let i = 0; i < cellCount; i += 1) {
        const tile = makeTile(memoryLayer, i, MEMORY_Y, smallW, MEMORY_H, fontSizes.md);
        paintSmall(tile, bits[i]);
        memory.push(tile);
      }
      const rise = WORK_Y + (WORK_H - MEMORY_H) / 2 - MEMORY_Y;
      await tween(RISE_MS, (p) => {
        memoryLayer.setAttribute('transform', `translate(0 ${rise * (1 - ease(p))})`);
      });
      memoryLayer.setAttribute('transform', IDENTITY);

      // 2. 여덟 칸이 한꺼번에 돈다.
      const next = v.bits.slice(0, cellCount);
      let swapped = false;
      for (let i = 0; i < cellCount; i += 1) paintWork(work[i], bits[i], true);
      await tween(FLIP_ALL_MS, (p) => {
        const sx = Math.abs(1 - 2 * p);
        for (let i = 0; i < cellCount; i += 1) {
          work[i].group.setAttribute('transform', flipTransform(i, sx));
        }
        if (p >= 0.5 && !swapped) {
          swapped = true;
          for (let i = 0; i < cellCount; i += 1) paintWork(work[i], next[i], true);
        }
      });
      bits = next;
      for (let i = 0; i < cellCount; i += 1) {
        work[i].group.setAttribute('transform', IDENTITY);
        paintWork(work[i], bits[i], false);
      }
      setReading('unsigned', v.unsigned);
    }

    async function flipOne(i: number, bit: number): Promise<void> {
      paintWork(work[i], bits[i], true);
      let swapped = false;
      await tween(FLIP_ONE_MS, (p) => {
        work[i].group.setAttribute('transform', flipTransform(i, Math.abs(1 - 2 * p)));
        if (p >= 0.5 && !swapped) {
          swapped = true;
          paintWork(work[i], bit, true);
        }
      });
      work[i].group.setAttribute('transform', IDENTITY);
      bits[i] = bit;
      paintWork(work[i], bit, false);
    }

    async function addOne(v: {
      bits: number[];
      unsigned: number;
      carrySteps: number;
      carryOut: boolean;
    }): Promise<void> {
      const next = v.bits.slice(0, cellCount);
      const steps = Math.min(v.carrySteps, cellCount);

      // 알갱이가 레일 오른쪽 끝에서 들어와 맨 오른쪽 자리 아래에 선다.
      const entryX = rightEdge + 30;
      spawnPellet(entryX, RAIL_Y);
      await tween(PELLET_RUN_MS, (p) => {
        movePellet(lerp(entryX, centerX(cellCount - 1), ease(p)), RAIL_Y, PELLET_R);
      });

      for (let k = 0; k < steps; k += 1) {
        const i = cellCount - 1 - k;
        const last = k === steps - 1;

        // 자리 안으로 올라가 스며든다.
        await tween(PELLET_IN_MS, (p) => {
          movePellet(centerX(i), lerp(RAIL_Y, WORK_Y + WORK_H - 14, ease(p)), PELLET_R * (1 - 0.55 * p));
        });
        if (last && !v.carryOut) clearPellet();

        await flipOne(i, next[i]);

        if (!last || v.carryOut) {
          // 자리올림이 살아 있다. 레일로 내려와 왼쪽으로 옮겨 간다.
          const from = centerX(i);
          const to = last ? originX - 24 : centerX(i - 1);
          await tween(SWEEP_MS, (p) => {
            const up = ease(clamp01(p * 2));
            const along = ease(p);
            movePellet(lerp(from, to, along), lerp(WORK_Y + WORK_H - 14, RAIL_Y, up), PELLET_R * (0.45 + 0.55 * up));
          });
          if (last) clearPellet();
        }
      }

      // 폭 밖으로 나가지도, 자리를 찾지도 못한 알갱이는 남기지 않는다.
      if (steps === 0) clearPellet();
      setReading('unsigned', v.unsigned);
    }

    async function verify(v: {
      addend: number[];
      sum: number[];
      carrySteps: number;
      carryOut: boolean;
    }): Promise<void> {
      if (memory.length !== cellCount) return;
      // 기억 줄이 들고 있는 것이 곧 더할 수다. algorithm 이 보낸 값으로 한 번 더
      // 맞춰 두어, 어느 걸음에서 들어오든 화면과 셈이 갈리지 않게 한다.
      for (let i = 0; i < cellCount; i += 1) paintSmall(memory[i], v.addend[i] === 1 ? 1 : 0);
      const sum = v.sum.slice(0, cellCount);
      const visitedFrom = cellCount - Math.min(v.carrySteps, cellCount);

      const entryX = rightEdge + 30;
      spawnPellet(entryX, RAIL_Y);

      const fall = SUM_Y - MEMORY_Y;
      let pelletX = entryX;

      for (let i = cellCount - 1; i >= 0; i -= 1) {
        const tile = memory[i];
        const startX = pelletX;
        const endX = centerX(i);
        const carried = i >= visitedFrom;
        let landed = false;

        // 원본의 한 자리가 작업 띠 뒤를 지나 합 줄로 떨어진다. 그 아래로는
        // 자리올림이 같은 걸음에 옮겨 간다 — 둘이 한 자리에서 만난다.
        await tween(SWEEP_MS, (p) => {
          const e = ease(p);
          tile.group.setAttribute('transform', `translate(0 ${fall * e})`);
          if (carried) movePellet(lerp(startX, endX, e), RAIL_Y, PELLET_R);
          if (p >= 0.85 && !landed) {
            landed = true;
            paintSmall(tile, sum[i]);
          }
        });
        tile.group.setAttribute('transform', `translate(0 ${fall})`);
        paintSmall(tile, sum[i]);
        if (carried) pelletX = endX;
      }

      if (v.carryOut) {
        // 폭 안에 자리가 없다. 자리올림만 왼쪽 밖으로 빠져나간다.
        const from = pelletX;
        await tween(EXIT_MS, (p) => {
          const e = ease(p);
          movePellet(lerp(from, originX - 70, e), RAIL_Y, PELLET_R * (1 - 0.8 * e));
        });
      }
      clearPellet();
    }

    async function conclude(v: { signed: number }): Promise<void> {
      setReading('signed', v.signed);
      if (memory.length === 0) return;

      // 합이 아무것도 아니라는 것 — 합 줄이 제자리에서 납작해져 사라진다.
      const cy = SUM_Y + MEMORY_H / 2;
      await tween(COLLAPSE_MS, (p) => {
        const s = Math.max(0.01, 1 - ease(p));
        memoryLayer.setAttribute('transform', `translate(0 ${cy}) scale(1 ${s}) translate(0 ${-cy})`);
      });
      clearMemory();
    }

    function rewind(): void {
      clearMemory();
      clearPellet();
      buildWork();
      reading.textContent = '';
    }

    return {
      setCaption(text: string): void {
        caption.textContent = text;
      },
      showValue,
      flipAll,
      addOne,
      verify,
      conclude,
      rewind,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
