/**
 * cannot-unset 의 그림.
 *
 * 동사는 "함께 꺼진다" 다. 그래서 비트 배열을 **바닥**으로 그리고, 값은 그 위에
 * 세 발을 딛고 선 삼각대로 그린다. 세 발 중 하나라도 밟을 칸이 사라지면 삼각대는
 * 설 수 없다 — k=3 이 삼각대와 맞아떨어져, "한 비트만 0 이 되어도 없다고 답한다"
 * 를 물리적으로 거짓 없이 옮길 수 있다.
 *
 * 지우는 순간 칸이 꺼지고, 그 칸을 밟고 있던 발이 바닥 아래로 빠지며, 발밑을 잃은
 * 값이 주저앉는다. 지워진 값은 아예 바닥 뒤로 가라앉아 사라진다. 다리와 좌판은
 * 칸보다 먼저 그려 두므로 (z-order) 가라앉는 것이 바닥에 가린다.
 *
 * 좌표는 전부 캔버스에서 역산한다. 칸 폭은 상한만 두고 남는 폭을 좌우로 버리지
 * 않으며, 좌판의 층은 가로 자리가 겹치는 값끼리만 갈라 놓는다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

/** 세로는 그림이 정한다. 마운트한 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 306;

const CELL_TOP = 194;
const CELL_H = 34;
const CELL_MAX_W = 42;
const SIDE_MIN = 26;
const INDEX_BASE = CELL_TOP + CELL_H + 14;
const CAP_Y = [258, 276, 294];

const SEAT_W = 60;
const SEAT_H = 26;
const BADGE_W = 56;
const BADGE_H = 18;
const BADGE_GAP = 6;
const TIER_Y0 = 34;
const TIER_STEP = 48;
/** 이보다 가까운 두 좌판은 한 층에 두지 않는다. */
const MIN_TIER_GAP = SEAT_W + 18;

const PAD_W = 9;
const PAD_H = 6;
/** 같은 칸을 밟는 발끼리 벌리는 간격. 겹쳐 그리면 누구 발인지 안 보인다. */
const FOOT_SPREAD = 10;
const LEG_W = 2.5;

/** 발이 바닥 아래로 빠지는 깊이. 칸 뒤로 완전히 숨는다. */
const SINK = 30;
/** 발밑을 잃은 값이 주저앉는 깊이. */
const SAG = 36;
/** 지울 값을 집어 들 때 뜨는 높이. */
const LIFT = 10;

const STAND_MS = 460;
const VERIFY_MS = 400;
const SELECT_MS = 300;
const CLEAR_MS = 420;
const COLLAPSE_MS = 620;
const VERDICT_MS = 320;
const FRAME_MS = 16;

type Scene = { m: number; bits: number[] };

type Plan = {
  word: string;
  slots: number[];
  color: string;
  footX: number[];
  apexX: number;
  seatY: number;
  baseApexY: number;
};

type Row = Plan & {
  apexY: number;
  footY: number[];
  badgeDy: number;
  legsG: SVGGElement;
  seatG: SVGGElement;
  badgeG: SVGGElement;
  legs: SVGLineElement[];
  pads: SVGRectElement[];
  badgeBox: SVGRectElement;
  badgeText: SVGTextElement;
};

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

/** 떨어지는 것은 가속한다. */
function easeIn(p: number): number {
  return p * p;
}

/** `initialData` 를 좁히는 자리는 여기 하나뿐이다 (S-piece). */
function readScene(initial: unknown): Scene {
  const d = (typeof initial === 'object' && initial !== null
    ? (initial as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const raw = typeof d.bits === 'string' ? d.bits : '';
  const m = typeof d.m === 'number' && d.m > 0 ? Math.floor(d.m) : raw.length;
  const bits: number[] = [];
  for (let i = 0; i < m; i += 1) bits.push(raw[i] === '1' ? 1 : 0);
  return { m, bits };
}

export const cannotUnsetStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    void container;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const svg = params.canvas;
    svg.textContent = '';

    const scene = readScene(params.initialData);
    const m = Math.max(1, scene.m);

    const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / m));
    const originX = Math.round((PIECE_CANVAS_W - m * cellW) / 2);
    const cellCX = (i: number): number => originX + i * cellW + cellW / 2;

    const capPx = parseFloat(fontSizes.md);
    const capMaxW = PIECE_CANVAS_W - SIDE_MIN * 2;

    // z-order — 다리와 좌판이 먼저다. 가라앉는 것이 바닥에 가려야 한다.
    const gLegs = node('g', {});
    const gSeats = node('g', {});
    const gBadges = node('g', {});
    const gCells = node('g', {});
    const gCaption = node('g', {});
    svg.append(gLegs, gSeats, gBadges, gCells, gCaption);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const startedAt = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - startedAt) / ms);
          onFrame(p);
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

    // ── 바닥 (비트 배열)
    const cellOn = [...scene.bits];
    const tiles: SVGRectElement[] = [];
    const digits: SVGTextElement[] = [];
    const probing = new Set<number>();
    const marked = new Set<number>();

    function text(
      x: number,
      y: number,
      value: string,
      size: string,
      fill: string,
      family: string,
    ): SVGTextElement {
      const e = node('text', {
        x: r2(x),
        y: r2(y),
        'text-anchor': 'middle',
        'font-family': family,
        'font-size': size,
        fill,
      });
      e.textContent = value;
      return e;
    }

    function paint(i: number): void {
      if (i < 0 || i >= m) return;
      const tile = tiles[i];
      const digit = digits[i];
      if (!tile || !digit) return;
      const on = cellOn[i] === 1;
      const hot = probing.has(i);
      tile.setAttribute('fill', hot ? colors.itemComparing : on ? colors.primary : colors.bg);
      tile.setAttribute('stroke', marked.has(i) ? colors.danger : colors.border);
      tile.setAttribute('stroke-width', marked.has(i) ? '2.5' : '1');
      digit.setAttribute('fill', hot ? colors.stateInk : on ? colors.textInverse : colors.textMuted);
      digit.textContent = on ? '1' : '0';
    }

    for (let i = 0; i < m; i += 1) {
      const tile = node('rect', {
        x: r2(originX + i * cellW + 1),
        y: CELL_TOP,
        width: r2(cellW - 2),
        height: CELL_H,
        rx: 4,
      });
      const digit = text(cellCX(i), CELL_TOP + CELL_H / 2 + 5, '', fontSizes.md, colors.text, fonts.mono);
      tiles.push(tile);
      digits.push(digit);
      gCells.append(tile, digit);
      gCells.appendChild(
        text(cellCX(i), INDEX_BASE, String(i), fontSizes.xs, colors.textMuted, fonts.mono),
      );
      paint(i);
    }

    // ── 캡션
    function widthOf(s: string): number {
      let w = 0;
      for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x1000 ? 1 : 0.54;
      return w * capPx;
    }

    function wrap(value: string): string[] {
      const out: string[] = [];
      let line = '';
      for (const word of value.split(' ')) {
        const probe = line === '' ? word : `${line} ${word}`;
        if (widthOf(probe) <= capMaxW) {
          line = probe;
          continue;
        }
        if (line !== '') {
          out.push(line);
          line = '';
        }
        // 띄어쓰기가 없는 언어는 낱말 하나가 한 줄을 넘긴다 — 글자로 끊는다.
        let buf = '';
        for (const ch of word) {
          if (buf !== '' && widthOf(buf + ch) > capMaxW) {
            out.push(buf);
            buf = '';
          }
          buf += ch;
        }
        line = buf;
      }
      if (line !== '') out.push(line);
      return out.slice(0, CAP_Y.length);
    }

    function setCaption(value: string): void {
      gCaption.textContent = '';
      wrap(value).forEach((line, i) => {
        gCaption.appendChild(
          text(PIECE_CANVAS_W / 2, CAP_Y[i] ?? CAP_Y[0] ?? 0, line, fontSizes.md, colors.text, fonts.body),
        );
      });
    }

    // ── 값 (삼각대)
    let rows: Row[] = [];

    function place(row: Row): void {
      const dy = row.apexY - row.baseApexY;
      row.seatG.setAttribute('transform', `translate(0 ${r2(dy)})`);
      row.badgeG.setAttribute('transform', `translate(0 ${r2(dy + row.badgeDy)})`);
      for (let j = 0; j < row.legs.length; j += 1) {
        const leg = row.legs[j];
        const pad = row.pads[j];
        const fy = row.footY[j] ?? CELL_TOP;
        if (leg) {
          leg.setAttribute('y1', String(r2(fy)));
          leg.setAttribute('y2', String(r2(row.apexY)));
        }
        if (pad) pad.setAttribute('y', String(r2(fy - PAD_H)));
      }
    }

    function setBadge(row: Row, kind: 'found' | 'missing'): void {
      row.badgeText.textContent =
        kind === 'found' ? t('label.found', 'yes') : t('label.missing', 'no');
      row.badgeBox.setAttribute('stroke', kind === 'found' ? row.color : colors.danger);
      row.badgeText.setAttribute('fill', kind === 'found' ? colors.text : colors.danger);
    }

    function draw(plan: Plan): Row {
      const legsG = node('g', {});
      const seatG = node('g', {});
      const badgeG = node('g', { opacity: 0 });
      const legs: SVGLineElement[] = [];
      const pads: SVGRectElement[] = [];

      for (const x of plan.footX) {
        const leg = node('line', {
          x1: r2(x),
          y1: CELL_TOP,
          x2: r2(plan.apexX),
          y2: r2(plan.baseApexY),
          stroke: plan.color,
          'stroke-width': LEG_W,
          'stroke-linecap': 'round',
        });
        const pad = node('rect', {
          x: r2(x - PAD_W / 2),
          y: CELL_TOP - PAD_H,
          width: PAD_W,
          height: PAD_H,
          rx: 2,
          fill: plan.color,
        });
        legs.push(leg);
        pads.push(pad);
        legsG.append(leg, pad);
      }

      seatG.appendChild(
        node('rect', {
          x: r2(plan.apexX - SEAT_W / 2),
          y: plan.seatY,
          width: SEAT_W,
          height: SEAT_H,
          rx: 6,
          fill: plan.color,
          stroke: colors.border,
        }),
      );
      seatG.appendChild(
        text(plan.apexX, plan.seatY + 18, plan.word, fontSizes.md, colors.stateInk, fonts.mono),
      );

      const badgeBox = node('rect', {
        x: r2(plan.apexX - BADGE_W / 2),
        y: plan.seatY - BADGE_GAP - BADGE_H,
        width: BADGE_W,
        height: BADGE_H,
        rx: 9,
        fill: colors.bg,
        stroke: plan.color,
      });
      const badgeText = text(
        plan.apexX,
        plan.seatY - BADGE_GAP - 5,
        '',
        fontSizes.xs,
        colors.text,
        fonts.body,
      );
      badgeG.append(badgeBox, badgeText);

      gLegs.appendChild(legsG);
      gSeats.appendChild(seatG);
      gBadges.appendChild(badgeG);

      return {
        ...plan,
        apexY: plan.baseApexY,
        footY: plan.footX.map(() => CELL_TOP),
        badgeDy: 0,
        legsG,
        seatG,
        badgeG,
        legs,
        pads,
        badgeBox,
        badgeText,
      };
    }

    function clearWords(): void {
      gLegs.textContent = '';
      gSeats.textContent = '';
      gBadges.textContent = '';
      rows = [];
    }

    async function stand(list: { word: string; slots: number[] }[]): Promise<void> {
      clearWords();
      if (list.length === 0) return;
      const tone = categorical(list.length, 'vivid');
      const half = (list.length - 1) / 2;

      const plans: Plan[] = list.map((w, i) => {
        const footX = w.slots.map((s) => cellCX(s) + (i - half) * FOOT_SPREAD);
        const mean = footX.reduce((a, b) => a + b, 0) / Math.max(1, footX.length);
        return {
          word: w.word,
          slots: w.slots,
          color: tone[i] ?? colors.primary,
          footX,
          apexX: clamp(mean, SEAT_W / 2 + 12, PIECE_CANVAS_W - SEAT_W / 2 - 12),
          seatY: TIER_Y0,
          baseApexY: TIER_Y0 + SEAT_H,
        };
      });

      // 층 나누기 — 가로로 붙는 좌판만 아래 층으로 내린다.
      const taken: number[] = [];
      for (const plan of [...plans].sort((a, b) => a.apexX - b.apexX)) {
        let tier = 0;
        while (tier < taken.length && Math.abs(plan.apexX - (taken[tier] ?? 0)) < MIN_TIER_GAP) {
          tier += 1;
        }
        taken[tier] = plan.apexX;
        plan.seatY = TIER_Y0 + tier * TIER_STEP;
        plan.baseApexY = plan.seatY + SEAT_H;
      }

      rows = plans.map(draw);
      await animate(STAND_MS, (p) => {
        const e = easeOut(p);
        for (const row of rows) {
          row.apexY = row.baseApexY - 30 * (1 - e);
          row.footY = row.footX.map(() => CELL_TOP - 30 * (1 - e));
          row.legsG.setAttribute('opacity', String(r2(e)));
          row.seatG.setAttribute('opacity', String(r2(e)));
          place(row);
        }
      });
    }

    async function verify(names: string[]): Promise<void> {
      const picked = rows.filter((row) => names.includes(row.word));
      for (const row of picked) {
        setBadge(row, 'found');
        for (const s of row.slots) probing.add(s);
      }
      for (const s of probing) paint(s);

      await animate(VERIFY_MS, (p) => {
        const e = easeOut(p);
        for (const row of picked) {
          row.badgeG.setAttribute('opacity', String(r2(e)));
          row.badgeDy = -12 * (1 - e);
          row.footY = row.footX.map(() => CELL_TOP + 3 * Math.sin(Math.PI * p));
          place(row);
        }
      });

      for (const row of picked) {
        row.badgeDy = 0;
        row.footY = row.footX.map(() => CELL_TOP);
        place(row);
      }
      const lit = [...probing];
      probing.clear();
      for (const s of lit) paint(s);
    }

    async function select(word: string, slots: number[]): Promise<void> {
      for (const s of slots) marked.add(s);
      for (const s of slots) paint(s);
      const row = rows.find((r) => r.word === word);
      if (!row) return;
      const from = row.apexY;
      await animate(SELECT_MS, (p) => {
        const e = easeOut(p);
        row.apexY = from - LIFT * e;
        row.footY = row.footX.map(() => CELL_TOP - LIFT * e);
        place(row);
      });
    }

    async function clear(slots: number[]): Promise<void> {
      const ghosts: SVGTextElement[] = [];
      const touched: number[] = [];
      for (const s of slots) {
        if (s < 0 || s >= m) continue;
        ghosts.push(
          text(cellCX(s), CELL_TOP + CELL_H / 2 + 5, '1', fontSizes.md, colors.textInverse, fonts.mono),
        );
        cellOn[s] = 0;
        marked.delete(s);
        touched.push(s);
      }
      for (const g of ghosts) gCells.appendChild(g);
      for (const s of touched) paint(s);

      const born = touched.map((s) => digits[s]).filter((d): d is SVGTextElement => d !== undefined);
      await animate(CLEAR_MS, (p) => {
        const e = easeOut(p);
        for (const g of ghosts) {
          g.setAttribute('transform', `translate(0 ${r2(14 * e)})`);
          g.setAttribute('opacity', String(r2(1 - p)));
        }
        for (const d of born) {
          d.setAttribute('transform', `translate(0 ${r2(-14 * (1 - e))})`);
          d.setAttribute('opacity', String(r2(p)));
        }
      });

      for (const g of ghosts) g.remove();
      for (const d of born) {
        d.setAttribute('transform', 'translate(0 0)');
        d.setAttribute('opacity', '1');
      }
    }

    async function collapse(removed: string, broken: string[]): Promise<void> {
      const fallen = rows.filter((row) => row.word === removed || broken.includes(row.word));
      const from = fallen.map((row) => ({ row, apex: row.apexY, feet: [...row.footY] }));

      for (const row of fallen) {
        if (row.word === removed) continue;
        for (const leg of row.legs) leg.setAttribute('stroke', colors.danger);
        for (const pad of row.pads) pad.setAttribute('fill', colors.danger);
      }

      await animate(COLLAPSE_MS, (p) => {
        const e = easeIn(p);
        for (const start of from) {
          const row = start.row;
          const gone = row.word === removed;
          const apexTo = gone ? CELL_TOP + 32 : row.baseApexY + SAG;
          row.apexY = start.apex + (apexTo - start.apex) * e;
          row.footY = row.footX.map((_, j) => {
            const slot = row.slots[j] ?? 0;
            const lost = gone || cellOn[slot] !== 1;
            const was = start.feet[j] ?? CELL_TOP;
            const to = lost ? CELL_TOP + SINK : CELL_TOP;
            return was + (to - was) * e;
          });
          if (gone) row.badgeG.setAttribute('opacity', String(r2(1 - e)));
          place(row);
        }
      });
    }

    async function verdict(names: string[]): Promise<void> {
      const picked = rows.filter((row) => names.includes(row.word));
      let flipped = false;
      await animate(VERDICT_MS, (p) => {
        for (const row of picked) {
          row.badgeDy = 8 * Math.sin(Math.PI * p);
          place(row);
        }
        if (!flipped && p >= 0.5) {
          flipped = true;
          for (const row of picked) setBadge(row, 'missing');
        }
      });
      for (const row of picked) {
        row.badgeDy = 0;
        place(row);
      }
    }

    function rewind(): void {
      clearWords();
      probing.clear();
      marked.clear();
      for (let i = 0; i < m; i += 1) {
        cellOn[i] = scene.bits[i] ?? 0;
        paint(i);
      }
      setCaption('');
    }

    return {
      stand,
      verify,
      select,
      clear,
      collapse,
      verdict,
      rewind,
      setCaption,
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
