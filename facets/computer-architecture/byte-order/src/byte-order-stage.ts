/**
 * byte-order-stage — 같은 값이 두 배치로 갈리는 판.
 *
 * 세로는 이야기 차례 그대로다.
 *
 *   값 한 줄        사람이 적는 차례. 칸이 붙어 있어 수 하나로 읽힌다
 *   주소 눈금       0 → 3. 아래 두 줄이 같은 기둥을 쓴다
 *   빅엔디언 줄     값이 곧장 내려앉는다 — 차례 그대로
 *   건너가는 띠     같은 바이트가 서로 자리를 바꾸며 지나간다
 *   리틀엔디언 줄   정반대 차례
 *   잘못 읽은 줄    리틀엔디언 바이트열을 주소 차례대로 이어 붙인 수
 *
 * 바이트 하나는 제 색을 끝까지 지닌다. 색을 눈으로 좇으면 어느 바이트가 어느
 * 주소로 갔는지가 보이고, 건너가는 띠에서 그 색들이 엇갈리는 것이 이 조각이
 * 말하려는 "뒤집힌다" 다.
 *
 * **타일은 돌지도 뒤집히지도 않는다.** 뒤집히는 것은 바이트가 놓이는 차례이지
 * 바이트 안의 비트가 아니라, 칸은 언제나 제자리로 선 채 옮겨 다니기만 한다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 여기서는 자리를 역산하는 데만 쓴다. */
const W = PIECE_CANVAS_W;
/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). 네 줄 + 캡션 두 줄. */
const H = 384;

const TILE_H = 44;
const GAP = 10;
/** 칸 너비의 **상한**만 상수로 둔다. 실제 너비는 캔버스에서 역산한다. */
const TILE_MAX_W = 96;

const GUTTER_X = 14;
const LABEL_W = 104;
const LABEL_GAP = 10;
const LABEL_RIGHT = GUTTER_X + LABEL_W;
const STRIP_LEFT = LABEL_RIGHT + LABEL_GAP;
const READOUT_W = 140;
const SIDE = 14;
const AVAIL = W - STRIP_LEFT - READOUT_W - SIDE;

const VALUE_Y = 22;
const ADDR_BASE = 92;
const BIG_Y = 102;
const LITTLE_Y = 216;
const MISREAD_Y = 284;
const CAPTION_Y1 = 350;
const CAPTION_Y2 = 368;
const CAPTION_MAX_W = W - 32;
const CAPTION_PX = parseFloat(fontSizes.sm);

/** 값 한 줄이 떠올라 앉는 높이. */
const RISE = 16;

/**
 * 도형에 새겨진 표식 — 번역하지 않는다 (C10).
 * `big-endian` · `little-endian` 은 이 분야에서 원어 그대로 통용되는 이름이고,
 * `0x` 와 `=` 는 기호 표기다. 무엇을 뜻하는지는 캡션과 글이 말한다.
 */
const HEX_PREFIX = '0x';
const EQ = '=';
const ADDR = 'addr';
const BIG_ENDIAN = 'big-endian';
const LITTLE_ENDIAN = 'little-endian';

/** 선언이 바이트 수를 말하지 않을 때의 칸 수. 값 자체는 언제나 선언에서 온다. */
const FALLBACK_BYTES = 4;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 큰 수의 자리 구분은 쉼표로 한다 — 빈칸으로 묶으면 언어마다 다르게 읽힌다. */
function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function hex2(b: number): string {
  return b.toString(16).padStart(2, '0');
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
}

/** 한 글자가 한 칸을 다 쓰는 글자대. 폭을 어림하는 데만 쓴다. */
const WIDE = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60]/;

function charW(ch: string, px: number): number {
  return (WIDE.test(ch) ? 1 : 0.55) * px;
}

/**
 * 캡션을 두 줄까지 가른다. 한 줄에 들면 그대로 한 줄이다.
 *
 * 캡션은 열 언어로 뜨는데 같은 뜻이라도 길이가 두 배씩 차이 난다. 자르지 않으면
 * 어떤 언어에서만 문장이 판 밖으로 나가는데, 그 언어로 띄워 본 사람만 안다.
 * 빈칸이 있으면 반쯤에 가장 가까운 빈칸에서, 빈칸이 없는 글(한중일)은 글자
 * 사이에서 가른다.
 */
function wrapTwo(text: string, px: number): string[] {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += charW(ch, px);
  if (total <= CAPTION_MAX_W) return [text];

  const half = total / 2;
  let acc = 0;
  let cut = chars.length;
  let spaceCut = -1;
  let spaceDiff = Infinity;
  for (let i = 0; i < chars.length; i += 1) {
    acc += charW(chars[i] ?? '', px);
    if (acc >= half && cut === chars.length) cut = i + 1;
    if (chars[i] === ' ') {
      const diff = Math.abs(acc - half);
      if (diff < spaceDiff) {
        spaceDiff = diff;
        spaceCut = i + 1;
      }
    }
  }
  const at = spaceCut > 0 ? spaceCut : cut;
  return [chars.slice(0, at).join('').trimEnd(), chars.slice(at).join('').trimStart()];
}

/**
 * initialData 를 좁히는 것은 여기다 — projector 가 없어도 반드시 불리는 유일한
 * 경로이고, 좁히는 규칙이 두 벌이 되지 않게 한 자리에만 둔다 (S-piece).
 */
function readScene(initialData: ViewMountParams['initialData']): { byteCount: number } {
  const d = (initialData ?? {}) as Record<string, unknown>;
  const raw = d.byteCount;
  const n =
    typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : FALLBACK_BYTES;
  return { byteCount: n };
}

export const byteOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const { byteCount } = readScene(params.initialData);

    // 그 폭을 채운다 — 칸 너비는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
    const tileW = Math.min(
      TILE_MAX_W,
      Math.floor((AVAIL - GAP * (byteCount - 1)) / byteCount),
    );
    const stripW = tileW * byteCount + GAP * (byteCount - 1);
    const originX = STRIP_LEFT + Math.round((AVAIL - stripW) / 2);
    const bannerX = originX + Math.round((stripW - tileW * byteCount) / 2);
    const readoutX = originX + stripW + 12;

    /** 주소 i 의 칸이 서는 자리. 두 줄이 같은 기둥을 쓴다. */
    const slotX = (i: number): number => originX + i * (tileW + GAP);
    /** 수 한 줄에서 i 번째 칸. 붙어 있어 통째로 수 하나로 읽힌다. */
    const cellX = (i: number): number => bannerX + i * tileW;

    // 바이트마다 제 색. 큰 자리가 0 번이고, 그 색은 어느 줄에 가도 바뀌지 않는다.
    const seed = categorical(byteCount, 'pastel');
    const hue = (k: number): string => seed[k % seed.length] ?? colors.bgSubtle;

    const root = el('g', {});
    params.canvas.appendChild(root);
    /** 늘 있는 것 — 주소 눈금 · 빈 칸 · 줄 이름 · 캡션. */
    const frame = el('g', {});
    /** 걸음마다 놓였다 지워지는 것. */
    const layer = el('g', {});
    root.appendChild(frame);
    root.appendChild(layer);

    const gutterLabel = (y: number, text: string, fill: string): SVGTextElement => {
      const t = el('text', {
        x: LABEL_RIGHT,
        y,
        'text-anchor': 'end',
        fill,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      t.textContent = text;
      return t;
    };

    const addrLabel = el('text', {
      x: LABEL_RIGHT,
      y: ADDR_BASE,
      'text-anchor': 'end',
      fill: colors.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
    });
    addrLabel.textContent = ADDR;
    frame.appendChild(addrLabel);

    for (let i = 0; i < byteCount; i += 1) {
      const n = el('text', {
        x: slotX(i) + tileW / 2,
        y: ADDR_BASE,
        'text-anchor': 'middle',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      n.textContent = String(i);
      frame.appendChild(n);
      for (const y of [BIG_Y, LITTLE_Y]) {
        frame.appendChild(
          el('rect', {
            x: slotX(i),
            y,
            width: tileW,
            height: TILE_H,
            rx: 4,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '5 4',
          }),
        );
      }
    }

    frame.appendChild(gutterLabel(BIG_Y + 27, BIG_ENDIAN, colors.textMuted));
    frame.appendChild(gutterLabel(LITTLE_Y + 27, LITTLE_ENDIAN, colors.textMuted));

    const captionOf = (y: number): SVGTextElement =>
      el('text', {
        x: W / 2,
        y,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
    const caption1 = captionOf(CAPTION_Y1);
    const caption2 = captionOf(CAPTION_Y2);
    frame.appendChild(caption1);
    frame.appendChild(caption2);

    // ── 움직임. 기다리던 것을 destroy 가 반드시 푼다 (S-piece).
    const waiters = new Set<() => void>();
    const frameIds = new Set<number>();
    let destroyed = false;

    function tween(ms: number, step: (p: number) => void): Promise<void> {
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
        const run = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          step(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frameIds.delete(id);
            run();
          });
          frameIds.add(id);
        };
        run();
      });
    }

    const moveTo = (g: SVGGElement, x: number, y: number): void => {
      g.setAttribute('transform', `translate(${x},${y})`);
    };

    const tile = (byte: number, fill: string, x: number, y: number): SVGGElement => {
      const g = el('g', { transform: `translate(${x},${y})` });
      g.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: tileW,
          height: TILE_H,
          rx: 4,
          fill,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      const t = el('text', {
        x: tileW / 2,
        y: TILE_H / 2 + 6,
        'text-anchor': 'middle',
        // 고정 타일 위에는 고정 잉크. 테마를 따라 뒤집으면 글자가 사라진다.
        fill: colors.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
      });
      t.textContent = hex2(byte);
      g.appendChild(t);
      layer.appendChild(g);
      return g;
    };

    const prefixAt = (y: number): SVGTextElement => {
      const t = el('text', {
        x: bannerX - 7,
        y: y + TILE_H / 2 + 6,
        'text-anchor': 'end',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        opacity: 0,
      });
      t.textContent = HEX_PREFIX;
      layer.appendChild(t);
      return t;
    };

    /** 잰 값은 재는 그 자리에 — 줄 오른쪽 끝, 그 줄과 같은 높이에 둔다. */
    const readoutAt = (value: number, y: number, fill: string): SVGTextElement => {
      const t = el('text', {
        x: readoutX,
        y: y + TILE_H / 2 + 5,
        fill,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        opacity: 0,
      });
      t.textContent = `${EQ} ${group(value)}`;
      layer.appendChild(t);
      return t;
    };

    const slideIn = (nodes: SVGElement[]): Promise<void> =>
      tween(280, (p) => {
        const e = ease(p);
        for (const n of nodes) {
          n.setAttribute('opacity', String(e));
          n.setAttribute('transform', `translate(${(1 - e) * -12},0)`);
        }
      });

    /** 읽어 나가는 자리를 짚는 테. 어느 쪽으로 훑는지가 곧 규칙이다. */
    const readHead = (stroke: string, x: number, y: number): SVGGElement => {
      const g = el('g', { transform: `translate(${x},${y})` });
      g.appendChild(
        el('rect', {
          x: -3,
          y: -3,
          width: tileW + 6,
          height: TILE_H + 6,
          rx: 6,
          fill: 'none',
          stroke,
          'stroke-width': 2,
        }),
      );
      layer.appendChild(g);
      return g;
    };

    /** 리틀엔디언 줄에 앉은 바이트. 잘못 읽는 걸음이 이것을 그대로 이어 붙인다. */
    let littleSlots: number[] = [];

    function clear(): void {
      layer.textContent = '';
      littleSlots = [];
    }

    async function showValue(bytes: number[]): Promise<void> {
      clear();
      const prefix = prefixAt(VALUE_Y);
      const tiles = bytes.map((b, i) => tile(b, hue(i), cellX(i), VALUE_Y + RISE));
      for (const g of tiles) g.setAttribute('opacity', '0');

      const dur = 420;
      const stagger = 70;
      const total = dur + stagger * Math.max(0, tiles.length - 1);
      await tween(total, (p) => {
        const t = p * total;
        prefix.setAttribute('opacity', String(clamp01(t / 300)));
        for (let i = 0; i < tiles.length; i += 1) {
          const g = tiles[i];
          if (!g) continue;
          const e = ease(clamp01((t - i * stagger) / dur));
          g.setAttribute('opacity', String(e));
          moveTo(g, cellX(i), VALUE_Y + RISE * (1 - e));
        }
      });
    }

    /** 값이 곧장 내려앉는다. 차례가 그대로라 기둥이 어긋나지 않는다. */
    async function layBig(slots: number[]): Promise<void> {
      const tiles = slots.map((b, i) => tile(b, hue(i), cellX(i), VALUE_Y));
      const dur = 560;
      const stagger = 80;
      const total = dur + stagger * Math.max(0, tiles.length - 1);
      await tween(total, (p) => {
        const t = p * total;
        for (let i = 0; i < tiles.length; i += 1) {
          const g = tiles[i];
          if (!g) continue;
          const e = ease(clamp01((t - i * stagger) / dur));
          moveTo(g, cellX(i) + (slotX(i) - cellX(i)) * e, VALUE_Y + (BIG_Y - VALUE_Y) * e);
        }
      });
    }

    /**
     * 같은 바이트가 서로 건너간다. 주소 j 에 앉을 바이트는 빅엔디언 줄에서
     * 주소 n-1-j 에 있던 것이라, 네 길이 한가운데서 엇갈린다. 바깥 짝은 아래로
     * 처지고 안쪽 짝은 위로 솟게 해 한 점에서 뭉치지 않도록 한다.
     */
    async function layLittle(slots: number[]): Promise<void> {
      littleSlots = [...slots];
      const n = slots.length;
      const tiles: SVGGElement[] = [];
      for (let j = 0; j < n; j += 1) {
        const from = n - 1 - j;
        tiles.push(tile(slots[j] ?? 0, hue(from), slotX(from), BIG_Y));
      }

      const dur = 620;
      const stagger = 90;
      const total = dur + stagger * Math.max(0, n - 1);
      await tween(total, (p) => {
        const t = p * total;
        for (let j = 0; j < n; j += 1) {
          const g = tiles[j];
          if (!g) continue;
          const from = n - 1 - j;
          const sx = slotX(from);
          const ex = slotX(j);
          const e = ease(clamp01((t - j * stagger) / dur));
          const cx = (sx + ex) / 2;
          const cy =
            (BIG_Y + LITTLE_Y) / 2 + (Math.abs(ex - sx) / Math.max(1, stripW)) * 46 - 20;
          const u = 1 - e;
          moveTo(
            g,
            u * u * sx + 2 * u * e * cx + e * e * ex,
            u * u * BIG_Y + 2 * u * e * cy + e * e * LITTLE_Y,
          );
        }
      });
    }

    /**
     * 두 줄을 제 규칙으로 읽는다. 빅엔디언은 낮은 주소가 큰 자리라 왼쪽부터,
     * 리틀엔디언은 높은 주소가 큰 자리라 오른쪽부터 훑는다. 훑는 방향이 정반대인데
     * 나오는 수는 같다 — 그것이 이 걸음이 하는 말이다.
     */
    async function readBoth(big: number, little: number): Promise<void> {
      const last = Math.max(0, byteCount - 1);
      const headBig = readHead(colors.accent, slotX(0), BIG_Y);
      const headLittle = readHead(colors.accent, slotX(last), LITTLE_Y);
      await tween(760, (p) => {
        const e = ease(p);
        moveTo(headBig, slotX(0) + (slotX(last) - slotX(0)) * e, BIG_Y);
        moveTo(headLittle, slotX(last) + (slotX(0) - slotX(last)) * e, LITTLE_Y);
      });
      headBig.remove();
      headLittle.remove();
      await slideIn([readoutAt(big, BIG_Y, colors.text), readoutAt(little, LITTLE_Y, colors.text)]);
    }

    /**
     * 같은 줄을 빅엔디언 규칙으로 — 왼쪽부터 — 훑는다. 훑으며 지나는 칸이
     * 차례대로 아래로 떨어져 수 한 줄을 이룬다. 칸은 그대로인데 줄이 거꾸로
     * 읽혀 위의 값과 다른 수가 된다.
     */
    async function misread(value: number): Promise<void> {
      const n = littleSlots.length > 0 ? littleSlots.length : byteCount;
      const last = Math.max(0, n - 1);
      const head = readHead(colors.danger, slotX(0), LITTLE_Y);
      layer.appendChild(gutterLabel(MISREAD_Y + 27, BIG_ENDIAN, colors.danger));
      const prefix = prefixAt(MISREAD_Y);

      const copies: SVGGElement[] = [];
      for (let i = 0; i < n; i += 1) {
        const g = tile(littleSlots[i] ?? 0, hue(n - 1 - i), slotX(i), LITTLE_Y);
        g.setAttribute('opacity', '0');
        copies.push(g);
      }

      const total = 940;
      await tween(total, (p) => {
        const t = p * total;
        const sweep = ease(clamp01(t / 660));
        moveTo(head, slotX(0) + (slotX(last) - slotX(0)) * sweep, LITTLE_Y);
        prefix.setAttribute('opacity', String(clamp01((t - 240) / 300)));
        for (let i = 0; i < n; i += 1) {
          const g = copies[i];
          if (!g) continue;
          const e = ease(clamp01((t - i * 160) / 360));
          g.setAttribute('opacity', String(clamp01(e * 5)));
          moveTo(g, slotX(i) + (cellX(i) - slotX(i)) * e, LITTLE_Y + (MISREAD_Y - LITTLE_Y) * e);
        }
      });
      head.remove();
      await slideIn([readoutAt(value, MISREAD_Y, colors.danger)]);
    }

    function setCaption(text: string): void {
      const lines = wrapTwo(text, CAPTION_PX);
      caption1.textContent = lines[0] ?? '';
      caption2.textContent = lines[1] ?? '';
    }

    function reset(): void {
      clear();
      caption1.textContent = '';
      caption2.textContent = '';
    }

    return {
      showValue,
      layBig,
      layLittle,
      readBoth,
      misread,
      setCaption,
      reset,

      destroy(): void {
        destroyed = true;
        // 걸어 둔 것을 먼저 거두고,
        for (const id of frameIds) cancelAnimationFrame(id);
        frameIds.clear();
        // 기다리던 것을 깨운다. 취소된 프레임은 아예 불리지 않으므로 이 줄이
        // 없으면 projector 가 기다리는 promise 가 영영 안 풀린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
