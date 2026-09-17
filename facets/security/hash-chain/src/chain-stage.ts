/**
 * chain-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 칸 넷을 가로로 늘어놓는다. 칸마다 세 자리다 — 품고 있는 앞 칸의 해시(prev),
 * 내용(data), 자기 해시(hash). 아래로 흐르는 이음매가 hash 에서 다음 칸의 prev 로
 * 이어져, 품는다는 말이 선으로 보인다.
 *
 * ── 이행이 고친 화면 — 갈린 값이 성한 값을 지우고 있었다
 *
 * 이 조각의 주장은 *견줌*이다. "한 칸을 고치면 그 뒤가 전부 어긋난다" 는 **고치기
 * 전의 값과 갈린 값을 나란히 놓아야** 서는 말이다. 그런데 옛 화면은 값 한 자리를
 * 돌려 쓰며 갈린 값으로 성한 값을 덮었다.
 *
 * - `tamper()` · `breakLink()` · `cascade()` 가 `textContent` 를 **갈아 끼웠다.**
 *   무엇이 무엇으로 바뀌었는지가 화면에서 사라졌다.
 * - 더 나쁜 것은 `cascade` 였다. 뒤따르는 칸의 `prev` 를 다시 셈한 값으로 갈아
 *   끼우므로 **사슬이 저희끼리는 다시 맞는다.** 완주 화면에 남는 것은 "전부 붉다"
 *   뿐이고, 무엇과 어긋났는지는 어디에도 없었다 (함정 7).
 *
 * 지금은 갈린 자리마다 **값이 둘** 선다 — 고치기 전의 값이 줄을 그은 채 제자리를
 * 지키고, 갈린 값이 그 아래 앉는다. 그래서 완주 화면 하나가 "한 칸을 고쳤더니 그 뒤
 * 세 칸의 값이 전부 달라졌다" 를 통째로 말한다. 어긋난 이음매도 함께 남아, 손댄
 * 칸의 옛 해시가 다음 칸이 품은 값과 글자 그대로 같다는 것이 눈에 보인다.
 *
 * 해시 함수 이름(`SHA-256`) 도 이제 화면에 선다. 선언이 "화면에 인쇄할 이름" 이라
 * 싣고 있었는데 옛 화면은 그것을 한 번도 읽지 않았다 (함정 26).
 *
 * ── 채움과 테두리를 갈라 둔다 (함정 29)
 *
 * - **채움 = 값의 형편.** 성한 값은 본문·흐린 칠, 손댄 내용은 강조(accent), 갈린
 *   값은 위험(danger), 고치기 전의 값은 흐린 칠에 줄이 그어진다.
 * - **테두리 = 표식.** 손을 댄 칸은 강조, 어긋남이 닿은 칸은 위험. 두 축이 따로
 *   서므로 "손댄 칸" 과 "그 여파가 닿은 칸" 이 한 화면에 함께 읽힌다.
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 CSS 전환을 인라인 스타일로 걸어 두고 값을 바꾸는 짜임이었다 (여섯 곳).
 * 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게
 * 하므로 흔들림 축을 구조적으로 통과할 수 없다 (S-scene MUST NOT). 전부 `tween`
 * 보간으로 옮겼다. 벽시계는 `setTimeout` 으로 재고 rAF 를 쓰지 않는다 — 걸음이
 * 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 갈린 값 / 어긋난 이음매 / 여파가 닿은 칸 — palette.danger
 *   - 손댄 내용 / 손댄 칸 — palette.accent
 *   - 성한 값 / 고치기 전의 값 — palette.textMuted
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  blockViews,
  captionOf,
  editedAt,
  linkBroken,
  type BlockMark,
  type FieldView,
  type HashChainCaption,
  type HashChainScene,
  type HashChainStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다 (S-view). */
const H = 208;

/** 좌우 여백의 하한. 칸 폭은 이 여백을 뺀 나머지에서 역산한다 (S-piece). */
const SIDE_MIN = 4;
/** 칸 폭의 상한. 칸이 적을 때 한 칸이 화면을 다 먹지 않게 한다. */
const BLOCK_MAX_W = 138;
const BLOCK_GAP = 22;
const BLOCK_Y = 72;
const BLOCK_H = 120;

const STAMP_X = 24;
const STAMP_Y = 16;
const CAPTION_Y = 34;
const INDEX_Y = 64;

/** 칸 안쪽 — 머리표가 서는 자리와 값이 서는 자리. */
const LABEL_DX = 8;
const VALUE_DX = 46;
/** 세 자리의 첫 줄 baseline (BLOCK_Y 기준). */
const PREV_DY = 20;
const DATA_DY = 60;
const HASH_DY = 98;
/** 갈린 값이 고치기 전의 값 아래 앉는 거리. */
const ALT_DY = 14;
/** 줄을 긋는 높이 (baseline 기준). */
const STRIKE_DY = -4;

/** 해시는 앞 8 자만 인쇄한다. 같은지 다른지만 보면 되는 자리다. */
const HEX_HEAD = 8;

/**
 * 등폭 글꼴의 한 글자 폭 비율.
 *
 * 줄을 그으려면 글자 폭이 있어야 하는데, 화면을 되읽어 재면 되짚어 세운 직후에는
 * 옛 화면의 수를 읽는다 (프로토콜 3-1 절의 ④). 등폭 글꼴은 글자 수만으로 폭이
 * 정해지므로 여기서 셈한다.
 */
const MONO_ADVANCE = 0.6;

const XS = Number.parseFloat(fontSizes.xs);
const SM = Number.parseFloat(fontSizes.sm);

// ── 운동 ────────────────────────────────────────────────────────────────
/** 칸이 서고 이음매가 차례로 뻗어 나간다. 일곱 마디를 이어 흐른다. */
const LINK_MS = 620;
/** 한 칸의 내용이 갈린다. */
const EDIT_MS = 320;
/** 해시가 갈리고, 붉은 것이 이음매를 타고 다음 칸에 닿는다. */
const BREAK_MS = 460;
/** 어긋남이 뒤끝까지 번진다. */
const SPREAD_MS = 620;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;
type Pt = readonly [number, number];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
/** 보간 끝자리를 자른다. 끝 프레임은 목표값을 그대로 쓰므로 여기를 지나지 않는다. */
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * 두 칠을 섞는다. CSS `transition` 의 색 전환을 대신한다.
 *
 * `p` 가 1 이면 **목표 칠을 글자 그대로** 돌려준다 — 보간이 만든 `rgb(…)` 표기가
 * 끝자리에 남으면 흘려 세운 화면과 곧바로 세운 화면이 갈린다 (함정 6).
 */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 등폭 글자열의 가로 폭. */
function monoWidth(value: string, size: number): number {
  return Math.round(value.length * size * MONO_ADVANCE);
}

/** 칸 폭과 왼쪽 시작점. 칸 수에서 역산하므로 수가 바뀌면 배치가 따라온다. */
function layoutOf(n: number): { w: number; start: number } {
  if (n <= 0) return { w: 0, start: 0 };
  const room = W - SIDE_MIN * 2 - (n - 1) * BLOCK_GAP;
  const w = Math.min(BLOCK_MAX_W, Math.floor(room / n));
  const total = n * w + (n - 1) * BLOCK_GAP;
  return { w, start: Math.round((W - total) / 2) };
}

/** 칸 `i` 의 hash 자리에서 칸 `i+1` 의 prev 자리로 흐르는 곡선의 제어점 넷. */
function curvePoints(i: number, w: number, start: number): readonly Pt[] {
  const x1 = start + i * (w + BLOCK_GAP) + w;
  const x2 = start + (i + 1) * (w + BLOCK_GAP);
  const y1 = BLOCK_Y + HASH_DY + STRIKE_DY;
  const y2 = BLOCK_Y + PREV_DY + STRIKE_DY;
  return [
    [x1, y1],
    [x1 + 8, y1],
    [x2 - 8, y2],
    [x2, y2],
  ];
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * 곡선의 앞머리 `p` 만큼. de Casteljau 로 잘라 내므로 길이를 재 볼 일이 없다.
 *
 * `p` 가 1 이면 제어점을 **글자 그대로** 적는다 — 보간 끝자리가 남으면 흘려 세운
 * 화면과 곧바로 세운 화면이 갈린다 (함정 35). `p` 가 0 이면 길이 0 이라 아무것도
 * 그려지지 않는다 (`stroke-linecap` 을 두지 않았으므로 점이 되지 않는다, 함정 17).
 */
function dOf(pts: readonly Pt[], p: number): string {
  const [p0, p1, p2, p3] = pts;
  if (p >= 1) {
    return `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;
  }
  const a = lerpPt(p0, p1, p);
  const b = lerpPt(p1, p2, p);
  const cc = lerpPt(p2, p3, p);
  const d = lerpPt(a, b, p);
  const e = lerpPt(b, cc, p);
  const f = lerpPt(d, e, p);
  return `M ${p0[0]} ${p0[1]} C ${round1(a[0])} ${round1(a[1])}, ${round1(d[0])} ${round1(d[1])}, ${round1(f[0])} ${round1(f[1])}`;
}

/** 한 값 자리가 세워 놓은 것들. 걸음이 흐르게 할 것을 여기서 찾는다. */
type FieldDrawn = {
  /** 고치기 전의 값. 갈리지 않았으면 null. */
  stale: SVGTextElement | null;
  /** 갈리기 전 그 값이 띠고 있던 칠. 운동이 여기서 출발해 흐린 칠로 물러난다. */
  staleFrom: string;
  strike: SVGLineElement | null;
  strikeX1: number;
  strikeX2: number;
  /** 갈린 값. 갈리지 않았으면 null. */
  fresh: SVGTextElement | null;
  freshY: number;
};

type BlockDrawn = {
  group: SVGGElement;
  box: SVGRectElement;
  prev: FieldDrawn;
  data: FieldDrawn;
  hash: FieldDrawn;
};

type LinkDrawn = { path: SVGPathElement; pts: readonly Pt[] };

type Drawn = { blocks: BlockDrawn[]; links: LinkDrawn[] };

type Slotted<T> = { node: T; slot: number };
type SlottedLink = Slotted<SVGPathElement> & { pts: readonly Pt[] };
type Reddening = SlottedLink & { overlay: SVGPathElement };

/**
 * 한 걸음에 흐를 것들. **시계는 하나**다 (프로토콜 3-4 절).
 *
 * `slot` 은 그 한 시계 안에서 몇 번째 마디에 오는가다 — 어긋남이 이음매를 타고
 * 다음 칸으로 번지는 것이 이 조각의 동사라, 원인과 결과가 같은 순간에 서면 그
 * 동사가 사라진다.
 */
type Wave = {
  slots: number;
  /** 칸이 나타난다. */
  groups: Slotted<SVGGElement>[];
  /** 이음매가 뻗어 나간다. */
  grows: SlottedLink[];
  /** 붉은 것이 이음매를 타고 번진다. */
  reddens: Reddening[];
  /** 값이 갈린다. */
  values: Slotted<FieldDrawn>[];
  /** 칸에 표식이 든다. */
  boxes: Slotted<SVGRectElement>[];
};

const EMPTY_WAVE: Wave = { slots: 1, groups: [], grows: [], reddens: [], values: [], boxes: [] };

export const chainStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HashChainScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const BAD = c.danger;
    const HOT = c.accent;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gHead = el('g');
    const gCaption = el('g');
    const gLink = el('g');
    const gBlock = el('g');
    const layers = [gHead, gCaption, gLink, gBlock];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
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
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
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
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(x: number, y: number, value: string, attrs: Attrs = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': 'start',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        ...attrs,
      });
      node.textContent = value;
      return node;
    }

    /** 해시는 앞머리만 인쇄한다. 요점은 값의 내용이 아니라 같은지 다른지다. */
    function head(value: string): string {
      return value.slice(0, HEX_HEAD);
    }

    function captionText(caption: HashChainCaption): string {
      switch (caption.kind) {
        case 'linked':
          return t('caption.linked', 'Every entry holds the hash of the one before it.');
        case 'tampered':
          return t('caption.tampered', 'Someone edits an old entry.');
        case 'broken':
          return t(
            'caption.broken',
            'Its hash changes, and the next entry is holding the old one.',
          );
        case 'cascaded':
          return t('caption.cascaded', 'The mismatch runs all the way to the end.');
      }
    }

    /** 테두리는 표식의 축이다 — 손댄 칸인가, 여파가 닿은 칸인가 (함정 29). */
    function strokeOf(mark: BlockMark): string {
      if (mark === 'edited') return HOT;
      if (mark === 'touched') return BAD;
      return 'none';
    }

    // ── 장면을 통째로 세운다 ───────────────────────────────────────────────
    //
    // `step` 을 읽지 않는다. 자취만 보고 세우므로 되짚어 세운 화면과 흘려 세운
    // 화면이 같다 (공통 지시문 8 절).

    /**
     * 값 한 자리.
     *
     * 갈린 자리는 **값이 둘** 선다 — 고치기 전의 값이 줄을 그은 채 제자리를 지키고
     * 갈린 값이 그 아래 앉는다. 이것이 이 조각의 주장이 완주 화면에 남는 길이다.
     */
    function drawField(
      group: SVGGElement,
      x: number,
      dy: number,
      label: string | null,
      view: FieldView,
      opts: { size: number; clip: boolean; calm: string; fresh: string },
    ): FieldDrawn {
      const y = BLOCK_Y + dy;
      const vx = label === null ? x + LABEL_DX : x + VALUE_DX;
      const size = `${opts.size}px`;
      if (label !== null) {
        group.appendChild(text(x + LABEL_DX, y, label, { fill: c.textMuted }));
      }
      const now = opts.clip ? head(view.now) : view.now;
      if (view.was === null) {
        group.appendChild(
          text(vx, y, now, { 'font-family': fonts.mono, 'font-size': size, fill: opts.calm }),
        );
        return {
          stale: null,
          staleFrom: opts.calm,
          strike: null,
          strikeX1: 0,
          strikeX2: 0,
          fresh: null,
          freshY: 0,
        };
      }

      const was = opts.clip ? head(view.was) : view.was;
      const stale = text(vx, y, was, {
        'font-family': fonts.mono,
        'font-size': size,
        fill: c.textMuted,
      });
      group.appendChild(stale);

      const strikeX1 = vx - 1;
      const strikeX2 = vx + monoWidth(was, opts.size) + 1;
      const strike = el('line', {
        x1: strikeX1,
        y1: y + STRIKE_DY,
        x2: strikeX2,
        y2: y + STRIKE_DY,
        stroke: c.textMuted,
        'stroke-width': 1,
      });
      group.appendChild(strike);

      const freshY = y + ALT_DY;
      const fresh = text(vx, freshY, now, {
        'font-family': fonts.mono,
        'font-size': size,
        fill: opts.fresh,
      });
      group.appendChild(fresh);

      return { stale, staleFrom: opts.calm, strike, strikeX1, strikeX2, fresh, freshY };
    }

    function drawStatic(scene: HashChainScene): Drawn {
      for (const layer of layers) layer.textContent = '';
      const drawn: Drawn = { blocks: [], links: [] };

      if (scene.algorithmLabel !== '') {
        gHead.appendChild(
          text(STAMP_X, STAMP_Y, scene.algorithmLabel, {
            fill: c.textMuted,
            'font-family': fonts.mono,
          }),
        );
      }

      const caption = captionOf(scene);
      if (caption !== null) {
        gCaption.appendChild(
          text(W / 2, CAPTION_Y, captionText(caption), {
            'text-anchor': 'middle',
            fill: HOT,
            'font-size': fontSizes.sm,
            'font-weight': '600',
          }),
        );
      }

      // 사슬은 이어질 때 선다. 그 전에는 캔버스가 비어 있다.
      if (!scene.linked) return drawn;

      const views = blockViews(scene);
      if (views.length === 0) return drawn;
      const { w, start } = layoutOf(views.length);

      // 이음매를 먼저 세운다 — 칸 뒤에 깔려야 상자 밑으로 흐른다.
      for (let i = 0; i < views.length - 1; i++) {
        const pts = curvePoints(i, w, start);
        const path = el('path', {
          d: dOf(pts, 1),
          fill: 'none',
          stroke: linkBroken(scene, i) ? BAD : c.border,
          'stroke-width': 1.4,
        });
        gLink.appendChild(path);
        drawn.links.push({ path, pts });
      }

      for (const v of views) {
        const x = start + v.index * (w + BLOCK_GAP);
        const group = el('g');
        gBlock.appendChild(group);

        const box = el('rect', {
          x,
          y: BLOCK_Y,
          width: w,
          height: BLOCK_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: strokeOf(v.mark),
          'stroke-width': 1.5,
        });
        group.appendChild(box);
        group.appendChild(
          text(x + LABEL_DX, INDEX_Y, `#${v.index + 1}`, { fill: c.textMuted }),
        );

        const prev = drawField(group, x, PREV_DY, t('label.prev', 'prev'), v.prev, {
          size: XS,
          clip: true,
          calm: c.textMuted,
          fresh: BAD,
        });
        const data = drawField(group, x, DATA_DY, null, v.data, {
          size: SM,
          clip: false,
          calm: c.text,
          fresh: HOT,
        });
        const hash = drawField(group, x, HASH_DY, t('label.hash', 'hash'), v.hash, {
          size: XS,
          clip: true,
          calm: c.textMuted,
          fresh: BAD,
        });

        drawn.blocks.push({ group, box, prev, data, hash });
      }

      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리를 세워 두었으므로, 운동은 **아직 못 온 만큼을 뒤로
    // 물리는** 꼴이다. 한 걸음이 한 뜻이면 시계도 하나다 (프로토콜 3-4 절).

    function redden(link: LinkDrawn, slot: number): Reddening {
      const overlay = el('path', {
        d: dOf(link.pts, 0),
        fill: 'none',
        stroke: BAD,
        'stroke-width': 1.4,
      });
      gLink.appendChild(overlay);
      return { node: link.path, pts: link.pts, overlay, slot };
    }

    /** 이번 걸음에 흐를 것들. 바탕과 자취에서 셈하므로 `prev` 를 들추지 않는다. */
    function waveFor(step: HashChainStep, scene: HashChainScene, drawn: Drawn): Wave {
      const at = editedAt(scene);

      switch (step.kind) {
        case 'link': {
          const slots = drawn.blocks.length + drawn.links.length;
          if (slots === 0) return EMPTY_WAVE;
          return {
            slots,
            // 칸과 이음매가 번갈아 선다 — 칸, 그 칸에서 뻗는 이음매, 다음 칸…
            groups: drawn.blocks.map((b, i) => ({ node: b.group, slot: i * 2 })),
            grows: drawn.links.map((l, i) => ({ node: l.path, pts: l.pts, slot: i * 2 + 1 })),
            reddens: [],
            values: [],
            boxes: [],
          };
        }

        case 'edit': {
          const b = at >= 0 ? drawn.blocks[at] : undefined;
          if (b === undefined) return EMPTY_WAVE;
          return {
            slots: 1,
            groups: [],
            grows: [],
            reddens: [],
            values: [{ node: b.data, slot: 0 }],
            boxes: [{ node: b.box, slot: 0 }],
          };
        }

        case 'break': {
          const b = at >= 0 ? drawn.blocks[at] : undefined;
          if (b === undefined) return EMPTY_WAVE;
          const next = drawn.blocks[at + 1];
          const link = drawn.links[at];
          return {
            slots: 2,
            groups: [],
            grows: [],
            // 해시가 먼저 갈리고, 그 다음에 붉은 것이 이음매를 타고 건너간다.
            reddens: link === undefined ? [] : [redden(link, 1)],
            values: [{ node: b.hash, slot: 0 }],
            boxes: next === undefined ? [] : [{ node: next.box, slot: 1 }],
          };
        }

        case 'spread': {
          if (at < 0) return EMPTY_WAVE;
          const values: Slotted<FieldDrawn>[] = [];
          const boxes: Slotted<SVGRectElement>[] = [];
          const reddens: Reddening[] = [];
          for (let i = at + 1; i < drawn.blocks.length; i++) {
            const slot = i - at - 1;
            const b = drawn.blocks[i];
            values.push({ node: b.prev, slot }, { node: b.hash, slot });
            // at+1 의 표식은 앞 걸음에 이미 들었다. 다시 물렸다 세우면 깜빡인다.
            if (i > at + 1) boxes.push({ node: b.box, slot });
            const link = drawn.links[i];
            if (link !== undefined) reddens.push(redden(link, slot));
          }
          const slots = drawn.blocks.length - at - 1;
          if (slots <= 0) return EMPTY_WAVE;
          return { slots, groups: [], grows: [], reddens, values, boxes };
        }
      }
    }

    function holdBackValue(f: FieldDrawn): void {
      if (f.fresh !== null) {
        f.fresh.setAttribute('y', String(f.freshY - ALT_DY));
        f.fresh.style.opacity = '0';
      }
      if (f.strike !== null) f.strike.setAttribute('x2', String(f.strikeX1));
      if (f.stale !== null) f.stale.setAttribute('fill', f.staleFrom);
    }

    /**
     * 값 한 자리가 갈리는 모습.
     *
     * 고치기 전의 값은 제 칠에서 흐린 칠로 물러나며 줄이 그어지고, 갈린 값이 그
     * 자리에서 한 줄 아래로 내려앉는다. 끝 프레임은 목표값을 그대로 쓴다 (함정 6).
     */
    function drawValue(f: FieldDrawn, e: number, done: boolean): void {
      if (f.fresh !== null) {
        f.fresh.setAttribute('y', done ? String(f.freshY) : String(round1(f.freshY - ALT_DY * (1 - e))));
        if (done) f.fresh.style.removeProperty('opacity');
        else f.fresh.style.opacity = String(round3(e));
      }
      if (f.strike !== null) {
        f.strike.setAttribute(
          'x2',
          done ? String(f.strikeX2) : String(round1(f.strikeX1 + (f.strikeX2 - f.strikeX1) * e)),
        );
      }
      if (f.stale !== null) {
        f.stale.setAttribute('fill', done ? c.textMuted : mixColor(f.staleFrom, c.textMuted, e));
      }
    }

    function flowWave(wave: Wave, ms: number, mine: number): Promise<void> {
      for (const g of wave.groups) g.node.style.opacity = '0';
      for (const l of wave.grows) l.node.setAttribute('d', dOf(l.pts, 0));
      for (const r of wave.reddens) r.node.setAttribute('stroke', c.border);
      for (const v of wave.values) holdBackValue(v.node);
      for (const b of wave.boxes) b.node.setAttribute('stroke-opacity', '0');

      return tween(ms, mine, (p) => {
        const done = p >= 1;
        const localOf = (slot: number): number =>
          done ? 1 : easeOut(clamp01(p * wave.slots - slot));

        for (const g of wave.groups) {
          if (done) g.node.style.removeProperty('opacity');
          else g.node.style.opacity = String(round3(localOf(g.slot)));
        }
        for (const l of wave.grows) l.node.setAttribute('d', dOf(l.pts, localOf(l.slot)));
        for (const r of wave.reddens) {
          if (done) {
            r.node.setAttribute('stroke', BAD);
            r.overlay.remove();
          } else {
            r.overlay.setAttribute('d', dOf(r.pts, localOf(r.slot)));
          }
        }
        for (const v of wave.values) drawValue(v.node, localOf(v.slot), done);
        for (const b of wave.boxes) {
          if (done) b.node.removeAttribute('stroke-opacity');
          else b.node.setAttribute('stroke-opacity', String(round3(localOf(b.slot))));
        }
      });
    }

    function msOf(step: HashChainStep): number {
      switch (step.kind) {
        case 'link':
          return LINK_MS;
        case 'edit':
          return EDIT_MS;
        case 'break':
          return BREAK_MS;
        case 'spread':
          return SPREAD_MS;
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: HashChainScene,
      _prev: HashChainScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowWave(waveFor(step, next, drawn), msOf(step), mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
