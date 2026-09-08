/**
 * compare-and-swap-stage — 자리와 값을 나눠 그리는 조각 stage.
 *
 * 짝마다 **자리** 둘(고정된 점선 칸)과 **값** 둘(그 위에 얹힌 타일)을 그린다.
 * 견주면 값이 자리에서 살짝 들리고, 판정이 참일 때만 두 값이 동시에 호를 타고
 * 엇갈려 지나가 서로의 자리로 건너간다. 거짓이면 들렸던 값이 제 자리로 도로
 * 내려앉는다 — 옮김이 일어난 짝에만 호의 자취가 남으므로, 다 끝난 화면에서
 * "견줌 셋 중 하나만 무언가를 옮겼다" 가 한눈에 보인다.
 *
 * 값의 크기를 막대 높이로 그리지 않는다. 이 조각이 말하려는 것은 크기의 대소가
 * 아니라 판정과 이동이 다른 동작이라는 것이다.
 *
 * 화면에 그리는 문자는 값(숫자)과 판정 표식(`5 > 3`) 뿐이다. 수식·기호 표기는
 * 번역 대상이 아니므로 키를 만들지 않는다 (C10 표식/문안 판정 3번). 캡션 문안은
 * projector 가 tr 로 해석해 setCaption 으로 넘긴다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

// ── 크기는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece "그 폭을 채운다").
const GROUP_MAX_W = 190;
const GROUP_GAP = 40;
const SIDE_MIN = 22;
const TOKEN_MAX_W = 68;
const SEAT_GAP = 18;

// ── 세로는 내용이 정한다. 마운트 뒤로 바꾸지 않는다 (S-view).
const TOKEN_H = 44;
const TOP_PAD = 16;
/** 자리 중심에서 호 꼭대기까지. 두 값이 스치지 않고 지나가려면 타일 높이보다 커야 한다. */
const ARC_H = 38;
const GLYPH_DROP = 22;
const CAPTION_DROP = 34;
const BOTTOM_PAD = 14;

const SEAT_CY = TOP_PAD + TOKEN_H / 2 + ARC_H;
const GLYPH_Y = SEAT_CY + ARC_H + TOKEN_H / 2 + GLYPH_DROP;
const CAPTION_Y = GLYPH_Y + CAPTION_DROP;
const CANVAS_H = CAPTION_Y + BOTTOM_PAD;

/** 견줌이 값을 자리에서 들어올리는 높이. */
const LIFT = 8;
const LIFT_MS = 240;
const CROSS_MS = 560;
const SETTLE_MS = 260;

/** 판정 표식 — 수식 기호라 번역하지 않는다 (C10). */
const SIGN = { greater: '>', less: '<', equal: '=' } as const;

export type StageOrder = keyof typeof SIGN;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 이차 베지에 위의 한 점. 호를 그리는 path 와 값이 타는 경로가 같은 식을 쓴다. */
function quadAt(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

type Token = {
  group: SVGGElement;
  tile: SVGRectElement;
  label: SVGTextElement;
  /** 지금 앉아 있는 자리 (0 = 왼쪽, 1 = 오른쪽). */
  seat: 0 | 1;
};

type PairGroup = {
  seatX: [number, number];
  tokens: [Token, Token];
  glyph: SVGTextElement;
  traces: SVGGElement;
};

export const compareAndSwapStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const root = el('g');
    svg.appendChild(root);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.appendChild(caption);

    let groups: PairGroup[] = [];
    let source: [number, number][] = [];
    let tokenW = TOKEN_MAX_W;
    let destroyed = false;
    const pendingFrames = new Set<number>();

    function animate(duration: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          draw(1);
          resolve();
          return;
        }
        const started = performance.now();
        let current = 0;
        const tick = (now: number): void => {
          pendingFrames.delete(current);
          if (destroyed) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - started) / duration);
          draw(t);
          if (t < 1) {
            current = requestAnimationFrame(tick);
            pendingFrames.add(current);
          } else {
            resolve();
          }
        };
        current = requestAnimationFrame(tick);
        pendingFrames.add(current);
      });
    }

    function place(token: Token, x: number, y: number): void {
      token.group.setAttribute('transform', `translate(${x} ${y})`);
    }

    function paint(token: Token, fill: string, ink: string): void {
      token.tile.setAttribute('fill', fill);
      token.label.setAttribute('fill', ink);
    }

    function rest(token: Token): void {
      paint(token, c.itemDefault, c.text);
    }

    function makeToken(value: number, x: number): Token {
      const group = el('g', { transform: `translate(${x} ${SEAT_CY})` });
      const tile = el('rect', {
        x: -tokenW / 2,
        y: -TOKEN_H / 2,
        width: tokenW,
        height: TOKEN_H,
        rx: 8,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0,
        y: 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: c.text,
      });
      label.textContent = String(value);
      group.appendChild(tile);
      group.appendChild(label);
      return { group, tile, label, seat: 0 };
    }

    function build(pairs: [number, number][]): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      groups = [];
      caption.textContent = '';

      const count = Math.max(1, pairs.length);
      const groupW = Math.min(
        GROUP_MAX_W,
        Math.floor((W - SIDE_MIN * 2 - GROUP_GAP * (count - 1)) / count),
      );
      const totalW = groupW * count + GROUP_GAP * (count - 1);
      const originX = Math.round((W - totalW) / 2);
      tokenW = Math.min(TOKEN_MAX_W, Math.floor((groupW - SEAT_GAP) / 2));
      const half = (tokenW + SEAT_GAP) / 2;

      pairs.forEach((pair, i) => {
        const cx = originX + i * (groupW + GROUP_GAP) + groupW / 2;
        const seatX: [number, number] = [cx - half, cx + half];

        const holder = el('g');
        const traces = el('g');
        holder.appendChild(traces);

        for (const x of seatX) {
          holder.appendChild(
            el('rect', {
              x: x - tokenW / 2,
              y: SEAT_CY - TOKEN_H / 2,
              width: tokenW,
              height: TOKEN_H,
              rx: 8,
              fill: c.bgSubtle,
              stroke: c.border,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 4',
            }),
          );
        }

        const glyph = el('text', {
          x: cx,
          y: GLYPH_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.textMuted,
          opacity: 0,
        });
        holder.appendChild(glyph);

        const left = makeToken(pair[0], seatX[0]);
        const right = makeToken(pair[1], seatX[1]);
        right.seat = 1;
        holder.appendChild(left.group);
        holder.appendChild(right.group);

        root.appendChild(holder);
        groups.push({ seatX, tokens: [left, right], glyph, traces });
      });
    }

    function at(index: number): PairGroup | undefined {
      return groups[index];
    }

    const instance: ViewInstance = {
      init(pairs: [number, number][]): void {
        source = pairs.map(([a, b]): [number, number] => [a, b]);
        build(source);
      },

      reset(): void {
        build(source);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 견줌 — 두 값이 자리에서 들리고 판정 표식이 드러난다. 아무것도 옮기지 않는다. */
      async compare(arg: { pair: number; left: number; right: number; order: StageOrder }): Promise<void> {
        const g = at(arg.pair);
        if (!g) return;
        g.glyph.textContent = `${arg.left} ${SIGN[arg.order]} ${arg.right}`;
        for (const token of g.tokens) paint(token, c.itemComparing, c.stateInk);
        await animate(LIFT_MS, (t) => {
          const e = easeOut(t);
          g.glyph.setAttribute('opacity', String(e));
          g.glyph.setAttribute('y', String(GLYPH_Y + 6 * (1 - e)));
          for (const token of g.tokens) place(token, g.seatX[token.seat], SEAT_CY - LIFT * e);
        });
      },

      /** 맞바꿈 — 두 값이 동시에 엇갈려 지나가 서로의 자리로 건너간다. */
      async cross(arg: { pair: number }): Promise<void> {
        const g = at(arg.pair);
        if (!g) return;
        const [a, b] = g.tokens;
        const from: [number, number] = [g.seatX[a.seat], g.seatX[b.seat]];
        const to: [number, number] = [g.seatX[b.seat], g.seatX[a.seat]];
        const mid = (from[0] + from[1]) / 2;
        // 위로 넘는 쪽과 아래로 지나는 쪽. 같은 순간에 세로로 갈려 있어야 스치지 않는다.
        const apex: [number, number] = [SEAT_CY - 2 * ARC_H, SEAT_CY + 2 * ARC_H];

        const paths = [0, 1].map((k) => {
          const path = el('path', {
            d: `M ${from[k]} ${SEAT_CY} Q ${mid} ${apex[k]} ${to[k]} ${SEAT_CY}`,
            fill: 'none',
            stroke: c.itemSwapping,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            opacity: 0,
          });
          g.traces.appendChild(path);
          return path;
        });

        for (const token of g.tokens) paint(token, c.itemSwapping, c.stateInk);
        await animate(CROSS_MS, (t) => {
          const e = easeInOut(t);
          for (const path of paths) path.setAttribute('opacity', String(0.15 + 0.35 * e));
          [a, b].forEach((token, k) => {
            const x = quadAt(from[k], mid, to[k], e);
            const y = quadAt(SEAT_CY, apex[k], SEAT_CY, e) - LIFT * (1 - e);
            place(token, x, y);
          });
        });

        const seatA = a.seat;
        a.seat = b.seat;
        b.seat = seatA;
        for (const token of g.tokens) {
          rest(token);
          place(token, g.seatX[token.seat], SEAT_CY);
        }
      },

      /** 견줬으나 옮길 이유가 없다 — 들렸던 값이 제 자리로 도로 내려앉는다. */
      async settle(arg: { pair: number }): Promise<void> {
        const g = at(arg.pair);
        if (!g) return;
        await animate(SETTLE_MS, (t) => {
          const e = easeOut(t);
          for (const token of g.tokens) place(token, g.seatX[token.seat], SEAT_CY - LIFT * (1 - e));
        });
        for (const token of g.tokens) rest(token);
      },

      /**
       * rAF 만 쓰므로 예약된 프레임을 모두 거둔다. 타이머는 두지 않는다 (S-view).
       */
      destroy(): void {
        destroyed = true;
        for (const id of pendingFrames) cancelAnimationFrame(id);
        pendingFrames.clear();
        root.remove();
        caption.remove();
      },
    };

    const initial = params.initialData;
    if (initial && Array.isArray(initial.pairs)) {
      const pairs: [number, number][] = [];
      for (const entry of initial.pairs) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [a, b] = entry;
        if (typeof a !== 'number' || typeof b !== 'number') continue;
        pairs.push([a, b]);
      }
      source = pairs;
    }
    build(source);

    return instance;
  },
};
