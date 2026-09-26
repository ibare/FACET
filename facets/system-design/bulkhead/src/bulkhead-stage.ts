/**
 * 벌크헤드 무대 — 자리 여섯의 줄이 주인공이다.
 *
 * - 칸막이는 자리 줄 위를 미끄러지는 선이다. 판 머리(`begin`)에서 a 칸 크기가 바뀌면 옛 자리에서
 *   새 자리로 옮겨 가고, 나누지 않음이면 줄 오른쪽 끝으로 밀려나며 들어 올려져 걷힌다.
 * - 호출은 왼쪽에서 온다 — a 는 위 복도, b 는 아래 복도. 제 칸의 빈 자리로 들어가 앉거나,
 *   칸 입구에서 튕겨 나간다. 놓는 걸음에는 쥐던 호출이 자리에서 빠져나간다.
 * - 자리마다 남은 쥠을 줄어드는 막대로 보인다 — a 의 긴 쥠과 b 의 짧은 쥠이 갈린다.
 *
 * 무대는 알고리즘의 셈을 다시 하지 않는다 — 칸 범위 · 앉은 자리 · 남은 쥠 · 걸음의 수는 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type BulkheadStageServiceId = 'a' | 'b';

export type BulkheadStageSeat = {
  seat: number;
  call: string | null;
  service: BulkheadStageServiceId | null;
  left: number;
  hold: number;
};

export type BulkheadStageBegin = {
  aSlots: number;
  pool: number;
  ranges: { a: { from: number; to: number }; b: { from: number; to: number } };
  services: { id: BulkheadStageServiceId; rate: number; hold: number }[];
  seats: BulkheadStageSeat[];
};

export type BulkheadStageRelease = {
  tick: number;
  freed: { seat: number; call: string }[];
  seats: BulkheadStageSeat[];
};

export type BulkheadStageArrive = {
  tick: number;
  calls: { call: string; service: BulkheadStageServiceId; seat: number | null }[];
  counts: { aTaken: number; aRefused: number; bTaken: number; bRefused: number };
  seats: BulkheadStageSeat[];
};

/** projector 가 부르는 무대의 표면 */
export type BulkheadStage = ViewInstance & {
  begin(p: BulkheadStageBegin, ms: number): void;
  release(p: BulkheadStageRelease, ms: number): void;
  arrive(p: BulkheadStageArrive, ms: number): void;
  reset(): void;
};

const W = 720;
const H = 330;

// 자리 줄
const SEAT_X0 = 236;
const SEAT_PITCH = 74;
const SEAT_W = 62;
const SEAT_TOP = 110;
const SEAT_H = 100;
// 칸 틀
const FRAME_TOP = 96;
const FRAME_BOTTOM = 224;
const FRAME_PAD = 6;
// 복도
const HALL_A = 56;
const HALL_B = 272;
const SOURCE_X = 196;
// 호출 토막
const TOKEN_W = 50;
const TOKEN_H = 26;
const TOKEN_CY = 152;
// 남은 쥠 막대
const BAR_Y = 188;
const BAR_H = 8;
const BAR_PAD = 7;
// 칸막이
const PART_TOP = 84;
const PART_BOTTOM = 236;
const PART_LIFT = 70;

/** categorical(2) 안에서 서비스마다 쓰는 자리 — 다른 view 가 재현할 일이 없어 view-local 로 둔다 */
const SERVICE_TONE_INDEX: Record<BulkheadStageServiceId, number> = { a: 0, b: 1 };

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

const seatLeft = (seat: number): number => SEAT_X0 + (seat - 1) * SEAT_PITCH;
const seatCx = (seat: number): number => seatLeft(seat) + SEAT_W / 2;

export const bulkheadStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): BulkheadStage {
    void container;
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const tones = categorical(2, 'vivid');
    const isInstant = params.isInstant ?? (() => false);
    const toneOf = (s: BulkheadStageServiceId): string => {
      const c = tones[SERVICE_TONE_INDEX[s]];
      if (c === undefined) throw new Error(`bulkhead-stage: 서비스 ${s} 의 색이 없다`);
      return c;
    };

    const root = el('g', {}, svg);

    // ── 운동 ─────────────────────────────────────────────────────────────
    type Tween = { frame: number; finish: () => void };
    const active = new Set<Tween>();
    let destroyed = false;

    const tween = (ms: number, draw: (p: number) => void, done?: () => void): void => {
      if (destroyed || ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        done?.();
        return;
      }
      const start = performance.now();
      let over = false;
      const tw: Tween = {
        frame: 0,
        finish: () => {
          if (over) return;
          over = true;
          cancelAnimationFrame(tw.frame);
          active.delete(tw);
          draw(1);
          done?.();
        },
      };
      const step = (now: number): void => {
        if (over) return;
        const p = Math.min(1, (now - start) / ms);
        draw(ease(p));
        if (p < 1) tw.frame = requestAnimationFrame(step);
        else {
          over = true;
          active.delete(tw);
          done?.();
        }
      };
      active.add(tw);
      tw.frame = requestAnimationFrame(step);
    };
    /** 도는 운동을 모두 끝 상태로 건너뛴다 — 걷히던 요소는 이때 지워진다 */
    const settle = (): void => {
      for (const tw of [...active]) tw.finish();
    };
    params.onScrubStart?.(settle);

    // ── 무대 요소 ───────────────────────────────────────────────────────
    type SeatNodes = { slot: SVGRectElement; track: SVGRectElement; bar: SVGRectElement; barW: number };
    type Token = { g: SVGGElement; call: string; service: BulkheadStageServiceId };
    type Skeleton = {
      pool: number;
      seats: SeatNodes[];
      frameA: SVGRectElement;
      frameB: SVGRectElement;
      labelA: SVGTextElement;
      labelB: SVGTextElement;
      partition: SVGLineElement;
      marks: SVGGElement;
      tokens: SVGGElement;
      caption: SVGTextElement;
      legend: SVGGElement;
    };
    let sk: Skeleton | null = null;
    /** 자리 번호 → 앉은 호출 토막 */
    const seated = new Map<number, Token>();
    /** 운동의 기억 — 칸막이 자리와 들림 (1 = 걷힘) */
    const rightEdge = (pool: number): number => seatLeft(pool) + SEAT_W + FRAME_PAD;
    let partX = rightEdge(6);
    let partLift = 1;

    const build = (pool: number): Skeleton => {
      while (root.firstChild) root.removeChild(root.firstChild);
      const legend = el('g', {}, root);
      const frameA = el('rect', { y: FRAME_TOP, height: FRAME_BOTTOM - FRAME_TOP, rx: 8, fill: 'none', 'stroke-width': 2 }, root);
      const frameB = el('rect', { y: FRAME_TOP, height: FRAME_BOTTOM - FRAME_TOP, rx: 8, fill: 'none', 'stroke-width': 2 }, root);
      const labelA = el('text', { x: seatLeft(1) - FRAME_PAD, y: FRAME_TOP - 8, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text }, root);
      const labelB = el('text', { x: rightEdge(pool), y: FRAME_TOP - 8, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text }, root);
      const seats: SeatNodes[] = [];
      for (let s = 1; s <= pool; s += 1) {
        const slot = el('rect', { x: seatLeft(s), y: SEAT_TOP, width: SEAT_W, height: SEAT_H, rx: 6, fill: pal.bgSubtle, stroke: pal.border }, root);
        const num = el('text', { x: seatCx(s), y: SEAT_TOP + 16, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, root);
        num.textContent = t('label.seat', 'seat {n}', { n: s });
        const track = el('rect', { x: seatLeft(s) + BAR_PAD, y: BAR_Y, width: SEAT_W - 2 * BAR_PAD, height: BAR_H, rx: 3, fill: pal.border }, root);
        const bar = el('rect', { x: seatLeft(s) + BAR_PAD, y: BAR_Y, width: 0, height: BAR_H, rx: 3, fill: pal.textMuted }, root);
        seats.push({ slot, track, bar, barW: 0 });
      }
      const partition = el('line', { y1: PART_TOP, y2: PART_BOTTOM, stroke: pal.text, 'stroke-width': 5, 'stroke-linecap': 'round' }, root);
      const marks = el('g', {}, root);
      const tokens = el('g', {}, root);
      const caption = el('text', { x: 16, y: H - 14, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.text }, root);
      return { pool, seats, frameA, frameB, labelA, labelB, partition, marks, tokens, caption, legend };
    };

    const need = (): Skeleton => {
      if (sk === null) throw new Error('bulkhead-stage: 판 머리(begin) 전에 걸음이 왔다');
      return sk;
    };

    const drawPartition = (x: number, lift: number): void => {
      const s = need();
      const left = seatLeft(1) - FRAME_PAD;
      const right = rightEdge(s.pool);
      s.partition.setAttribute('x1', String(x));
      s.partition.setAttribute('x2', String(x));
      s.partition.setAttribute('transform', `translate(0, ${-PART_LIFT * lift})`);
      s.partition.setAttribute('opacity', String(1 - lift));
      s.frameA.setAttribute('x', String(left));
      s.frameA.setAttribute('width', String(Math.max(0, x - 4 - left)));
      const bw = right - (x + 4);
      s.frameB.setAttribute('x', String(x + 4));
      s.frameB.setAttribute('width', String(Math.max(0, bw)));
      s.frameB.setAttribute('visibility', bw > 8 ? 'visible' : 'hidden');
    };

    const drawLegend = (services: BulkheadStageBegin['services']): void => {
      const s = need();
      while (s.legend.firstChild) s.legend.removeChild(s.legend.firstChild);
      for (const svc of services) {
        const y = svc.id === 'a' ? HALL_A : HALL_B;
        el('line', { x1: SOURCE_X - 12, x2: rightEdge(s.pool), y1: y, y2: y, stroke: pal.border, 'stroke-dasharray': '3 5' }, s.legend);
        el('rect', { x: 16, y: y - 18, width: 14, height: 14, rx: 3, fill: toneOf(svc.id) }, s.legend);
        const name = el('text', { x: 36, y: y - 6, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text }, s.legend);
        name.textContent =
          svc.id === 'a'
            ? t('label.serviceA', '{id} · slow dependency', { id: svc.id })
            : t('label.serviceB', '{id} · fast work', { id: svc.id });
        const rate = el('text', { x: 16, y: y + 12, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, s.legend);
        rate.textContent = t('label.rate', '{rate} per tick · holds {hold} ticks', { rate: svc.rate, hold: svc.hold });
      }
    };

    const makeToken = (call: string, service: BulkheadStageServiceId): Token => {
      const s = need();
      const g = el('g', {}, s.tokens);
      el('rect', { x: -TOKEN_W / 2, y: -TOKEN_H / 2, width: TOKEN_W, height: TOKEN_H, rx: 6, fill: toneOf(service), stroke: pal.stateInk, 'stroke-width': 1 }, g);
      const label = el('text', { x: 0, y: 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.stateInk }, g);
      label.textContent = call;
      return { g, call, service };
    };
    const place = (tok: Token, x: number, y: number, opacity = 1): void => {
      tok.g.setAttribute('transform', `translate(${x}, ${y})`);
      tok.g.setAttribute('opacity', String(opacity));
    };

    /** 자리 막대를 자리 상태에 맞춘다 — 남은 쥠이 줄어드는 운동 */
    const applySeats = (seats: BulkheadStageSeat[], ms: number): void => {
      const s = need();
      if (seats.length !== s.pool) throw new Error(`bulkhead-stage: 자리 ${seats.length} 개가 왔다 (무대는 ${s.pool})`);
      const full = SEAT_W - 2 * BAR_PAD;
      const from = s.seats.map((n) => n.barW);
      const to = seats.map((st) => {
        if (st.call === null) return 0;
        if (st.service === null || st.hold <= 0) throw new Error(`bulkhead-stage: 자리 ${st.seat} 의 쥠이 비었다`);
        if (st.left < 0 || st.left > st.hold) throw new Error(`bulkhead-stage: 자리 ${st.seat} 의 남은 쥠 ${st.left} 가 0..${st.hold} 밖이다`);
        return (full * st.left) / st.hold;
      });
      seats.forEach((st, i) => {
        const n = s.seats[i];
        if (n === undefined || st.seat !== i + 1) throw new Error(`bulkhead-stage: 자리 번호 ${st.seat} 가 차례와 다르다`);
        if (st.service !== null) n.bar.setAttribute('fill', toneOf(st.service));
      });
      tween(ms, (p) => {
        s.seats.forEach((n, i) => {
          const w = lerp(from[i] ?? 0, to[i] ?? 0, p);
          n.barW = w;
          n.bar.setAttribute('width', String(w));
        });
      });
    };

    const clearMarks = (): void => {
      const s = need();
      while (s.marks.firstChild) s.marks.removeChild(s.marks.firstChild);
    };

    const setCaption = (text: string): void => {
      need().caption.textContent = text;
    };

    const clearAll = (): void => {
      settle();
      seated.clear();
      sk = null;
      while (root.firstChild) root.removeChild(root.firstChild);
      partX = rightEdge(6);
      partLift = 1;
    };

    let ranges: BulkheadStageBegin['ranges'] | null = null;

    const inst: BulkheadStage = {
      begin(p, ms) {
        settle();
        if (sk === null || sk.pool !== p.pool) {
          sk = build(p.pool);
          partX = rightEdge(p.pool);
          partLift = 1;
          drawPartition(partX, partLift);
        }
        const s = need();
        // 앞 판의 결론을 걷는다 — 앉은 호출 · 거절 표지 · 캡션
        seated.clear();
        while (s.tokens.firstChild) s.tokens.removeChild(s.tokens.firstChild);
        clearMarks();
        for (const n of s.seats) {
          n.barW = 0;
          n.bar.setAttribute('width', '0');
        }
        drawLegend(p.services);
        ranges = p.ranges;
        const split = p.aSlots > 0;
        if (split) {
          const name = (id: BulkheadStageServiceId): string => {
            const r = p.ranges[id];
            return r.from === r.to
              ? t('label.compartmentOne', 'compartment {id} · seat {n}', { id, n: r.from })
              : t('label.compartment', 'compartment {id} · seats {from}–{to}', { id, from: r.from, to: r.to });
          };
          s.labelA.textContent = name('a');
          s.labelB.textContent = name('b');
          s.frameA.setAttribute('stroke', toneOf('a'));
          s.frameB.setAttribute('stroke', toneOf('b'));
        } else {
          s.labelA.textContent = t('label.pool', 'one pool · seats {from}–{to}', { from: p.ranges.a.from, to: p.ranges.a.to });
          s.labelB.textContent = '';
          s.frameA.setAttribute('stroke', pal.textMuted);
          s.frameB.setAttribute('stroke', pal.textMuted);
        }
        applySeats(p.seats, 0);
        setCaption(t('caption.ready', 'Tick 0 is next · all {n} seats are empty', { n: p.pool }));
        // 칸막이가 옛 자리에서 새 자리로 옮겨 간다 (나누지 않음이면 끝으로 밀려나 걷힌다)
        const fromX = partX;
        const fromLift = partLift;
        const toX = split ? seatLeft(p.aSlots) + SEAT_W + (SEAT_PITCH - SEAT_W) / 2 : rightEdge(p.pool);
        const toLift = split ? 0 : 1;
        tween(ms, (q) => {
          partX = lerp(fromX, toX, q);
          partLift = lerp(fromLift, toLift, q);
          drawPartition(partX, partLift);
        });
      },

      release(p, ms) {
        settle();
        clearMarks();
        const leaving: Token[] = [];
        for (const f of p.freed) {
          const tok = seated.get(f.seat);
          if (tok === undefined || tok.call !== f.call) {
            throw new Error(`bulkhead-stage: 자리 ${f.seat} 에 ${f.call} 이 앉아 있지 않다`);
          }
          seated.delete(f.seat);
          leaving.push(tok);
        }
        applySeats(p.seats, ms);
        const starts = p.freed.map((f) => seatCx(f.seat));
        tween(
          ms,
          (q) => {
            leaving.forEach((tok, i) => place(tok, starts[i] ?? 0, TOKEN_CY - 90 * q, 1 - q));
          },
          () => {
            for (const tok of leaving) tok.g.remove();
          },
        );
        setCaption(t('caption.free', 'Tick {tick} · released: {calls}', { tick: p.tick, calls: p.freed.map((f) => f.call).join(', ') }));
      },

      arrive(p, ms) {
        settle();
        const s = need();
        if (ranges === null) throw new Error('bulkhead-stage: 칸 범위가 없다');
        const rg = ranges;
        clearMarks();
        const order: Record<BulkheadStageServiceId, number> = { a: 0, b: 0 };
        const refusedAt = new Set<BulkheadStageServiceId>();
        type Move = { tok: Token; path: (q: number) => [number, number, number]; transient: boolean };
        const moves: Move[] = [];
        for (const c of p.calls) {
          const hall = c.service === 'a' ? HALL_A : HALL_B;
          const i = order[c.service];
          order[c.service] = i + 1;
          const sx = SOURCE_X - 10 - i * (TOKEN_W + 6);
          const tok = makeToken(c.call, c.service);
          let move: Move;
          if (c.seat !== null) {
            const seatNo = c.seat;
            if (seated.has(seatNo)) throw new Error(`bulkhead-stage: ${c.call} 가 든 자리 ${seatNo} 는 이미 찼다`);
            const r = rg[c.service];
            if (seatNo < r.from || seatNo > r.to) throw new Error(`bulkhead-stage: ${c.call} 의 자리 ${seatNo} 가 제 칸 밖이다`);
            seated.set(seatNo, tok);
            const tx = seatCx(seatNo);
            // 복도를 따라 제 자리 위(아래)까지 → 자리로 내려앉는다
            move = {
              tok,
              transient: false,
              path: (q) => {
                if (q < 0.6) return [lerp(sx, tx, q / 0.6), hall, 1];
                return [tx, lerp(hall, TOKEN_CY, (q - 0.6) / 0.4), 1];
              },
            };
          } else {
            // 칸 입구(제 칸 첫 자리의 틀 가장자리)까지 와서 튕겨 나간다
            refusedAt.add(c.service);
            const gx = seatCx(rg[c.service].from);
            const gy = c.service === 'a' ? FRAME_TOP - TOKEN_H / 2 : FRAME_BOTTOM + TOKEN_H / 2;
            const lag = Math.min(0.3, i * 0.12);
            move = {
              tok,
              transient: true,
              path: (q0) => {
                const q = Math.max(0, Math.min(1, (q0 - lag) / (1 - lag)));
                if (q < 0.45) return [lerp(sx, gx, q / 0.45), hall, 1];
                if (q < 0.65) return [gx, lerp(hall, gy, (q - 0.45) / 0.2), 1];
                const b = (q - 0.65) / 0.35;
                return [lerp(gx, gx - 70, b), lerp(gy, hall, b), 1 - b];
              },
            };
          }
          moves.push(move);
          const [x0, y0, o0] = move.path(0);
          place(tok, x0, y0, o0);
        }
        applySeats(p.seats, ms);
        tween(
          ms,
          (q) => {
            for (const m of moves) {
              const [x, y, o] = m.path(q);
              place(m.tok, x, y, o);
            }
          },
          () => {
            for (const m of moves) if (m.transient) m.tok.g.remove();
          },
        );
        // 거절 표지 — 튕긴 칸 입구에 둔다 (다음 걸음에서 걷힌다)
        for (const id of refusedAt) {
          const gx = seatCx(rg[id].from);
          // 칸 입구 바로 바깥 — a 는 틀 위, b 는 틀 아래
          const y = id === 'a' ? FRAME_TOP - 24 : FRAME_BOTTOM + 28;
          const mark = el('text', { x: gx, y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xl, 'font-weight': 700, fill: pal.danger }, s.marks);
          mark.textContent = t('mark.refused', '✗');
        }
        setCaption(
          t('caption.arrive', 'Tick {tick} · a taken {at}, refused {ar} · b taken {bt}, refused {br}', {
            tick: p.tick,
            at: p.counts.aTaken,
            ar: p.counts.aRefused,
            bt: p.counts.bTaken,
            br: p.counts.bRefused,
          }),
        );
      },

      reset() {
        clearAll();
        ranges = null;
      },

      destroy() {
        settle();
        destroyed = true;
        seated.clear();
        root.remove();
      },
    };
    return inst;
  },
};
