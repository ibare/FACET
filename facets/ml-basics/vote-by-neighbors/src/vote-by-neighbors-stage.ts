/**
 * 최근접 이웃 투표 — stage view.
 *
 * 화면의 주인공은 투표다. 왼쪽의 점 무리는 표를 낼 이웃이 어디 있는지 보이는
 * 자리일 뿐이고, 오른쪽 절반은 이름표마다 하나씩 놓인 **표 상자**다. 불려 나온
 * 이웃은 자리를 뜨고(유령만 남는다) 호를 그리며 날아가 상자의 투입구를 지나
 * 아래로 떨어져 표로 쌓인다. 부름을 받지 못한 이웃은 자리에서 쪼그라들 뿐
 * 상자 쪽으로 아무것도 보내지 못한다.
 *
 * 좌표는 전부 여기서 셈한다. 선언이 주는 것은 좌표값 · 이름표 · k 뿐이다.
 * 두 축의 배율을 같게 잡는 것이 이 그림의 전제다 — 거리로 부르는 그림에서
 * 축 배율이 갈리면 화면이 거짓말을 한다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  shiftLightness,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 320;

const PAD = 16;
const CAPTION_Y = 22;
const PANEL_LABEL_Y = 46;
const PANEL_TOP = 56;
const SEAT_SIDE = 246;
const SEAT_INSET = 26;
const GUTTER = 28;
const MARKER_R = 11;

const BOX_BOTTOM = 248;
const PLATE_TOP = 254;
const PLATE_BOTTOM = 302;
const COL_GAP = 38;
const COL_MAX_W = 150;
const SLIP_PAD = 8;
const SLIP_GAP = 7;
const SLIP_MAX_H = 30;
const SLIT_W = 46;
const SLIT_H = 5;

/** 물음점 마커에 새겨진 표식 — 아직 이름표가 없다는 뜻. */
const UNKNOWN_MARK = '?';

type StagePoint = { x: number; y: number; label: string };
type StageData = { query: { x: number; y: number }; points: StagePoint[]; k: number };

type Seat = {
  g: SVGGElement;
  ghost: SVGCircleElement;
  rank: SVGTextElement;
  spoke: SVGLineElement;
  x: number;
  y: number;
};

type Column = {
  label: string;
  box: SVGRectElement;
  plate: SVGRectElement;
  count: SVGTextElement;
  x: number;
  filled: number;
};

type Scene = {
  caption: SVGTextElement;
  ring: SVGCircleElement;
  ringR: number;
  seats: Seat[];
  queryG: SVGGElement;
  queryCircle: SVGCircleElement;
  queryMark: SVGTextElement;
  columns: Column[];
  slips: SVGGElement;
  fly: SVGGElement;
};

export type VoteCast = {
  index: number;
  label: string;
  rank: number;
  distance: number;
  tally: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function readData(raw: Record<string, unknown> | undefined): StageData {
  const q = raw?.['query'];
  const qx = typeof (q as { x?: unknown })?.x === 'number' ? (q as { x: number }).x : 0;
  const qy = typeof (q as { y?: unknown })?.y === 'number' ? (q as { y: number }).y : 0;
  const list = Array.isArray(raw?.['points']) ? (raw['points'] as unknown[]) : [];
  const points: StagePoint[] = [];
  for (const item of list) {
    const p = item as { x?: unknown; y?: unknown; label?: unknown };
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || typeof p?.label !== 'string') continue;
    points.push({ x: p.x, y: p.y, label: p.label });
  }
  const k = typeof raw?.['k'] === 'number' ? Math.max(1, Math.floor(raw['k'] as number)) : 1;
  return { query: { x: qx, y: qy }, points, k };
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 이차 베지에 한 점 — 자리에서 투입구까지 호를 그리며 날아가는 길. */
function arcPoint(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * ax + 2 * u * t * bx + t * t * cx,
    u * u * ay + 2 * u * t * by + t * t * cy,
  ];
}

export const voteByNeighborsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const data = readData(params.initialData);

    // ── 자리 배치. 두 축을 같은 배율로 잡고 점 무리를 상자 한가운데에 앉힌다.
    const xs = [...data.points.map((p) => p.x), data.query.x];
    const ys = [...data.points.map((p) => p.y), data.query.y];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const scale = (SEAT_SIDE - SEAT_INSET * 2) / span;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const seatCx = PAD + SEAT_SIDE / 2;
    const seatCy = PANEL_TOP + SEAT_SIDE / 2;
    const px = (x: number): number => seatCx + (x - midX) * scale;
    const py = (y: number): number => seatCy - (y - midY) * scale;
    const qx = px(data.query.x);
    const qy = py(data.query.y);

    // ── 이름표마다 표 상자 하나. 색은 부류 식별이므로 categorical (S-view).
    const labels: string[] = [];
    for (const p of data.points) if (!labels.includes(p.label)) labels.push(p.label);
    if (labels.length === 0) labels.push('');
    const palette = categorical(Math.max(2, labels.length), 'vivid');
    const labelColor = (label: string): string => {
      const i = labels.indexOf(label);
      return palette[i < 0 ? 0 : i] ?? colors.itemDefault;
    };

    const tallyX = PAD + SEAT_SIDE + GUTTER;
    const tallyW = W - PAD - tallyX;
    const colW = Math.min(
      COL_MAX_W,
      Math.floor((tallyW - COL_GAP * (labels.length - 1)) / labels.length),
    );
    const colsW = colW * labels.length + COL_GAP * (labels.length - 1);
    const colX0 = tallyX + Math.round((tallyW - colsW) / 2);
    const colX = (i: number): number => colX0 + i * (colW + COL_GAP);
    const colCx = (i: number): number => colX(i) + colW / 2;

    const capacity = Math.max(1, data.k);
    const slipW = colW - SLIP_PAD * 2;
    const slipH = Math.max(
      12,
      Math.min(
        SLIP_MAX_H,
        Math.floor((BOX_BOTTOM - PANEL_TOP - SLIP_PAD * 2 - SLIP_GAP * (capacity - 1)) / capacity),
      ),
    );
    /** 아래에서부터 쌓인다 — 표는 상자 바닥에 앉는다. */
    const slipY = (slot: number): number =>
      BOX_BOTTOM - SLIP_PAD - (slot + 1) * slipH - slot * SLIP_GAP;

    const SLIT_Y = PANEL_TOP - SLIT_H / 2;
    /** 호가 끝나는 자리 = 투입구. 더 높이 띄우면 패널 이름표 줄을 지운다. */
    const HOVER_Y = PANEL_TOP;

    // ── destroy 가 풀어 줄 것들 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    let destroyed = false;

    const now = (): number =>
      typeof performance !== 'undefined' ? performance.now() : Date.now();

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

    function animate(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const start = now();
        let raf = 0;
        const finish = (): void => {
          waiters.delete(finish);
          frames.delete(raf);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(raf);
          if (destroyed) {
            finish();
            return;
          }
          const t = clamp01((now() - start) / ms);
          step(t);
          if (t >= 1) {
            finish();
            return;
          }
          raf = requestAnimationFrame(tick);
          frames.add(raf);
        };
        raf = requestAnimationFrame(tick);
        frames.add(raf);
      });
    }

    // ── 그리기 ────────────────────────────────────────────────────────────

    function makeToken(label: string): SVGGElement {
      const g = el('g');
      g.appendChild(
        el('circle', {
          r: MARKER_R,
          fill: labelColor(label),
          stroke: shiftLightness(labelColor(label), -0.16),
          'stroke-width': 1,
        }),
      );
      const letter = el('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      letter.textContent = label;
      g.appendChild(letter);
      return g;
    }

    function build(): Scene {
      svg.textContent = '';

      // 자리 상자 · 표 상자 구역의 테두리
      svg.appendChild(
        el('rect', {
          x: PAD, y: PANEL_TOP, width: SEAT_SIDE, height: SEAT_SIDE, rx: 8,
          fill: 'none', stroke: colors.border, 'stroke-width': 1,
        }),
      );

      const seatLabel = el('text', {
        x: PAD, y: PANEL_LABEL_Y,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      });
      seatLabel.textContent = tr('label.seats', 'Neighbors');
      svg.appendChild(seatLabel);

      const voteLabel = el('text', {
        x: colX0, y: PANEL_LABEL_Y,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      });
      voteLabel.textContent = tr('label.votes', 'Ballot boxes');
      svg.appendChild(voteLabel);

      // 부름이 닿는 범위. 걸음마다 자라고, 끝나면 안팎을 가르는 선이 된다.
      const ring = el('circle', {
        cx: qx, cy: qy, r: 0,
        fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1,
        'stroke-dasharray': '4 4', opacity: 0.9,
      });
      svg.appendChild(ring);

      const spokeLayer = el('g');
      const ghostLayer = el('g');
      const markerLayer = el('g');
      const rankLayer = el('g');
      svg.appendChild(spokeLayer);
      svg.appendChild(ghostLayer);
      svg.appendChild(markerLayer);
      svg.appendChild(rankLayer);

      const seats: Seat[] = data.points.map((p) => {
        const x = px(p.x);
        const y = py(p.y);

        const spoke = el('line', {
          x1: qx, y1: qy, x2: qx, y2: qy,
          stroke: colors.textMuted, 'stroke-width': 1, opacity: 0,
        });
        spokeLayer.appendChild(spoke);

        const ghost = el('circle', {
          cx: x, cy: y, r: MARKER_R,
          fill: 'none', stroke: labelColor(p.label), 'stroke-width': 1,
          'stroke-dasharray': '3 3', opacity: 0,
        });
        ghostLayer.appendChild(ghost);

        const g = el('g', { transform: `translate(${x},${y})` });
        g.appendChild(
          el('circle', {
            r: MARKER_R,
            fill: labelColor(p.label),
            stroke: shiftLightness(labelColor(p.label), -0.16),
            'stroke-width': 1,
          }),
        );
        const letter = el('text', {
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 700,
          fill: colors.stateInk,
        });
        letter.textContent = p.label;
        g.appendChild(letter);
        markerLayer.appendChild(g);

        const rank = el('text', {
          x: qx, y: qy,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.xs,
          fill: colors.textMuted, opacity: 0,
          // 살과 고리 위에 얹히는 자리라 배경색 테두리를 둘러 글자를 살린다.
          stroke: colors.bg, 'stroke-width': 3, 'paint-order': 'stroke',
        });
        rankLayer.appendChild(rank);

        return { g, ghost, rank, spoke, x, y };
      });

      // 물음점 — 아직 이름표가 없다.
      const queryG = el('g', { transform: `translate(${qx},${qy})`, opacity: 0 });
      const queryCircle = el('circle', {
        r: MARKER_R + 2,
        fill: colors.itemDefault, stroke: colors.text, 'stroke-width': 1.6,
        'stroke-dasharray': '3 3',
      });
      queryG.appendChild(queryCircle);
      const queryMark = el('text', {
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700,
        fill: colors.text,
      });
      queryMark.textContent = UNKNOWN_MARK;
      queryG.appendChild(queryMark);
      svg.appendChild(queryG);

      // 표 상자 — 이름표마다 하나. 위에 투입구가 뚫려 있다.
      const columns: Column[] = labels.map((label, i) => {
        const x = colX(i);
        const box = el('rect', {
          x, y: PANEL_TOP, width: colW, height: BOX_BOTTOM - PANEL_TOP, rx: 8,
          fill: 'none', stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '5 4',
        });
        svg.appendChild(box);

        svg.appendChild(
          el('rect', {
            x: colCx(i) - SLIT_W / 2, y: SLIT_Y, width: SLIT_W, height: SLIT_H, rx: 2.5,
            fill: colors.text,
          }),
        );

        const plate = el('rect', {
          x, y: PLATE_TOP, width: colW, height: PLATE_BOTTOM - PLATE_TOP, rx: 8,
          fill: labelColor(label), stroke: shiftLightness(labelColor(label), -0.16),
          'stroke-width': 1,
        });
        svg.appendChild(plate);

        const plateLetter = el('text', {
          x: x + 18, y: (PLATE_TOP + PLATE_BOTTOM) / 2,
          'dominant-baseline': 'central',
          'font-family': fonts.body, 'font-size': fontSizes.xl, 'font-weight': 700,
          fill: colors.stateInk,
        });
        plateLetter.textContent = label;
        svg.appendChild(plateLetter);

        const count = el('text', {
          x: x + colW - 18, y: (PLATE_TOP + PLATE_BOTTOM) / 2,
          'text-anchor': 'end', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 700,
          fill: colors.stateInk,
        });
        count.textContent = '0';
        svg.appendChild(count);

        return { label, box, plate, count, x, filled: 0 };
      });

      const slips = el('g');
      svg.appendChild(slips);
      const fly = el('g');
      svg.appendChild(fly);

      const caption = el('text', {
        x: PAD, y: CAPTION_Y,
        'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text,
      });
      svg.appendChild(caption);

      return {
        caption, ring, ringR: 0, seats,
        queryG, queryCircle, queryMark, columns, slips, fly,
      };
    }

    let scene = build();

    const columnOf = (label: string): Column => {
      const found = scene.columns.find((c) => c.label === label);
      if (!found) throw new Error(`표 상자가 없는 이름표: ${label}`);
      return found;
    };
    const columnIndex = (label: string): number =>
      Math.max(0, scene.columns.findIndex((c) => c.label === label));

    // ── projector 가 부르는 표면 ───────────────────────────────────────────

    function setCaption(text: string): void {
      scene.caption.textContent = text;
    }

    async function showQuery(): Promise<void> {
      const g = scene.queryG;
      await animate(340, (t) => {
        const e = easeOut(t);
        g.setAttribute('opacity', String(e));
        g.setAttribute('transform', `translate(${qx},${qy - 30 * (1 - e)})`);
      });
      await animate(200, (t) => {
        const s = 1 + 0.22 * (1 - easeOut(t));
        g.setAttribute('transform', `translate(${qx},${qy}) scale(${s})`);
      });
      g.setAttribute('transform', `translate(${qx},${qy})`);
    }

    /** 거리를 재는 걸음 — 살이 물음점에서 뻗어 나가고 순위 숫자가 그 끝으로 실려 간다. */
    async function showRanking(order: number[]): Promise<void> {
      const stagger = 46;
      const grow = 210;
      const total = stagger * Math.max(0, order.length - 1) + grow;
      for (let i = 0; i < order.length; i += 1) {
        const seat = scene.seats[order[i]];
        if (seat) seat.rank.textContent = String(i + 1);
      }
      await animate(total, (t) => {
        const elapsed = t * total;
        for (let i = 0; i < order.length; i += 1) {
          const seat = scene.seats[order[i]];
          if (!seat) continue;
          const e = easeOut(clamp01((elapsed - i * stagger) / grow));
          seat.spoke.setAttribute('opacity', e > 0 ? '0.55' : '0');
          seat.spoke.setAttribute('x2', String(qx + (seat.x - qx) * e));
          seat.spoke.setAttribute('y2', String(qy + (seat.y - qy) * e));

          const d = Math.hypot(seat.x - qx, seat.y - qy) || 1;
          const ux = (seat.x - qx) / d;
          const uy = (seat.y - qy) / d;
          const reach = (d + MARKER_R + 9) * e;
          seat.rank.setAttribute('x', String(qx + ux * reach));
          seat.rank.setAttribute('y', String(qy + uy * reach));
          seat.rank.setAttribute('opacity', String(e));
        }
      });
    }

    /** 불려 나와 표를 던지는 한 걸음. 이 조각의 동사가 통째로 여기 있다. */
    async function castVote(vote: VoteCast): Promise<void> {
      const seat = scene.seats[vote.index];
      if (!seat) return;
      const col = columnOf(vote.label);
      const ci = columnIndex(vote.label);

      // 1) 호명 — 범위가 그 이웃까지 자라고 마커가 부풀어 오른다.
      const from = scene.ringR;
      const to = vote.distance * scale;
      scene.ringR = to;
      seat.spoke.setAttribute('stroke', shiftLightness(labelColor(vote.label), -0.12));
      await animate(240, (t) => {
        const e = easeOut(t);
        scene.ring.setAttribute('r', String(from + (to - from) * e));
        seat.spoke.setAttribute('opacity', String(0.55 + 0.45 * e));
        seat.spoke.setAttribute('stroke-width', String(1 + 0.6 * e));
        seat.g.setAttribute('transform', `translate(${seat.x},${seat.y}) scale(${1 + 0.24 * e})`);
      });

      // 2) 자리를 뜬다 — 유령만 남는다.
      seat.ghost.setAttribute('opacity', '0.85');
      seat.g.setAttribute('opacity', '0');
      const token = makeToken(vote.label);
      scene.fly.appendChild(token);

      // 3) 투입구까지 호를 그리며 날아간다.
      const slitX = colCx(ci);
      const ctlX = (seat.x + slitX) / 2;
      const ctlY = Math.min(seat.y, HOVER_Y) - 34;
      await animate(420, (t) => {
        const e = easeInOut(t);
        const [x, y] = arcPoint(seat.x, seat.y, ctlX, ctlY, slitX, HOVER_Y, e);
        token.setAttribute('transform', `translate(${x},${y}) scale(${1.24 - 0.24 * e})`);
      });

      // 4) 투입구를 지나 상자 안으로 떨어진다.
      const slot = col.filled;
      const restY = slipY(slot) + slipH / 2;
      await animate(230, (t) => {
        const e = easeIn(t);
        token.setAttribute('transform', `translate(${slitX},${HOVER_Y + (restY - HOVER_Y) * e})`);
      });
      token.remove();

      // 5) 표가 바닥에 앉는다 — 순위와 거리를 달고.
      const slip = el('g');
      const slipX = col.x + SLIP_PAD;
      const slipTop = slipY(slot);
      slip.appendChild(
        el('rect', {
          x: slipX, y: slipTop, width: slipW, height: slipH, rx: 5,
          fill: shiftLightness(labelColor(vote.label), 0.08),
          stroke: labelColor(vote.label), 'stroke-width': 1.2,
        }),
      );
      slip.appendChild(
        el('circle', {
          cx: slipX + 17, cy: slipTop + slipH / 2, r: 9,
          fill: colors.primary,
        }),
      );
      const badge = el('text', {
        x: slipX + 17, y: slipTop + slipH / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 700,
        fill: colors.textInverse,
      });
      badge.textContent = String(vote.rank);
      slip.appendChild(badge);
      const dist = el('text', {
        x: slipX + slipW - 12, y: slipTop + slipH / 2,
        'text-anchor': 'end', 'dominant-baseline': 'central',
        'font-family': fonts.mono, 'font-size': fontSizes.sm,
        fill: colors.stateInk,
      });
      dist.textContent = vote.distance.toFixed(2);
      slip.appendChild(dist);
      scene.slips.appendChild(slip);

      col.filled += 1;
      col.count.textContent = String(vote.tally);

      const cx = slipX + slipW / 2;
      const cy = slipTop + slipH / 2;
      await animate(200, (t) => {
        const k = Math.sin(Math.PI * t);
        const sy = 1 - 0.22 * k;
        const sx = 1 + 0.06 * k;
        slip.setAttribute(
          'transform',
          `translate(${cx},${cy}) scale(${sx},${sy}) translate(${-cx},${-cy})`,
        );
      });
      slip.setAttribute('transform', '');
    }

    /** 부름을 받지 못한 이웃들 — 자리에서 쪼그라들고 밖으로 조금 밀린다. */
    async function silence(indices: number[]): Promise<void> {
      await animate(460, (t) => {
        const e = easeOut(t);
        for (const i of indices) {
          const seat = scene.seats[i];
          if (!seat) continue;
          const d = Math.hypot(seat.x - qx, seat.y - qy) || 1;
          const nx = seat.x + ((seat.x - qx) / d) * 7 * e;
          const ny = seat.y + ((seat.y - qy) / d) * 7 * e;
          seat.g.setAttribute('transform', `translate(${nx},${ny}) scale(${1 - 0.3 * e})`);
          seat.g.setAttribute('opacity', String(1 - 0.55 * e));
          seat.rank.setAttribute('opacity', String(1 - 0.65 * e));
          seat.spoke.setAttribute('opacity', String(0.55 - 0.45 * e));
        }
        scene.ring.setAttribute('stroke-width', String(1 + 0.9 * e));
      });
      scene.ring.setAttribute('stroke-dasharray', 'none');
    }

    /** 표가 많은 쪽의 이름표가 물음점으로 되돌아온다. */
    async function declareWinner(winner: string): Promise<void> {
      const col = columnOf(winner);
      const ci = columnIndex(winner);
      await animate(220, (t) => {
        const e = easeOut(t);
        col.box.setAttribute('stroke', colors.text);
        col.box.setAttribute('stroke-width', String(1 + 1.2 * e));
        col.plate.setAttribute('stroke', colors.text);
        col.plate.setAttribute('stroke-width', String(1 + 1.2 * e));
      });
      col.box.setAttribute('stroke-dasharray', 'none');

      const token = makeToken(winner);
      scene.fly.appendChild(token);
      const fromX = colCx(ci);
      const fromY = (PLATE_TOP + PLATE_BOTTOM) / 2;
      const ctlX = (fromX + qx) / 2;
      const ctlY = Math.min(fromY, qy) - 96;
      await animate(480, (t) => {
        const e = easeInOut(t);
        const [x, y] = arcPoint(fromX, fromY, ctlX, ctlY, qx, qy, e);
        token.setAttribute('transform', `translate(${x},${y})`);
      });
      token.remove();

      scene.queryCircle.setAttribute('fill', labelColor(winner));
      scene.queryCircle.setAttribute('stroke', shiftLightness(labelColor(winner), -0.16));
      scene.queryCircle.setAttribute('stroke-dasharray', 'none');
      scene.queryMark.textContent = winner;
      scene.queryMark.setAttribute('fill', colors.stateInk);
      await animate(300, (t) => {
        const s = 1 + 0.36 * Math.sin(Math.PI * t);
        scene.queryG.setAttribute('transform', `translate(${qx},${qy}) scale(${s})`);
      });
      scene.queryG.setAttribute('transform', `translate(${qx},${qy})`);
      await wait(120);
    }

    function reset(): void {
      scene = build();
    }

    return {
      setCaption,
      showQuery,
      showRanking,
      castVote,
      silence,
      declareWinner,
      reset,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
