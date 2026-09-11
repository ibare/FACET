/**
 * several-hashes-one-value-stage — 하나에서 셋으로 갈라지는 장면.
 *
 * ── 형태가 어디서 나왔나
 *
 * 질문의 동사는 "갈라진다" 다. 그래서 화면은 **한 점에서 셋이 떠나는 순간**을
 * 중심에 둔다. 값은 왼쪽 줄에 앉아 그대로 남고(원본은 자리에 남는다), 줄 끝의
 * 한 점에 갈래 셋이 겹쳐 있다가 서로 다른 호를 그리며 아래 비트 배열의 서로
 * 다른 칸으로 날아간다. 갈래가 지나간 호는 옅게 남으므로, 두 값의 호가 한 칸에
 * 모이는 것이 그림으로 보인다.
 *
 * 칸의 색은 그 칸을 켠 값의 색이다. 두 값이 한 칸을 함께 쓰면 칸이 반씩 나뉘어
 * 두 색을 같이 지닌다 — 겹침을 말로 설명하지 않아도 되는 자리.
 *
 * ── projector 계약
 *
 *   showKey({ row, key, h1, h2 })          줄이 왼쪽에서 미끄러져 들어온다
 *   splitBranches({ row, slots, shared })  갈래 셋이 갈라져 각자 칸으로 간다
 *   markShared({ slot })                   함께 쓰는 칸을 두 번 두드린다
 *   sweepResult()                          켜진 칸을 왼쪽부터 훑는다
 *   rewind()                               줄을 물리고 배열을 비운다
 *   clear()                                즉시 처음 상태로 (되돌리기)
 *   setCaption(text)
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다. 캡션 한 줄 + 값 세 줄 + 비트 배열 한 줄. */
const H = 268;

const CAPTION_X = 20;
const CAPTION_Y = 22;

const ROW_X = 20;
const ROW_W = 312;
const ROW_H = 36;
const ROW_GAP = 12;
const ROW_TOP = 42;

const PLATE_X = 28;
const PLATE_W = 74;
const PLATE_H = 24;

/** 갈래가 떠나는 점 — 줄의 오른쪽 끝. */
const ORIGIN_X = ROW_X + ROW_W - 14;
const ORIGIN_R = 4;

const ARRAY_TOP = 200;
const CELL_H = 40;
/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 44;
const SIDE_MIN = 26;
const INDEX_BASELINE = ARRAY_TOP + CELL_H + 14;

const BRANCH_R = 12;

const FRAME_MS = 16;
const ROW_MS = 340;
const FLY_MS = 640;
const FLY_STAGGER_MS = 90;
const LAND_MS = 160;
const SHARE_PULSE_MS = 260;
const SWEEP_MS = 700;
const REWIND_MS = 260;

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 세 제어점 짜리 곡선 위의 한 점. SVG 기하 API 없이 직접 셈한다. */
function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * 그림이 선언에서 받는 것은 **구조**뿐이다 — 배열의 길이와 넣을 값들. 해시 수는
 * 갈래로 와서 보이므로 여기서 알 필요가 없고, 좌표는 캔버스에서 역산한다 (S-piece).
 */
type Scene = { bitCount: number; keys: string[] };

/**
 * `initialData` 를 좁히는 것은 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로 (S-piece).
 */
function readScene(data: Record<string, unknown> | undefined): Scene {
  const d = data ?? {};
  const keys = Array.isArray(d.keys) ? d.keys.filter((k): k is string => typeof k === 'string') : [];
  return {
    bitCount: typeof d.bitCount === 'number' ? d.bitCount : 0,
    keys,
  };
}

type Cell = {
  g: SVGGElement;
  fills: SVGGElement;
  value: SVGTextElement;
  x: number;
  cx: number;
  /** 이 칸을 켠 값들의 줄 번호. 둘이면 칸을 반씩 나눠 갖는다. */
  owners: number[];
};

type Row = { g: SVGGElement; detail: SVGTextElement };

export const severalHashesOneValueStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    const bitCount = scene.bitCount;
    const tones = categorical(Math.max(scene.keys.length, 1), 'vivid');
    const tone = (row: number): string => tones[row % tones.length] ?? colors.itemActive;

    const cellW = bitCount > 0 ? Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / bitCount)) : 0;
    const originX = Math.round((W - bitCount * cellW) / 2);
    const rowCenterY = (row: number): number => ROW_TOP + row * (ROW_H + ROW_GAP) + ROW_H / 2;
    const offstage = ROW_X + ROW_W + 24;

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    async function animate(ms: number, step: (p: number) => void): Promise<void> {
      const started = Date.now();
      for (;;) {
        if (destroyed) return;
        await wait(FRAME_MS);
        if (destroyed) return;
        const raw = Math.min(1, (Date.now() - started) / ms);
        step(easeInOut(raw));
        if (raw >= 1) return;
      }
    }

    function label(
      content: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle',
      family: string,
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': family,
        'font-size': size,
        fill,
      });
      node.textContent = content;
      return node;
    }

    // ── 층. 갈래의 자취는 줄 뒤에 깔린다. 되돌아가는 호가 아래 줄을 가리지 않게.
    const root = el('g', {});
    const gArcs = el('g', {});
    const gArray = el('g', {});
    const gRows = el('g', {});
    const gFlying = el('g', {});
    const caption = label('', CAPTION_X, CAPTION_Y, fontSizes.md, colors.text, 'start', fonts.body);
    root.append(gArcs, gArray, gRows, gFlying, caption);
    canvas.appendChild(root);

    // ── 비트 배열. 처음에는 모두 0 이다.
    const cells: Cell[] = [];
    for (let i = 0; i < bitCount; i += 1) {
      const x = originX + i * cellW;
      const cx = x + cellW / 2;
      const g = el('g', { transform: 'translate(0,0)' });
      const fills = el('g', {});
      const frame = el('rect', {
        x,
        y: ARRAY_TOP,
        width: cellW,
        height: CELL_H,
        rx: 4,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
      const value = label('0', cx, ARRAY_TOP + CELL_H / 2 + 5, fontSizes.sm, colors.textMuted, 'middle', fonts.mono);
      const index = label(String(i), cx, INDEX_BASELINE, fontSizes.xs, colors.textMuted, 'middle', fonts.mono);
      g.append(fills, frame, value, index);
      gArray.appendChild(g);
      cells.push({ g, fills, value, x, cx, owners: [] });
    }

    function paintCell(slot: number): void {
      const cell = cells[slot];
      if (!cell) return;
      cell.fills.textContent = '';
      const owners = cell.owners;
      const share = owners.length > 0 ? cellW / owners.length : 0;
      owners.forEach((owner, i) => {
        cell.fills.appendChild(
          el('rect', {
            x: cell.x + i * share,
            y: ARRAY_TOP,
            width: share,
            height: CELL_H,
            fill: tone(owner),
          }),
        );
      });
      cell.value.textContent = owners.length > 0 ? '1' : '0';
      cell.value.setAttribute('fill', owners.length > 0 ? colors.stateInk : colors.textMuted);
    }

    const rows = new Map<number, Row>();

    function clearBoard(): void {
      for (const row of rows.values()) row.g.remove();
      rows.clear();
      gArcs.textContent = '';
      gArcs.setAttribute('opacity', '1');
      gFlying.textContent = '';
      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        if (!cell) continue;
        cell.owners = [];
        cell.g.setAttribute('transform', 'translate(0,0)');
        paintCell(i);
      }
    }

    async function flyBranch(row: number, slot: number, i: number): Promise<void> {
      await wait(i * FLY_STAGGER_MS);
      if (destroyed) return;
      const cell = cells[slot];
      if (!cell) return;

      const from: Pt = { x: ORIGIN_X, y: rowCenterY(row) };
      const to: Pt = { x: cell.cx, y: ARRAY_TOP - 3 };
      // 갈래마다 다른 곡률을 준다 — 세 호가 떠나는 순간에 벌어져 보이도록.
      const c1: Pt = { x: from.x + (to.x - from.x) * 0.3, y: from.y + 6 + i * 16 };
      const c2: Pt = { x: to.x + (from.x - to.x) * 0.1, y: to.y - 58 - i * 8 };

      gArcs.appendChild(
        el('path', {
          d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`,
          fill: 'none',
          stroke: tone(row),
          'stroke-width': 1.5,
          'stroke-opacity': 0.35,
        }),
      );

      const flier = el('g', { transform: `translate(${from.x},${from.y})` });
      flier.append(
        el('circle', {
          cx: 0,
          cy: 0,
          r: BRANCH_R,
          fill: tone(row),
          stroke: colors.bg,
          'stroke-width': 1.5,
        }),
        label(String(slot), 0, 4, fontSizes.xs, colors.stateInk, 'middle', fonts.mono),
      );
      gFlying.appendChild(flier);

      await animate(FLY_MS, (p) => {
        const at = cubicAt(from, c1, c2, to, p);
        flier.setAttribute('transform', `translate(${at.x},${at.y})`);
      });
      if (destroyed) return flier.remove();

      if (!cell.owners.includes(row)) cell.owners.push(row);
      paintCell(slot);

      // 갈래가 칸 속으로 접힌다.
      await animate(LAND_MS, (p) => {
        flier.setAttribute('transform', `translate(${to.x},${to.y + p * 12}) scale(${1 - p})`);
      });
      flier.remove();
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.remove();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      async showKey(v: { row: number; key: string; h1: number; h2: number }): Promise<void> {
        const y = rowCenterY(v.row);
        const g = el('g', { transform: `translate(${-offstage},0)` });
        g.append(
          el('rect', {
            x: ROW_X,
            y: ROW_TOP + v.row * (ROW_H + ROW_GAP),
            width: ROW_W,
            height: ROW_H,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
          el('rect', {
            x: PLATE_X,
            y: y - PLATE_H / 2,
            width: PLATE_W,
            height: PLATE_H,
            rx: 4,
            fill: tone(v.row),
          }),
          label(v.key, PLATE_X + PLATE_W / 2, y + 4, fontSizes.sm, colors.stateInk, 'middle', fonts.mono),
          el('circle', { cx: ORIGIN_X, cy: y, r: ORIGIN_R, fill: tone(v.row) }),
        );
        // 바탕 해시 둘은 수식 표기다 — 문안이 아니라 표식이라 상수로 둔다 (C10).
        const detail = label(
          `h1 ${v.h1} · h2 ${v.h2}`,
          PLATE_X + PLATE_W + 12,
          y + 4,
          fontSizes.xs,
          colors.textMuted,
          'start',
          fonts.mono,
        );
        g.appendChild(detail);
        gRows.appendChild(g);
        rows.set(v.row, { g, detail });

        await animate(ROW_MS, (p) => {
          g.setAttribute('transform', `translate(${-(1 - p) * offstage},0)`);
        });
      },

      async splitBranches(v: { row: number; slots: number[] }): Promise<void> {
        await Promise.all(v.slots.map((slot, i) => flyBranch(v.row, slot, i)));
        if (destroyed) return;
        // 줄에는 값과 그것이 켠 자리만 남는다.
        const row = rows.get(v.row);
        if (row) row.detail.textContent = `→ ${v.slots.join(' · ')}`;
      },

      async markShared(v: { slot: number }): Promise<void> {
        const cell = cells[v.slot];
        if (!cell) return;
        const ring = el('rect', {
          x: cell.x,
          y: ARRAY_TOP,
          width: cellW,
          height: CELL_H,
          rx: 4,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
        });
        gFlying.appendChild(ring);
        for (let pulse = 0; pulse < 2; pulse += 1) {
          await animate(SHARE_PULSE_MS, (p) => {
            const grow = p * 12;
            ring.setAttribute('x', String(cell.x - grow));
            ring.setAttribute('y', String(ARRAY_TOP - grow));
            ring.setAttribute('width', String(cellW + grow * 2));
            ring.setAttribute('height', String(CELL_H + grow * 2));
            ring.setAttribute('stroke-opacity', String(1 - p));
          });
          if (destroyed) break;
        }
        ring.remove();
      },

      async sweepResult(): Promise<void> {
        const span = bitCount * cellW;
        const line = el('line', {
          x1: originX,
          y1: ARRAY_TOP - 12,
          x2: originX,
          y2: ARRAY_TOP + CELL_H + 12,
          stroke: colors.accent,
          'stroke-width': 2,
        });
        gFlying.appendChild(line);
        await animate(SWEEP_MS, (p) => {
          const x = originX + p * span;
          line.setAttribute('x1', String(x));
          line.setAttribute('x2', String(x));
          for (const cell of cells) {
            const away = Math.abs(cell.cx - x);
            const lift = cell.owners.length > 0 && away < cellW ? (1 - away / cellW) * 7 : 0;
            cell.g.setAttribute('transform', `translate(0,${-lift})`);
          }
        });
        line.remove();
        for (const cell of cells) cell.g.setAttribute('transform', 'translate(0,0)');
      },

      async rewind(): Promise<void> {
        const leaving = [...rows.values()];
        await animate(REWIND_MS, (p) => {
          for (const row of leaving) row.g.setAttribute('transform', `translate(${-p * offstage},0)`);
          gArcs.setAttribute('opacity', String(1 - p));
        });
        clearBoard();
      },

      clear(): void {
        clearBoard();
        caption.textContent = '';
      },
    };
  },
};
