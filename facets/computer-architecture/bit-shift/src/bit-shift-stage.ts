/**
 * 자리 옮기기 stage — 미끄러지는 그림.
 *
 * 동사가 "미끄러진다" 이므로 화면에서 실제로 미끄러져야 한다. 칸(자리)은 붙박이로
 * 서 있고 비트만 통째로 옆으로 옮겨간다. 칸 위에는 그 자리의 무게(128 … 1)가
 * 적혀 있어서, 비트가 한 칸 왼쪽으로 옮겨 앉으면 그 비트가 올라선 무게가 두 배가
 * 되는 것이 눈에 보인다 — 곱셈을 말로 주장하지 않고 자리로 보인다.
 *
 * 끝을 넘어가는 비트는 그릇 밖으로 미끄러져 나가며 사라진다. 그 걸음에서만 아래
 * 식의 소수점 자리가 남는데, 그 조각이 곧 떨어져 나간 비트다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const W = PIECE_CANVAS_W;
const H = 168;

const PLACE_Y = 25; // 자리 무게 글자 baseline
const RAIL_Y = 36; // 칸 윗변
const RAIL_H = 54;
const EXPR_Y = 114; // 식 baseline
const CAP_Y = 140; // 캡션 첫 줄 baseline
const CAP_LINE = 17;
const CAP_SIDE = 24;

/** 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). */
const CELL_MAX_W = 64;
const SIDE_MIN = 40;

const PLACE_MS = 300; // 칸에 내려앉는 시간
const SLIDE_MS = 420; // 한 칸 미는 시간
const CLEAR_MS = 170; // 있던 것을 걷는 시간
const DROP_RISE = 28; // 내려앉기 전 떠 있는 높이
const FALL_DIP = 12; // 그릇 밖으로 나간 비트가 떨어지며 내려가는 거리

/** projector 가 한 걸음마다 넘겨 주는 것. 좁히는 일은 projector 가 이미 마쳤다. */
export type BitShiftStageFrame = {
  dir: 'left' | 'right';
  start: number;
  shiftCount: number;
  value: number;
  bits: string;
  factor: number;
  exact: number;
  dropped: number;
  caption: string;
};

type Scene = { bitCount: number };

/**
 * `initialData` 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이고, 좁히는 규칙이 두 벌이 되지 않게 한다 (S-piece).
 */
function readScene(initialData: unknown): Scene {
  const d = (
    typeof initialData === 'object' && initialData !== null ? initialData : {}
  ) as Record<string, unknown>;
  const raw = d.bits;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 8;
  return { bitCount: Math.min(16, Math.max(2, n)) };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 버림 없는 셈을 글자로. 200 ÷ 16 이면 '12.5' 가 된다. */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export const bitShiftStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const { bitCount } = readScene(params.initialData);

    // 남는 폭을 좌우 여백으로 버리지 않는다 — 칸 폭은 캔버스에서 역산한다.
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / bitCount));
    const railW = cellW * bitCount;
    const originX = Math.round((W - railW) / 2);
    const slotX = (slot: number): number => originX + slot * cellW;

    const root = el('g');
    const railLayer = el('g');
    const tokenLayer = el('g');
    root.appendChild(railLayer);
    root.appendChild(tokenLayer);
    svg.appendChild(root);

    // ── 붙박이 칸. 비트가 떠난 자리에서는 바탕의 0 이 드러난다.
    const placeLabels: SVGTextElement[] = [];
    for (let j = 0; j < bitCount; j += 1) {
      railLayer.appendChild(
        el('rect', {
          x: slotX(j) + 2,
          y: RAIL_Y,
          width: cellW - 4,
          height: RAIL_H,
          rx: 7,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      const zero = el('text', {
        x: slotX(j) + cellW / 2,
        y: RAIL_Y + RAIL_H / 2 + 7,
        'text-anchor': 'middle',
        fill: c.textMuted,
        opacity: 0.5,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      zero.textContent = '0';
      railLayer.appendChild(zero);

      // 자리의 무게. 수 표기라 문안이 아니다 (C10 표식).
      const place = el('text', {
        x: slotX(j) + cellW / 2,
        y: PLACE_Y,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      place.textContent = String(2 ** (bitCount - 1 - j));
      placeLabels.push(place);
      railLayer.appendChild(place);
    }

    // ── 식 두 줄. 왼쪽은 실제로 일어난 밀기, 오른쪽은 버림 없는 셈.
    const mainText = el('text', {
      x: originX,
      y: EXPR_Y,
      'text-anchor': 'start',
      fill: c.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
    });
    const mirrorText = el('text', {
      x: originX + railW,
      y: EXPR_Y,
      'text-anchor': 'end',
      fill: c.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
    });
    root.appendChild(mainText);
    root.appendChild(mirrorText);

    const capSize = Number.parseFloat(fontSizes.md);
    const capLines = [0, 1].map((i) => {
      const line = el('text', {
        x: W / 2,
        y: CAP_Y + i * CAP_LINE,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      root.appendChild(line);
      return line;
    });

    // ── 움직이는 것들.
    type Token = { g: SVGGElement; rect: SVGRectElement; slot: number };
    let tokens: Token[] = [];

    let destroyed = false;
    const waiters = new Set<() => void>();
    // 기다림은 전부 프레임 위에 있다 — 걸어 둔 타이머가 없다.
    const raf = new Set<number>();

    /**
     * destroy 가 프레임만 거두면 취소된 tick 이 아예 불리지 않아 promise 를 풀
     * 길이 사라진다. 기다리던 것을 따로 깨운다 (S-piece).
     */
    function animate(duration: number, onProgress: (eased: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
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
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / duration);
          onProgress(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            raf.delete(id);
            tick();
          });
          raf.add(id);
        };
        tick();
      });
    }

    function setToken(t: Token, x: number, dy: number, opacity: number): void {
      t.g.setAttribute('transform', `translate(${x}, ${RAIL_Y + dy})`);
      t.g.setAttribute('opacity', String(opacity));
    }

    function makeToken(slot: number): Token {
      const g = el('g');
      const rect = el('rect', {
        x: 2,
        y: 0,
        width: cellW - 4,
        height: RAIL_H,
        rx: 7,
        fill: c.primary,
      });
      const glyph = el('text', {
        x: cellW / 2,
        y: RAIL_H / 2 + 7,
        'text-anchor': 'middle',
        fill: c.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      glyph.textContent = '1';
      g.appendChild(rect);
      g.appendChild(glyph);
      tokenLayer.appendChild(g);
      const t: Token = { g, rect, slot };
      setToken(t, slotX(slot), 0, 1);
      return t;
    }

    /** 화면을 비트열과 글자 그대로 맞춘다. 움직임이 끝난 뒤의 진실은 이쪽이다. */
    function syncTokens(bits: string): void {
      for (const t of tokens) t.g.remove();
      tokens = [];
      for (let j = 0; j < bitCount; j += 1) {
        if (bits[j] === '1') tokens.push(makeToken(j));
      }
    }

    /** 비트가 올라선 자리의 무게만 진하게. 값은 그 무게들의 합이다. */
    function litPlaces(bits: string): void {
      for (let j = 0; j < placeLabels.length; j += 1) {
        const label = placeLabels[j];
        if (!label) continue;
        const on = bits[j] === '1';
        label.setAttribute('fill', on ? c.text : c.textMuted);
        label.setAttribute('font-weight', on ? '700' : '400');
      }
    }

    function setStrip(f: BitShiftStageFrame | null): void {
      mainText.textContent = '';
      while (mirrorText.firstChild) mirrorText.removeChild(mirrorText.firstChild);
      if (!f) return;

      mainText.textContent = `${f.start} ${f.dir === 'left' ? '<<' : '>>'} ${f.shiftCount} = ${f.value}`;

      // 버림 없는 셈. 오른쪽 밀기에서 1 이 떨어져 나간 걸음에서만 소수점이 남고,
      // 그 조각이 곧 그릇 밖으로 나간 비트다.
      const exact = fmt(f.exact);
      const dot = exact.indexOf('.');
      const head = el('tspan');
      head.textContent = `${f.start} ${f.dir === 'left' ? '×' : '÷'} ${f.factor} = ${
        dot < 0 ? exact : exact.slice(0, dot)
      }`;
      mirrorText.appendChild(head);
      if (dot >= 0) {
        const tail = el('tspan', { fill: c.danger });
        tail.textContent = exact.slice(dot);
        mirrorText.appendChild(tail);
      }
    }

    function charWidth(ch: string, size: number): number {
      const code = ch.codePointAt(0) ?? 0;
      const wide =
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xff60);
      return wide ? size : size * 0.54;
    }

    /**
     * 캡션은 두 줄까지 담는다. 세로는 마운트 뒤 바뀌지 않아야 하므로 (S-view)
     * 줄 자리를 늘 잡아 두고 글만 나눠 넣는다.
     */
    function setCaption(text: string): void {
      const budget = W - CAP_SIDE * 2;
      const lines = ['', ''];
      let at = 0;
      for (const word of text.split(' ')) {
        const joined = lines[at] === '' ? word : `${lines[at]} ${word}`;
        let width = 0;
        for (const ch of joined) width += charWidth(ch, capSize);
        if (at === 0 && width > budget && lines[0] !== '') {
          at = 1;
          lines[1] = word;
          continue;
        }
        lines[at] = joined;
      }
      for (let k = 0; k < capLines.length; k += 1) {
        const line = capLines[k];
        if (line) line.textContent = lines[k] ?? '';
      }
    }

    async function fadeOut(): Promise<void> {
      if (tokens.length === 0) return;
      const going = tokens;
      tokens = [];
      await animate(CLEAR_MS, (p) => {
        for (const t of going) setToken(t, slotX(t.slot), 0, 1 - p);
      });
      for (const t of going) t.g.remove();
    }

    function clear(): void {
      for (const t of tokens) t.g.remove();
      tokens = [];
      litPlaces('');
      setStrip(null);
      setCaption('');
    }

    return {
      /** 시작값을 칸에 놓는다 — 위에서 내려앉는다. */
      async place(frame: BitShiftStageFrame): Promise<void> {
        await fadeOut();
        setStrip(null);
        setCaption('');
        litPlaces('');
        syncTokens(frame.bits);
        const landing = tokens;
        for (const t of landing) setToken(t, slotX(t.slot), -DROP_RISE, 0);
        await animate(PLACE_MS, (p) => {
          for (const t of landing) setToken(t, slotX(t.slot), -DROP_RISE * (1 - p), p);
        });
        for (const t of landing) setToken(t, slotX(t.slot), 0, 1);
        litPlaces(frame.bits);
        setStrip(frame);
        setCaption(frame.caption);
      },

      /** 무리가 통째로 한 칸 미끄러진다. 그릇을 벗어나는 것은 나가면서 사라진다. */
      async shift(frame: BitShiftStageFrame): Promise<void> {
        const delta = frame.dir === 'left' ? -1 : 1;
        const moves = tokens.map((t) => {
          const next = t.slot + delta;
          return {
            t,
            from: slotX(t.slot),
            to: slotX(next),
            leaving: next < 0 || next >= bitCount,
          };
        });
        // 버려지는 비트라는 신호 (severity).
        for (const m of moves) {
          if (m.leaving) m.t.rect.setAttribute('fill', c.danger);
        }
        await animate(SLIDE_MS, (p) => {
          for (const m of moves) {
            const x = m.from + (m.to - m.from) * p;
            if (m.leaving) setToken(m.t, x, FALL_DIP * p, 1 - p);
            else setToken(m.t, x, 0, 1);
          }
        });
        syncTokens(frame.bits);
        litPlaces(frame.bits);
        setStrip(frame);
        setCaption(frame.caption);
      },

      clear,

      destroy(): void {
        destroyed = true;
        for (const id of raf) cancelAnimationFrame(id);
        raf.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
