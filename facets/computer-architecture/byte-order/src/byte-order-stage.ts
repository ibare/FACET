/**
 * byte-order-stage — 장면(Scene) 하나를 받아 그 걸음의 화면을 통째로 세운다.
 *
 * 앞 화면과 견주지 않으므로 되돌릴 명령이 없고, 어느 걸음에서 오든 결과가 같다
 * (S-scene).
 *
 * ── 세로는 이야기 차례 그대로다
 *
 *   값 한 줄        사람이 적는 차례. 칸이 붙어 있어 수 하나로 읽힌다
 *   주소 눈금       0 → 3. 아래 두 줄이 같은 기둥을 쓴다
 *   빅엔디언 줄     값이 곧장 내려앉는다 — 차례 그대로
 *   리틀엔디언 줄   같은 바이트가 서로 건너가 정반대 차례로
 *   잘못 읽은 줄    리틀엔디언 바이트열을 주소 차례대로 이어 붙인 수
 *
 * **두 배치는 나란히 선다.** 리틀엔디언 줄이 빅엔디언 줄을 갈아 끼우지 않는다 —
 * 같은 자리에 갈아 끼우면 견줄 짝이 사라지고, 이 조각은 견주는 것이 전부다.
 *
 * ── 두 칠이 부딪히지 않게 축을 가른다
 *
 *   · **채움 = 바이트의 값** — 바이트마다 제 색을 끝까지 지닌다. 색을 눈으로
 *     좇으면 어느 바이트가 어느 주소로 갔는지가 보이고, 그 색들이 두 줄에서
 *     엇갈리는 것이 이 조각이 말하는 "뒤집힌다" 다.
 *   · **테두리 = 어느 읽기가 이 바이트를 윗자리로 보았나** — 제 규칙으로 읽은
 *     쪽은 accent, 차례를 모르고 읽은 쪽은 danger 로 그 칸을 두른다. **머문다.**
 *   · **훑는 테 = 지나가는 강조** — 운동에만 산다. 멎은 화면에는 없다.
 *
 * 옛 화면은 훑는 테를 걸음이 끝나며 `remove()` 했다. 그래서 완주 화면에는 *어느
 * 끝에서 읽기 시작했는가* 가 한 글자도 남지 않았는데, 그것이 바로 이 조각의
 * 주장이다. 이제 리틀엔디언 줄 **양 끝에 표식 둘이 나란히 선다** — 오른쪽 끝에서
 * 읽으면 제 수가, 왼쪽 끝에서 읽으면 엉뚱한 수가 나온다.
 *
 * ── 타일은 돌지도 뒤집히지도 않는다
 *
 * 뒤집히는 것은 바이트가 놓이는 차례이지 바이트 안의 비트가 아니라, 칸은 언제나
 * 제자리로 선 채 옮겨 다니기만 한다.
 *
 * 캔버스 가로는 러너가 `PIECE_CANVAS_W` 로 준다. 세로는 그림이 정하므로 장면을
 * 받을 때마다 `viewBox` 를 다시 세운다 (S-piece · S-view).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  littleRow,
  msbAddrOf,
  originAt,
  readOrderOf,
  rowOf,
  valueOf,
  type ByteOrderReading,
  type ByteOrderScene,
} from './scene.js';

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
 * 표식이 칸에서 물러나는 거리.
 *
 * 제 규칙으로 읽은 쪽은 칸에 바싹, 차례를 모르고 읽은 쪽은 그 바깥에 선다.
 * 리틀엔디언 줄에는 표식이 둘 서는데 (양 끝) 바이트가 하나뿐인 값에서는 그 둘이
 * 같은 칸에 온다 — 물러나는 거리를 갈라 두면 그때도 둘 다 보인다.
 */
const MARK_PAD = 3;
const MISREAD_MARK_PAD = 7;
const MARK_STROKE = 2;

/** 훑는 테. 운동에만 산다. */
const SWEEP_PAD = 3;
/** 훑는 테가 목표에 닿은 뒤 스러지는 몫. */
const SWEEP_FADE_MS = 160;

// ── 걸음마다의 박자. 옮기기 전과 같은 값이라 걸음 벽시계가 달라지지 않는다.
const SHOW_DUR = 420;
const SHOW_STAGGER = 70;
const BIG_DUR = 560;
const BIG_STAGGER = 80;
const LITTLE_DUR = 620;
const LITTLE_STAGGER = 90;
const READ_SWEEP_MS = 760;
const MISREAD_SWEEP_MS = 660;
const MISREAD_BODY_MS = 940;
const MISREAD_DROP_DUR = 360;
const MISREAD_DROP_STAGGER = 160;
/** 잰 값이 옆에서 밀려 들어오는 몫. */
const SLIDE_MS = 280;
const SLIDE_DX = 12;
/** 머무는 표식이 배어 나오는 몫. 훑기가 시작되는 칸에 곧바로 남는다. */
const MARK_FADE_MS = 200;

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

/** 주소 차례로 앉는 두 줄이 서는 높이. */
const ROW_Y: Record<'big' | 'little', number> = { big: BIG_Y, little: LITTLE_Y };

/**
 * 자리 셈의 결과. 바탕(바이트 수)만 있으면 정해진다.
 *
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 재면 순회 순서가 곧
 * 숨은 상태가 된다.
 */
type Layout = {
  n: number;
  tileW: number;
  stripW: number;
  originX: number;
  bannerX: number;
  readoutX: number;
};

function layoutOf(n: number): Layout {
  // 그 폭을 채운다 — 칸 너비는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
  const tileW = Math.min(TILE_MAX_W, Math.floor((AVAIL - GAP * (n - 1)) / n));
  const stripW = tileW * n + GAP * (n - 1);
  const originX = STRIP_LEFT + Math.round((AVAIL - stripW) / 2);
  return {
    n,
    tileW,
    stripW,
    originX,
    bannerX: originX + Math.round((stripW - tileW * n) / 2),
    readoutX: originX + stripW + 12,
  };
}

/** 주소 i 의 칸이 서는 자리. 두 줄이 같은 기둥을 쓴다. */
const slotX = (L: Layout, i: number): number => L.originX + i * (L.tileW + GAP);
/** 수 한 줄에서 i 번째 칸. 붙어 있어 통째로 수 하나로 읽힌다. */
const cellX = (L: Layout, i: number): number => L.bannerX + i * L.tileW;

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
 * 한 번 그린 화면에서 운동이 다시 잡는 손잡이.
 *
 * 정적 그리기가 매번 새로 지으므로, 운동은 **그때의 손잡이**를 쥔다. 되짚기나
 * `destroy` 가 가운데 끼어들면 이미 떨어져 나간 노드를 붙들게 되므로 깨어난 운동은
 * 자기 세대를 확인하고 아니면 손대지 않는다.
 */
type Refs = {
  layout: Layout;
  /** 값 한 줄의 칸. 첨자가 곧 적는 차례다. */
  written: SVGGElement[];
  writtenPrefix: SVGTextElement | null;
  /** 주소 차례로 앉은 두 줄의 칸. */
  rows: Record<'big' | 'little', SVGGElement[]>;
  /** 잘못 읽은 줄의 칸. */
  misreadTiles: SVGGElement[];
  misreadPrefix: SVGTextElement | null;
  misreadLabel: SVGTextElement | null;
  /** 머무는 윗자리 표식. 읽기마다 많아야 하나. */
  marks: Partial<Record<ByteOrderReading, SVGRectElement>>;
  /** 잰 값. 읽기마다 많아야 하나. */
  readouts: Partial<Record<ByteOrderReading, SVGTextElement>>;
  /** 운동에만 사는 것들이 사는 층. 정적 그리기는 비운 채 둔다. */
  transient: SVGGElement;
};

export const byteOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const c = getColors(params.theme);
    // 문안을 만드는 것이 이제 그리는 쪽의 일이다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    // ── 시간 ─────────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const clock = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /** 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다. */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(run: () => void): void {
      if (hasRaf) {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          run();
        });
        frames.add(id);
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        run();
      }, 16);
      timers.add(id);
    }

    /**
     * `draw` 에 **날 것 그대로의** 진행(0→1)을 넘긴다.
     *
     * 이 조각의 걸음은 칸마다 시차를 두고 흐르므로 완화는 칸마다 따로 먹인다.
     * 여기서 미리 완화를 먹이면 시차가 어긋난다.
     */
    function tween(ms: number, my: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(my) || ms <= 0) {
          resolve();
          return;
        }
        const started = clock();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(my)) {
            finish();
            return;
          }
          const p = Math.min(1, (clock() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          nextFrame(tick);
        };
        // 첫 프레임을 동기로 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
        // 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        draw(0);
        nextFrame(tick);
      });
    }

    // ── 그리기 도구 ──────────────────────────────────────────────────
    function put<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    const root = put(canvas, 'g', {});

    const moveTo = (g: SVGGElement, x: number, y: number): void => {
      g.setAttribute('transform', `translate(${x},${y})`);
    };

    // ── 문안 ────────────────────────────────────────────────────────
    function captionText(scene: ByteOrderScene): string | null {
      if (!scene.caption) return null;
      switch (scene.caption.kind) {
        case 'value':
          return t(
            'caption.value',
            'One number, written the way people write it: the biggest part first.',
          );
        case 'big':
          return t('caption.big', 'big-endian puts the biggest byte at the lowest address.');
        case 'little':
          return t(
            'caption.little',
            'little-endian puts the smallest byte at the lowest address. Same bytes, opposite order.',
          );
        case 'same':
          return t(
            'caption.same',
            'Read each layout by its own rule and the number that comes back is the same.',
          );
        case 'misread':
          return t(
            'caption.misread',
            'Read the little-endian bytes as big-endian instead: a different number.',
          );
      }
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────
    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않고 늘 통째로 짓는다 —
     * 그래서 되돌릴 명령이 필요 없고, 어느 걸음에서 오든 결과가 같다 (S-scene).
     */
    function drawStatic(scene: ByteOrderScene): Refs {
      root.textContent = '';
      // `init()` 이 없으므로 캔버스 세로도 매번 여기서 정한다.
      canvas.setAttribute('viewBox', `0 0 ${W} ${H}`);

      const L = layoutOf(scene.byteCount);
      // 색판은 **바탕**에서 한 번에 센다. 지금까지 드러난 수로 정하면 칸이 하나 더
      // 드러날 때마다 이미 칠한 색이 통째로 갈린다.
      const seed = categorical(scene.byteCount, 'pastel');
      const hue = (k: number): string => seed[k % seed.length] ?? c.bgSubtle;

      const refs: Refs = {
        layout: L,
        written: [],
        writtenPrefix: null,
        rows: { big: [], little: [] },
        misreadTiles: [],
        misreadPrefix: null,
        misreadLabel: null,
        marks: {},
        readouts: {},
        transient: put(root, 'g', {}),
      };

      const gutterLabel = (y: number, text: string, fill: string): SVGTextElement =>
        put(
          root,
          'text',
          {
            x: LABEL_RIGHT,
            y,
            'text-anchor': 'end',
            fill,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          text,
        );

      const tile = (byte: number, fill: string, x: number, y: number): SVGGElement => {
        const g = put(root, 'g', { transform: `translate(${x},${y})` });
        put(g, 'rect', {
          x: 0,
          y: 0,
          width: L.tileW,
          height: TILE_H,
          rx: 4,
          fill,
          stroke: c.border,
          'stroke-width': 1,
        });
        put(
          g,
          'text',
          {
            x: L.tileW / 2,
            y: TILE_H / 2 + 6,
            'text-anchor': 'middle',
            // 고정 타일 위에는 고정 잉크. 테마를 따라 뒤집으면 글자가 사라진다.
            fill: c.stateInk,
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
          },
          hex2(byte),
        );
        return g;
      };

      const prefixAt = (y: number): SVGTextElement =>
        put(
          root,
          'text',
          {
            x: L.bannerX - 7,
            y: y + TILE_H / 2 + 6,
            'text-anchor': 'end',
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          HEX_PREFIX,
        );

      /** 잰 값은 재는 그 자리에 — 줄 오른쪽 끝, 그 줄과 같은 높이에 둔다. */
      const readoutAt = (value: number, y: number, fill: string): SVGTextElement =>
        put(
          root,
          'text',
          {
            x: L.readoutX,
            y: y + TILE_H / 2 + 5,
            fill,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          `${EQ} ${group(value)}`,
        );

      /**
       * 그 읽기가 윗자리로 본 칸을 두른다. **머문다** — 완주 화면에 남아 어느
       * 끝에서 읽기 시작했는지를 말한다.
       */
      const markAt = (x: number, y: number, stroke: string, pad: number): SVGRectElement =>
        put(root, 'rect', {
          x: x - pad,
          y: y - pad,
          width: L.tileW + pad * 2,
          height: TILE_H + pad * 2,
          rx: 6,
          fill: 'none',
          stroke,
          'stroke-width': MARK_STROKE,
        });

      // ── 늘 있는 것 — 주소 눈금 · 빈 칸 · 줄 이름.
      put(
        root,
        'text',
        {
          x: LABEL_RIGHT,
          y: ADDR_BASE,
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        },
        ADDR,
      );

      for (let i = 0; i < L.n; i += 1) {
        put(
          root,
          'text',
          {
            x: slotX(L, i) + L.tileW / 2,
            y: ADDR_BASE,
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          },
          String(i),
        );
        for (const y of [BIG_Y, LITTLE_Y]) {
          put(root, 'rect', {
            x: slotX(L, i),
            y,
            width: L.tileW,
            height: TILE_H,
            rx: 4,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '5 4',
          });
        }
      }

      gutterLabel(BIG_Y + 27, BIG_ENDIAN, c.textMuted);
      gutterLabel(LITTLE_Y + 27, LITTLE_ENDIAN, c.textMuted);

      // ── 값 한 줄. 사람이 적는 차례 그대로, 칸이 붙어 수 하나로 읽힌다.
      if (scene.shown) {
        refs.writtenPrefix = prefixAt(VALUE_Y);
        for (let i = 0; i < scene.bytes.length; i += 1) {
          refs.written.push(tile(scene.bytes[i] ?? 0, hue(i), cellX(L, i), VALUE_Y));
        }
      }

      // ── 주소 차례로 앉는 두 줄. 둘은 갈아 끼워지지 않고 나란히 남는다.
      const laid: Record<'big' | 'little', boolean> = {
        big: scene.bigLaid,
        little: scene.littleLaid,
      };
      for (const side of ['big', 'little'] as const) {
        if (!laid[side]) continue;
        const row = rowOf(scene, side);
        for (let addr = 0; addr < L.n; addr += 1) {
          refs.rows[side].push(
            tile(
              row[addr] ?? 0,
              hue(originAt(scene, side, addr)),
              slotX(L, addr),
              ROW_Y[side],
            ),
          );
        }
      }

      // ── 잘못 읽은 줄. 리틀엔디언 줄을 주소 차례대로 이어 붙인 것이다.
      if (scene.misread) {
        refs.misreadLabel = gutterLabel(MISREAD_Y + 27, BIG_ENDIAN, c.danger);
        refs.misreadPrefix = prefixAt(MISREAD_Y);
        const row = littleRow(scene);
        for (let addr = 0; addr < L.n; addr += 1) {
          refs.misreadTiles.push(
            tile(
              row[addr] ?? 0,
              hue(originAt(scene, 'little', addr)),
              cellX(L, addr),
              MISREAD_Y,
            ),
          );
        }
      }

      // ── 머무는 표식과 잰 값.
      // 제 규칙으로 읽은 두 줄. 표식이 각 줄의 **윗자리 칸**에 남는다.
      if (scene.ownRead) {
        for (const side of ['big', 'little'] as const) {
          if (!laid[side]) continue;
          refs.marks[side] = markAt(
            slotX(L, msbAddrOf(scene, side)),
            ROW_Y[side],
            c.accent,
            MARK_PAD,
          );
          refs.readouts[side] = readoutAt(valueOf(scene, side), ROW_Y[side], c.text);
        }
      }
      // 차례를 모르고 읽은 쪽. 표식은 **리틀엔디언 줄의 반대쪽 끝**에 선다 —
      // 한 줄의 양 끝에 두 표식이 서는 것이 이 조각의 결론이다.
      if (scene.misread) {
        if (scene.littleLaid) {
          refs.marks.misread = markAt(
            slotX(L, msbAddrOf(scene, 'misread')),
            LITTLE_Y,
            c.danger,
            MISREAD_MARK_PAD,
          );
        }
        refs.readouts.misread = readoutAt(valueOf(scene, 'misread'), MISREAD_Y, c.danger);
      }

      // ── 캡션. 재건 밖에 두지 않는다 — 매번 새로 짓는다.
      const text = captionText(scene);
      const lines = text === null ? [] : wrapTwo(text, CAPTION_PX);
      for (const [k, y] of [
        [0, CAPTION_Y1],
        [1, CAPTION_Y2],
      ] as const) {
        put(
          root,
          'text',
          {
            x: W / 2,
            y,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          },
          lines[k] ?? '',
        );
      }

      // 운동에만 사는 층을 맨 위로 올린다. 훑는 테가 칸 뒤로 숨으면 안 된다.
      root.appendChild(refs.transient);
      return refs;
    }

    // ── 걸음의 운동 ─────────────────────────────────────────────────
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 운동은 **아직 못 온 만큼을
    // 뒤로 물리는** 꼴이 된다.

    /** 값이 갈려 한 줄로 선다 — 칸이 차례로 떠올라 앉는다. */
    function flowShow(refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const tiles = refs.written;
      const total = SHOW_DUR + SHOW_STAGGER * Math.max(0, tiles.length - 1);
      return tween(total, my, (p) => {
        const ms = p * total;
        refs.writtenPrefix?.setAttribute('opacity', String(clamp01(ms / 300)));
        for (let i = 0; i < tiles.length; i += 1) {
          const g = tiles[i];
          if (!g) continue;
          const e = ease(clamp01((ms - i * SHOW_STAGGER) / SHOW_DUR));
          g.setAttribute('opacity', String(e));
          moveTo(g, cellX(L, i), VALUE_Y + RISE * (1 - e));
        }
      });
    }

    /** 값이 곧장 내려앉는다. 차례가 그대로라 기둥이 어긋나지 않는다. */
    function flowLayBig(refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const tiles = refs.rows.big;
      const total = BIG_DUR + BIG_STAGGER * Math.max(0, tiles.length - 1);
      return tween(total, my, (p) => {
        const ms = p * total;
        for (let i = 0; i < tiles.length; i += 1) {
          const g = tiles[i];
          if (!g) continue;
          const e = ease(clamp01((ms - i * BIG_STAGGER) / BIG_DUR));
          moveTo(
            g,
            cellX(L, i) + (slotX(L, i) - cellX(L, i)) * e,
            VALUE_Y + (BIG_Y - VALUE_Y) * e,
          );
        }
      });
    }

    /**
     * 같은 바이트가 서로 건너간다. 주소 j 에 앉을 바이트는 빅엔디언 줄에서
     * 주소 n-1-j 에 있던 것이라, 네 길이 한가운데서 엇갈린다. 바깥 짝은 아래로
     * 처지고 안쪽 짝은 위로 솟게 해 한 점에서 뭉치지 않도록 한다.
     *
     * 어느 칸이 어디서 오는지는 `originAt` 하나가 말한다 — 색을 고르는 자리와
     * 같은 함수다.
     */
    function flowLayLittle(scene: ByteOrderScene, refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const tiles = refs.rows.little;
      const total = LITTLE_DUR + LITTLE_STAGGER * Math.max(0, tiles.length - 1);
      return tween(total, my, (p) => {
        const ms = p * total;
        for (let j = 0; j < tiles.length; j += 1) {
          const g = tiles[j];
          if (!g) continue;
          const sx = slotX(L, originAt(scene, 'little', j));
          const ex = slotX(L, j);
          const e = ease(clamp01((ms - j * LITTLE_STAGGER) / LITTLE_DUR));
          const cx = (sx + ex) / 2;
          const cy =
            (BIG_Y + LITTLE_Y) / 2 + (Math.abs(ex - sx) / Math.max(1, L.stripW)) * 46 - 20;
          const u = 1 - e;
          moveTo(
            g,
            u * u * sx + 2 * u * e * cx + e * e * ex,
            u * u * BIG_Y + 2 * u * e * cy + e * e * LITTLE_Y,
          );
        }
      });
    }

    /** 훑는 테 — 지나가는 강조다. 운동에만 살고 멎은 화면에는 없다. */
    function sweepRing(refs: Refs, stroke: string): SVGGElement {
      const L = refs.layout;
      const g = put(refs.transient, 'g', {});
      put(g, 'rect', {
        x: -SWEEP_PAD,
        y: -SWEEP_PAD,
        width: L.tileW + SWEEP_PAD * 2,
        height: TILE_H + SWEEP_PAD * 2,
        rx: 6,
        fill: 'none',
        stroke,
        'stroke-width': 2,
      });
      return g;
    }

    /** 잰 값이 옆에서 밀려 들어온다. */
    function slideReadout(el: SVGTextElement | undefined, e: number): void {
      if (!el) return;
      el.setAttribute('opacity', String(e));
      el.setAttribute('transform', `translate(${(1 - e) * -SLIDE_DX},0)`);
    }

    /**
     * 두 줄을 제 규칙으로 읽는다. 빅엔디언은 낮은 주소가 큰 자리라 왼쪽부터,
     * 리틀엔디언은 높은 주소가 큰 자리라 오른쪽부터 훑는다. 훑는 방향이 정반대인데
     * 나오는 수는 같다 — 그것이 이 걸음이 하는 말이다.
     *
     * 두 줄이 한 뜻으로 묶여 있으므로 **시계를 하나로** 둔다. 나누면 나란함이
     * 우연히 맞는 꼴이 되고 하나를 흘려보낼 여지가 생긴다.
     */
    function flowReadOwn(scene: ByteOrderScene, refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const total = READ_SWEEP_MS + SLIDE_MS;
      const runs = (['big', 'little'] as const)
        .filter((side) => refs.rows[side].length > 0)
        .map((side) => {
          const order = readOrderOf(scene, side);
          return {
            side,
            ring: sweepRing(refs, c.accent),
            from: slotX(L, order[0] ?? 0),
            to: slotX(L, order[order.length - 1] ?? 0),
          };
        });

      return tween(total, my, (p) => {
        const ms = p * total;
        const sweep = ease(clamp01(ms / READ_SWEEP_MS));
        const fade = clamp01(ms / MARK_FADE_MS);
        const slide = ease(clamp01((ms - READ_SWEEP_MS) / SLIDE_MS));
        // 훑는 테가 목표에 닿으면 사라진다. 남으면 머무는 표식과 뜻이 겹친다.
        const gone = 1 - ease(clamp01((ms - READ_SWEEP_MS) / SWEEP_FADE_MS));
        for (const run of runs) {
          moveTo(run.ring, run.from + (run.to - run.from) * sweep, ROW_Y[run.side]);
          run.ring.setAttribute('opacity', String(gone));
          // 표식은 훑기가 **시작되는** 칸에 남는다 — 그러니 곧바로 배어 나온다.
          refs.marks[run.side]?.setAttribute('opacity', String(fade));
          slideReadout(refs.readouts[run.side], slide);
        }
      });
    }

    /**
     * 같은 줄을 빅엔디언 규칙으로 — 왼쪽부터 — 훑는다. 훑으며 지나는 칸이
     * 차례대로 아래로 떨어져 수 한 줄을 이룬다. 칸은 그대로인데 줄이 거꾸로
     * 읽혀 위의 값과 다른 수가 된다.
     */
    function flowMisread(scene: ByteOrderScene, refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const total = MISREAD_BODY_MS + SLIDE_MS;
      const order = readOrderOf(scene, 'misread');
      const ring = sweepRing(refs, c.danger);
      const from = slotX(L, order[0] ?? 0);
      const to = slotX(L, order[order.length - 1] ?? 0);
      const tiles = refs.misreadTiles;

      return tween(total, my, (p) => {
        const ms = p * total;
        const sweep = ease(clamp01(ms / MISREAD_SWEEP_MS));
        moveTo(ring, from + (to - from) * sweep, LITTLE_Y);
        ring.setAttribute(
          'opacity',
          String(1 - ease(clamp01((ms - MISREAD_SWEEP_MS) / SWEEP_FADE_MS))),
        );
        refs.marks.misread?.setAttribute('opacity', String(clamp01(ms / MARK_FADE_MS)));

        const lead = clamp01((ms - 240) / 300);
        refs.misreadPrefix?.setAttribute('opacity', String(lead));
        refs.misreadLabel?.setAttribute('opacity', String(lead));

        for (let i = 0; i < tiles.length; i += 1) {
          const g = tiles[i];
          if (!g) continue;
          const e = ease(clamp01((ms - i * MISREAD_DROP_STAGGER) / MISREAD_DROP_DUR));
          g.setAttribute('opacity', String(clamp01(e * 5)));
          moveTo(
            g,
            slotX(L, i) + (cellX(L, i) - slotX(L, i)) * e,
            LITTLE_Y + (MISREAD_Y - LITTLE_Y) * e,
          );
        }

        slideReadout(refs.readouts.misread, ease(clamp01((ms - MISREAD_BODY_MS) / SLIDE_MS)));
      });
    }

    async function render(
      next: ByteOrderScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: ByteOrderScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      // 되짚기는 이 길로 온다 — 타이머도 프레임도 걸지 않고 곧바로 돌아간다.
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'show':
          await flowShow(refs, my);
          break;
        case 'lay-big':
          await flowLayBig(refs, my);
          break;
        case 'lay-little':
          await flowLayLittle(next, refs, my);
          break;
        case 'read-own':
          await flowReadOwn(next, refs, my);
          break;
        case 'misread':
          await flowMisread(next, refs, my);
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간의 끝자리를 통째로 지운다. 속성을 하나씩 거두면
      // 반드시 하나를 빠뜨린다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (hasRaf) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지
        // 않으므로, 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
