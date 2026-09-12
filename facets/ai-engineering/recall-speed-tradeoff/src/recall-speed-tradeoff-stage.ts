/**
 * 덜 뒤지면 놓친다 — 조각의 그림.
 *
 * ── 무엇을 그리는가
 *
 * **답의 다섯 자리**다. 평면도 칸도 뚜껑도 그리지 않는다 — 그것은 이웃 조각의
 * 몫이고, 여기서 물어야 할 것은 "답이 어떻게 갈리는가" 뿐이다.
 *
 * 고리 위에 자리가 다섯 있고 자리마다 임자(참값)가 있다. 덜 뒤지면 임자가
 * 자리에서 **빠져나가** 바깥에 유령으로 남고, 더 먼 것이 그 자리를 **메운다.**
 * 둘은 한 걸음 안에서 서로 반대쪽으로 휘어 날아 엇갈린다 — 그 엇갈림이 짝이다.
 * 임자는 고리의 바깥 +쪽으로만, 메우는 것은 -쪽으로만 다니므로 길이 겹치지 않는다.
 *
 * ── 왜 타원인가
 *
 * 캔버스가 620 × 356 이라 정원으로 그리면 좌우가 통째로 남는다 (S-piece: 그 폭을
 * 채운다). 여기서 반지름은 거리를 뜻하지 않고 **답 안인가 밖인가**만 뜻하므로,
 * 가로로 늘려도 화면이 거짓을 말하지 않는다.
 *
 * ── 가운데의 계기
 *
 * 재현율은 자리를 지킨 임자의 수 그대로다. 그래서 옆으로 날려 보내지 않고 고리
 * 한가운데에 둔다 (S-piece PREFER: 잰 값은 재는 그 자리에). 지난 값은 눈금으로
 * 남아 단조로 오르는 것이 보인다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다. 마운트 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 356;

/** 상수로는 상한만 둔다 — 실제 크기는 캔버스에서 역산한다 (S-piece). */
const SIDE_MIN = 18;
const TOKEN_R_MAX = 27;
/** 자리에서 바깥 자리까지의 틈. */
const OUT_GAP = 46;
/** 임자 길과 메우는 길이 갈라지는 각도. */
const SPREAD_DEG = 10;
/** 날아가는 길이 휘는 정도. 부호가 반대라 둘이 엇갈린다. */
const BOW = 26;
const SPREAD_MS = 460;
const MOVE_MS = 620;
const GAUGE_R = 34;

const NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

type SeatView = { ox: number; oy: number; ix: number; iy: number; held: boolean };

type AnswerView = { seats: SeatView[]; recall: number; probe: string; caption: string };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function textNode(attrs: Record<string, string | number>, content: string): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

/**
 * initialData 를 좁히는 자리는 mount 다 (S-piece). 그림이 필요한 것은 자리 수뿐 —
 * 좌표는 선언에 없고 여기서 역산한다.
 */
function readSeatCount(initialData: Record<string, unknown> | undefined): number {
  const k = initialData?.k;
  return typeof k === 'number' && k >= 3 && k <= 8 ? Math.floor(k) : 5;
}

export const recallSpeedTradeoffStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);
    const svg = params.canvas;
    const seatCount = readSeatCount(params.initialData);

    const W = PIECE_CANVAS_W;
    const H = CANVAS_H;
    const cx = Math.round(W / 2);
    const fieldTop = 36;
    const fieldBottom = H - 34;
    const cy = Math.round((fieldTop + fieldBottom) / 2);
    const tokenR = TOKEN_R_MAX;
    const ringRx = cx - SIDE_MIN - OUT_GAP - tokenR;
    const ringRy = cy - fieldTop - OUT_GAP - tokenR;

    // ── 자리
    const angleOf = (i: number): number => 90 - (360 / seatCount) * i;
    const onRing = (deg: number): Pt => {
      const r = (deg * Math.PI) / 180;
      return { x: cx + ringRx * Math.cos(r), y: cy - ringRy * Math.sin(r) };
    };
    const outward = (p: Pt, gap: number): Pt => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / len) * gap, y: p.y + (dy / len) * gap };
    };
    const seatPos = (i: number): Pt => onRing(angleOf(i));
    /** 빠진 임자가 머무는 자리. 고리 바깥 +쪽. */
    const ghostPos = (i: number): Pt => outward(onRing(angleOf(i) + SPREAD_DEG), OUT_GAP);
    /** 자리를 메우러 오는 것이 드나드는 자리. 고리 바깥 -쪽. */
    const takerPos = (i: number): Pt => outward(onRing(angleOf(i) - SPREAD_DEG), OUT_GAP);

    const bowControl = (a: Pt, b: Pt, bow: number): Pt => {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
    };
    const bowPath = (a: Pt, b: Pt, bow: number): string => {
      const c = bowControl(a, b, bow);
      return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    };
    const bezier = (a: Pt, b: Pt, bow: number, p: number): Pt => {
      const c = bowControl(a, b, bow);
      const q = 1 - p;
      return {
        x: q * q * a.x + 2 * q * p * c.x + p * p * b.x,
        y: q * q * a.y + 2 * q * p * c.y + p * p * b.y,
      };
    };

    /** 자리 고리를 한 틈 바깥으로 민 곡선 — "답 밖" 의 경계다. */
    const haloOutline = (): string => {
      const steps = 96;
      const parts: string[] = [];
      for (let s = 0; s < steps; s += 1) {
        const p = outward(onRing((360 / steps) * s), OUT_GAP);
        parts.push(`${s === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      }
      parts.push('Z');
      return parts.join(' ');
    };

    const gaugeArc = (fraction: number): string => {
      const f = Math.max(0, Math.min(1, fraction));
      if (f <= 0) return '';
      const sweep = Math.min(359.9, 360 * f);
      const a0 = (90 * Math.PI) / 180;
      const a1 = ((90 - sweep) * Math.PI) / 180;
      const x0 = cx + GAUGE_R * Math.cos(a0);
      const y0 = cy - GAUGE_R * Math.sin(a0);
      const x1 = cx + GAUGE_R * Math.cos(a1);
      const y1 = cy - GAUGE_R * Math.sin(a1);
      return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${GAUGE_R} ${GAUGE_R} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    };

    // ── 고정 층
    const root = el('g', {});
    svg.appendChild(root);

    root.appendChild(
      el('ellipse', {
        cx,
        cy,
        rx: ringRx,
        ry: ringRy,
        fill: 'none',
        stroke: palette.border,
        'stroke-width': 1,
      }),
    );
    root.appendChild(
      el('path', {
        d: haloOutline(),
        fill: 'none',
        stroke: palette.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 5',
      }),
    );
    for (let i = 0; i < seatCount; i += 1) {
      const p = seatPos(i);
      root.appendChild(
        el('circle', {
          cx: p.x,
          cy: p.y,
          r: tokenR + 4,
          fill: 'none',
          stroke: palette.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        }),
      );
    }

    root.appendChild(
      el('circle', {
        cx,
        cy,
        r: GAUGE_R,
        fill: 'none',
        stroke: palette.border,
        'stroke-width': 5,
      }),
    );
    const gaugeFill = el('path', {
      d: '',
      fill: 'none',
      stroke: palette.itemSorted,
      'stroke-width': 5,
      'stroke-linecap': 'round',
    });
    root.appendChild(gaugeFill);
    const tickLayer = el('g', {});
    root.appendChild(tickLayer);
    const gaugeValue = textNode(
      {
        x: cx,
        y: cy + 2,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 600,
        fill: palette.text,
      },
      '',
    );
    root.appendChild(gaugeValue);
    root.appendChild(
      textNode(
        {
          x: cx,
          y: cy + 18,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: palette.textMuted,
        },
        t('label.recall', 'recall'),
      ),
    );

    const probeText = textNode(
      {
        x: SIDE_MIN,
        y: 22,
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.textMuted,
      },
      '',
    );
    root.appendChild(probeText);
    const captionText = textNode(
      {
        x: cx,
        y: H - 14,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.text,
      },
      '',
    );
    root.appendChild(captionText);

    // ── 움직이는 층
    const linkLayer = el('g', {});
    const ghostLayer = el('g', {});
    const tokenLayer = el('g', {});
    root.appendChild(linkLayer);
    root.appendChild(ghostLayer);
    root.appendChild(tokenLayer);

    // ── 기다림. destroy 가 기다리던 것을 풀어야 한다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const tween = (ms: number, onFrame: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          onFrame(1);
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
            onFrame(1);
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          onFrame(raw < 0.5 ? 2 * raw * raw : 1 - ((-2 * raw + 2) ** 2) / 2);
          if (raw >= 1) {
            finish();
            return;
          }
          const next = setTimeout(() => {
            timers.delete(next);
            tick();
          }, 16);
          timers.add(next);
        };
        const first = setTimeout(() => {
          timers.delete(first);
          tick();
        }, 16);
        timers.add(first);
      });

    // ── 토막
    /** 좌표 표기는 도형에 새겨진 표식이다 — 키를 만들지 않는다 (C10). */
    const coord = (x: number, y: number): string => `(${x},${y})`;

    const makeToken = (x: number, y: number, kind: 'own' | 'taker' | 'ghost'): SVGGElement => {
      const g = el('g', {});
      const fill =
        kind === 'own' ? palette.itemSorted : kind === 'taker' ? palette.danger : palette.bg;
      const ink =
        kind === 'own' ? palette.textInverse : kind === 'taker' ? palette.stateInk : palette.textMuted;
      const body = el('circle', {
        cx: 0,
        cy: 0,
        r: tokenR,
        fill,
        stroke: kind === 'ghost' ? palette.ghostOutline : 'none',
        'stroke-width': kind === 'ghost' ? 1.5 : 0,
      });
      if (kind === 'ghost') body.setAttribute('stroke-dasharray', '4 3');
      g.appendChild(body);
      g.appendChild(
        textNode(
          {
            x: 0,
            y: 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: ink,
          },
          coord(x, y),
        ),
      );
      return g;
    };

    const place = (g: SVGGElement, p: Pt): void => {
      g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    };

    let current: SeatView[] = [];
    const occupants = new Map<number, SVGGElement>();
    const ghosts = new Map<number, SVGGElement>();
    const links = new Map<number, SVGPathElement>();

    const dropGhost = (i: number): void => {
      ghosts.get(i)?.remove();
      ghosts.delete(i);
      links.get(i)?.remove();
      links.delete(i);
    };

    const raiseGhost = (i: number, x: number, y: number): void => {
      const g = makeToken(x, y, 'ghost');
      place(g, ghostPos(i));
      ghostLayer.appendChild(g);
      ghosts.set(i, g);
      const link = el('path', {
        d: bowPath(seatPos(i), ghostPos(i), 10),
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-width': 1.2,
        'stroke-dasharray': '3 4',
      });
      linkLayer.appendChild(link);
      links.set(i, link);
    };

    const setGauge = (recall: number | null): void => {
      if (recall === null) {
        gaugeFill.setAttribute('d', '');
        gaugeValue.textContent = '';
        return;
      }
      gaugeFill.setAttribute('d', gaugeArc(recall / 100));
      // 수와 단위 기호뿐이라 표식이다 (C10).
      gaugeValue.textContent = `${recall}%`;
    };

    const addTick = (recall: number): void => {
      const a = ((90 - 360 * (recall / 100)) * Math.PI) / 180;
      tickLayer.appendChild(
        el('line', {
          x1: cx + (GAUGE_R - 9) * Math.cos(a),
          y1: cy - (GAUGE_R - 9) * Math.sin(a),
          x2: cx + (GAUGE_R + 9) * Math.cos(a),
          y2: cy - (GAUGE_R + 9) * Math.sin(a),
          stroke: palette.textMuted,
          'stroke-width': 1,
        }),
      );
    };

    const clearDynamic = (): void => {
      for (const g of occupants.values()) g.remove();
      occupants.clear();
      for (const i of [...ghosts.keys()]) dropGhost(i);
      tickLayer.textContent = '';
      current = [];
    };

    return {
      /** 참값 다섯이 가운데에서 제 자리로 퍼진다. */
      async showTruth(seats: Pt[], caption: string): Promise<void> {
        clearDynamic();
        captionText.textContent = caption;
        probeText.textContent = '';
        setGauge(null);
        current = seats
          .slice(0, seatCount)
          .map((s): SeatView => ({ ox: s.x, oy: s.y, ix: s.x, iy: s.y, held: true }));
        const flights: { g: SVGGElement; to: Pt }[] = [];
        current.forEach((s, i) => {
          const g = makeToken(s.ix, s.iy, 'own');
          place(g, { x: cx, y: cy });
          tokenLayer.appendChild(g);
          occupants.set(i, g);
          flights.push({ g, to: seatPos(i) });
        });
        await tween(SPREAD_MS, (p) => {
          for (const f of flights) {
            place(f.g, { x: cx + (f.to.x - cx) * p, y: cy + (f.to.y - cy) * p });
          }
        });
      },

      /** 빠지는 것과 메우는 것이 같은 걸음에 엇갈려 난다. */
      async showAnswer(next: AnswerView): Promise<void> {
        probeText.textContent = next.probe;
        const after = next.seats.slice(0, seatCount);
        const flights: { g: SVGGElement; from: Pt; to: Pt; bow: number; fade: 'in' | 'out' | 'none' }[] = [];
        const settle: (() => void)[] = [];

        after.forEach((seat, i) => {
          const before = current[i];
          if (before !== undefined && before.ix === seat.ix && before.iy === seat.iy) return;

          const leaving = occupants.get(i);
          const leavingOwner = before !== undefined && before.held;
          if (leaving !== undefined) {
            flights.push({
              g: leaving,
              from: seatPos(i),
              to: leavingOwner ? ghostPos(i) : takerPos(i),
              bow: BOW,
              fade: leavingOwner ? 'none' : 'out',
            });
            settle.push(() => {
              leaving.remove();
              // 임자는 사라지지 않는다 — 바깥에 유령으로 남아 제 자리를 가리킨다.
              if (leavingOwner && before !== undefined) raiseGhost(i, before.ox, before.oy);
            });
          }

          // 임자가 돌아오는 길은 그 유령이 일어서는 길이다.
          if (seat.held) dropGhost(i);
          const entry = seat.held ? ghostPos(i) : takerPos(i);
          const arriving = makeToken(seat.ix, seat.iy, seat.held ? 'own' : 'taker');
          place(arriving, entry);
          if (!seat.held) arriving.setAttribute('opacity', '0');
          tokenLayer.appendChild(arriving);
          flights.push({
            g: arriving,
            from: entry,
            to: seatPos(i),
            bow: -BOW,
            fade: seat.held ? 'none' : 'in',
          });
          settle.push(() => {
            arriving.setAttribute('opacity', '1');
            occupants.set(i, arriving);
          });
        });

        if (flights.length > 0) {
          await tween(MOVE_MS, (p) => {
            for (const f of flights) {
              place(f.g, bezier(f.from, f.to, f.bow, p));
              if (f.fade === 'in') f.g.setAttribute('opacity', p.toFixed(2));
              else if (f.fade === 'out') f.g.setAttribute('opacity', (1 - p).toFixed(2));
            }
          });
        }
        for (const fn of settle) fn();
        current = after;
        setGauge(next.recall);
        addTick(next.recall);
        captionText.textContent = next.caption;
      },

      showCaption(caption: string): void {
        captionText.textContent = caption;
      },

      clear(): void {
        clearDynamic();
        setGauge(null);
        captionText.textContent = '';
        probeText.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
