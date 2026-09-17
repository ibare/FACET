/**
 * negative-edge-breaks stage — 굳는 자리, 그리고 굳어서 못 나가는 소식.
 *
 * 화면의 동사는 "깨진다" 다. 그래서 두 운동이 그림의 뼈대다.
 *   1. 굳기 — 뚜껑이 거리 칸 위로 **내려앉아** 값을 물린다.
 *   2. 튕김 — 더 짧은 후보가 간선을 따라 **날아가** 굳은 정점에 부딪히고,
 *      들어가지 못한 채 옆으로 튕겨 나가 가위표를 단 채 **남는다.**
 *      그 뒤 그 소식이 밖으로 나가려 하면 막이 앞을 막고 되밀린다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`settle()` · `relaxSealed()` · `blockNews()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다 (S-scene).
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 프레임으로
 * 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이 그 길이다.
 * CSS `transition` 은 쓰지 않는다 (S-scene MUST NOT) — 되짚기가 `animate:false` 로
 * 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 한다.
 *
 * 운동이 끝나면 **그 장면을 통째로 다시 세운다.** 속성을 하나씩 거두는 것보다
 * 안전하다 — 흐르며 선 화면과 곧바로 세운 화면이 `opacity="1"` 같은 속성의 유무나
 * 보간의 끝자리만큼 달라 되짚기 판정에서 어긋나는 일이 없다.
 *
 * ## 채움과 테두리를 갈라 둔다
 *
 * 두 칠이 부딪히지 않게 뜻을 나눈다 (프로토콜 4 절).
 *
 * - **채움 = 값의 형편** — 비어 있다(∞) / 값이 앉았다 / 굳었다.
 * - **테두리 = 견줌의 표식** — 이 자리가 더 짧은 소식을 **거절한 적 있다**(붉은 테).
 *
 * 그래서 굳은 칸은 굳은 채움을 유지한 채 테만 붉어진다. 옮기기 전에는 그 붉은 테가
 * 260ms 만에 제 색으로 **되돌아가** 이 조각의 논점이 화면에서 사라졌다.
 *
 * 튕겨 나간 후보도 어휘를 가른다 — **거절당한 것**은 붉게 차고 가위표를 달고,
 * **낫지 않아 그대로 둔 것**은 채움 없이 회색 점선으로 비켜선다. 같은 모양으로
 * 두면 "굳어서 못 받았다" 와 "그냥 더 멀었다" 가 한 칠로 뭉개진다.
 *
 * 세로는 `canvas.height` 로 한 번 선언하고 여기서 다시 재지 않는다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  candidateOf,
  distOf,
  isSealed,
  lastBlock,
  lastKeep,
  lastRefusal,
  refusedAt,
  truthMismatches,
  truthRunning,
  truthTotal,
  type NegativeEdgeBreaksCaption,
  type NegativeEdgeBreaksScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 322;

const SIDE = 56; // 좌우 여백. 출발/도착 열의 중심이 여기 선다.
const NODE_R = 25;
const MID_Y = 152; // 출발·도착 열의 높이
const SPREAD = 66; // 가운데 열이 위아래로 벌어지는 폭
const CHIP_W = 48;
const CHIP_H = 24;
const CHIP_GAP = 44; // 정점 중심에서 거리 칸 중심까지
const MINI_W = 36;
const MINI_H = 20;
const CAP_Y1 = 296;
const CAP_Y2 = 312;

// ── 걸음의 길이. 하나하나가 읽을 시간을 가르므로 이름을 달아 둔다.
const TRAVEL_MS = 560;
const SEAL_MS = 360;
const REFUSE_MS = 1000;
const KEEP_MS = 760;
const PUSH_MS = 520;
const TRUTH_MS = 1320;
const JUDGE_MS = 260;

/** 튕김 한 마디의 경계. 날아가고 · 부딪혀 멎고 · 튕겨 나간다. */
const HIT_AT = 0.52;
const HOLD_UNTIL = 0.78;
/** 받아들이는 걸음에서 나르던 것이 사그라들기 시작하는 자리. */
const FADE_FROM = 0.8;

// 뚜껑이 내려앉기 전에 물러나 있는 거리.
const SEAL_LIFT = 48;

// 막이 서는 자리와, 소식이 나가려다 되밀리는 거리 (정점 중심에서 잰다).
const GHOST_W = 34;
const GHOST_HOME = NODE_R + 6;
const GHOST_OUT = NODE_R + 40;
const BARRIER_AT = NODE_R + 56;

// 부딪히는 자리와 튕겨 나가 서는 자리 (도착 정점 중심에서 잰다).
const HIT_BACK = NODE_R + 16;
const BOUNCE_BACK = 26;
const BOUNCE_SIDE = 46;
/** 같은 간선에 표식이 둘 이상 쌓일 때 서로 비켜 앉는 몫. */
const STACK_STEP = 24;

// 도형에 새기는 기호. 번역 대상이 아니다 (C10 표식).
const INF = '∞';
const MINUS = '−';
const CROSS = '✗';

type Pt = { x: number; y: number };

/** 축 하나 — 두 정점을 잇는 방향과 그 왼쪽 법선. */
type Axis = { a: Pt; b: Pt; ux: number; uy: number; nx: number; ny: number };

/** 글자 칸 하나. DOM 손잡이만 묶는다 — 뜻도 수도 담지 않는다. */
type Token = { g: SVGGElement; box: SVGRectElement; ink: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 보간값을 문자열로 굳힌다. `-0` 과 부동소수 끝자리가 화면을 가르지 않게. */
function fix(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** 수를 화면 표기로. 음부호는 하이픈이 아니라 수식 기호를 쓴다. */
function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return INF;
  return v < 0 ? `${MINUS}${Math.abs(v)}` : String(v);
}

/** 글자 폭 어림 — 넓은 글자는 두 칸, 나머지는 한 칸으로 센다. */
function width(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return n;
}

/** 캡션을 두 줄까지 담는다. 공백에서 끊고, 끊을 데가 없으면 글자로 끊는다. */
function wrap(text: string, cap: number): [string, string] {
  if (width(text) <= cap) return [text, ''];
  const words = text.split(' ');
  let head = '';
  let rest = '';
  for (const word of words) {
    const next = head === '' ? word : `${head} ${word}`;
    if (rest === '' && width(next) <= cap) {
      head = next;
      continue;
    }
    rest = rest === '' ? word : `${rest} ${word}`;
  }
  if (head === '') {
    // 공백이 없는 문장 — 폭이 찰 때까지 글자로 자른다.
    let acc = '';
    for (const ch of text) {
      if (width(acc + ch) > cap) break;
      acc += ch;
    }
    head = acc;
    rest = text.slice(acc.length);
  }
  return [head, rest];
}

function lerp(a: Pt, b: Pt, e: number): Pt {
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
}

/** 0 → 1 → 0. 삼각파라 끝에서 **정확히** 0 이다 (`sin` 은 1.2e-16 을 남긴다). */
function thereAndBack(e: number): number {
  return e < 0.5 ? e * 2 : 2 - e * 2;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export const negativeEdgeBreaksStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 장면 방식에서는 문안을 stage 가 만든다 — 캡션 문자열이 여기서 태어난다 (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // 캔버스 '안쪽' 만 비운다. 컨테이너를 비우면 러너가 붙여 준 캔버스가 떨어져
    // 나가고 화면이 통째로 빈다 (S-view).
    svg.textContent = '';

    let destroyed = false;
    /** 걸어 둔 프레임. `destroy` 가 일괄로 거둔다 (rAF 가 없는 곳이면 타이머 id 다). */
    const frames = new Set<number>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임·타이머를 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지
     * 않으므로 `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면
     * `await ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG
     * 트리가 통째로 붙들린다 (S-piece MUST).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 걸음 함수가 `await` 를 지나므로 빗장을 둔다 — 정적 그리기가 표식을 매번 새로
     * 만들어도 그 손잡이를 쥔 것은 클로저 변수라, 깨어난 옛 세대가 새 손잡이를 타고
     * 살아 있는 화면에 쓸 수 있다 (S-scene). `destroy` 도 세대를 올린다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(cb: () => void): number {
      return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    }

    function dropFrame(id: number): void {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    }

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(durationMs: number, my: number, draw: (e: number) => void): Promise<void> {
      const paint = (e: number): void => {
        if (alive(my)) draw(e);
      };
      return new Promise<void>((resolve) => {
        if (destroyed || durationMs <= 0) {
          paint(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / durationMs);
          paint(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = nextFrame(tick);
          frames.add(id);
        };
        paint(0);
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    // ── 뼈대. mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ──────────────────────
    const edgeLayer = el('g');
    const truthLayer = el('g');
    const nodeLayer = el('g');
    const chipLayer = el('g');
    const markLayer = el('g');
    const fxLayer = el('g');
    const captionLayer = el('g');
    for (const g of [edgeLayer, truthLayer, nodeLayer, chipLayer, markLayer, fxLayer, captionLayer]) {
      svg.appendChild(g);
    }

    /**
     * 캡션 두 줄은 **재건 밖 요소**다. 정적 그리기가 매번 두 줄 모두를 명시로
     * 쓴다 — 한 줄만 쓰면 앞 걸음의 둘째 줄이 남아 되짚기 판정에서 어긋난다.
     */
    const capLine1 = el('text', {
      x: W / 2,
      y: CAP_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    const capLine2 = el('text', {
      x: W / 2,
      y: CAP_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    captionLayer.appendChild(capLine1);
    captionLayer.appendChild(capLine2);

    function clear(g: SVGGElement): void {
      g.textContent = '';
    }

    function place(g: SVGGElement, p: Pt): void {
      g.setAttribute('transform', `translate(${fix(p.x)} ${fix(p.y)})`);
    }

    // ── 자리 셈. 그리기 전에 **한 번에** 정한다 ──────────────────────────────
    //
    // 그리면서 이웃의 지금 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다.

    const spot = new Map<string, Pt>();

    /** 출발은 왼쪽, 도착은 오른쪽, 나머지는 가운데 열에 차례대로 쌓는다. */
    function layout(scene: NegativeEdgeBreaksScene): void {
      spot.clear();
      const xs = SIDE;
      const xg = W - SIDE;
      const mids = scene.nodes.filter((n) => n !== scene.start && n !== scene.goal);
      if (scene.start !== '') spot.set(scene.start, { x: xs, y: MID_Y });
      if (scene.goal !== '') spot.set(scene.goal, { x: xg, y: MID_Y });
      const span = mids.length > 1 ? (SPREAD * 2) / (mids.length - 1) : 0;
      mids.forEach((n, i) => {
        const y = mids.length > 1 ? MID_Y - SPREAD + span * i : MID_Y;
        spot.set(n, { x: (xs + xg) / 2, y });
      });
    }

    function at(node: string): Pt {
      return spot.get(node) ?? { x: W / 2, y: MID_Y };
    }

    function above(node: string): boolean {
      return at(node).y <= MID_Y;
    }

    /** 거리 칸의 자리. 위쪽 정점은 위에, 아래쪽 정점은 아래에 단다. */
    function chipAt(node: string): Pt {
      const p = at(node);
      return { x: p.x, y: above(node) ? p.y - CHIP_GAP : p.y + CHIP_GAP };
    }

    /** 참값 칸의 자리. 굳힌 칸의 **반대편**이라 두 수가 겹치지 않는다. */
    function truthCellAt(node: string): Pt {
      const p = at(node);
      return { x: p.x, y: above(node) ? p.y + CHIP_GAP : p.y - CHIP_GAP };
    }

    function axisOf(from: string, to: string): Axis | null {
      const a = spot.get(from);
      const b = spot.get(to);
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      return { a, b, ux: dx / L, uy: dy / L, nx: -dy / L, ny: dx / L };
    }

    /** 후보가 굳은 자리에 부딪히는 점. */
    function hitAt(ax: Axis): Pt {
      return { x: ax.b.x - ax.ux * HIT_BACK, y: ax.b.y - ax.uy * HIT_BACK };
    }

    /** 부딪힌 뒤 비켜서 **남는** 자리. `side` 가 갈래마다 다른 쪽을 고른다. */
    function restAt(ax: Axis, side: 1 | -1, stack: number): Pt {
      const hit = hitAt(ax);
      const out = BOUNCE_SIDE + stack * STACK_STEP;
      return {
        x: hit.x - ax.ux * BOUNCE_BACK - ax.nx * out * side,
        y: hit.y - ax.uy * BOUNCE_BACK - ax.ny * out * side,
      };
    }

    // ── 부품 ────────────────────────────────────────────────────────────────

    function makeToken(opts: {
      text: string;
      fill: string;
      stroke: string;
      ink: string;
      w?: number;
      h?: number;
      dash?: boolean;
    }): Token {
      const w = opts.w ?? 42;
      const h = opts.h ?? 24;
      const g = el('g');
      const box = el('rect', {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        rx: 7,
        fill: opts.fill,
        stroke: opts.stroke,
        'stroke-width': 2,
      });
      if (opts.dash === true) box.setAttribute('stroke-dasharray', '4 3');
      const ink = el('text', {
        x: 0,
        y: 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: opts.ink,
      });
      ink.textContent = opts.text;
      g.appendChild(box);
      g.appendChild(ink);
      return { g, box, ink };
    }

    function makeLabel(p: Pt, text: string, size: string): SVGTextElement {
      const t = el('text', {
        x: p.x,
        y: p.y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': size,
        fill: c.textMuted,
      });
      t.textContent = text;
      return t;
    }

    // ── 정적 그리기가 걸음 함수에 건네는 손잡이 ──────────────────────────────
    //
    // 매번 새로 지어지는 노드들이라 `drawStatic` 이 그때그때 다시 담는다.

    type Parts = {
      lid: Map<string, SVGGElement>;
      disc: Map<string, SVGCircleElement>;
      refusal: Array<{ g: SVGGElement; box: SVGRectElement; strike: SVGLineElement }>;
      keep: Array<{ g: SVGGElement; box: SVGRectElement }>;
      ghost: SVGGElement[];
      goalChip: SVGGElement | null;
      goalTruth: SVGGElement | null;
    };

    let parts: Parts = {
      lid: new Map(),
      disc: new Map(),
      refusal: [],
      keep: [],
      ghost: [],
      goalChip: null,
      goalTruth: null,
    };

    // ── 정적 그리기. 그 장면의 화면을 빠짐없이 통째로 세운다 ────────────────

    function drawEdges(scene: NegativeEdgeBreaksScene): void {
      for (const e of scene.edges) {
        const ax = axisOf(e.from, e.to);
        if (!ax) continue;
        const p1 = { x: ax.a.x + ax.ux * NODE_R, y: ax.a.y + ax.uy * NODE_R };
        const p2 = { x: ax.b.x - ax.ux * (NODE_R + 10), y: ax.b.y - ax.uy * (NODE_R + 10) };
        edgeLayer.appendChild(
          el('line', {
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            stroke: c.textMuted,
            'stroke-width': 2,
          }),
        );
        const tipX = p2.x + ax.ux * 9;
        const tipY = p2.y + ax.uy * 9;
        edgeLayer.appendChild(
          el('polygon', {
            points: [
              `${tipX},${tipY}`,
              `${p2.x + ax.nx * 5},${p2.y + ax.ny * 5}`,
              `${p2.x - ax.nx * 5},${p2.y - ax.ny * 5}`,
            ].join(' '),
            fill: c.textMuted,
          }),
        );
        const mx = (p1.x + p2.x) / 2 + ax.nx * 18;
        const my = (p1.y + p2.y) / 2 + ax.ny * 18;
        edgeLayer.appendChild(
          el('rect', { x: mx - 15, y: my - 10, width: 30, height: 20, rx: 5, fill: c.bg }),
        );
        const wt = el('text', {
          x: mx,
          y: my + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: e.weight < 0 ? c.danger : c.text,
        });
        wt.textContent = fmt(e.weight);
        edgeLayer.appendChild(wt);
      }
    }

    /** 참 최단 경로. 다리마다 굵은 줄 하나로, 재고 나면 **남는다.** */
    function drawTruthPath(scene: NegativeEdgeBreaksScene): void {
      for (let i = 1; i < scene.truthPath.length; i += 1) {
        const ax = axisOf(scene.truthPath[i - 1], scene.truthPath[i]);
        if (!ax) continue;
        truthLayer.appendChild(
          el('line', {
            x1: ax.a.x + ax.ux * NODE_R,
            y1: ax.a.y + ax.uy * NODE_R,
            x2: ax.b.x - ax.ux * NODE_R,
            y2: ax.b.y - ax.uy * NODE_R,
            stroke: c.accent,
            'stroke-width': 6,
            'stroke-linecap': 'round',
          }),
        );
      }
    }

    function drawNodes(scene: NegativeEdgeBreaksScene): void {
      for (const n of scene.nodes) {
        const p = spot.get(n);
        if (!p) continue;
        const sealed = isSealed(scene, n);
        const refused = refusedAt(scene, n);
        const circle = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          // 채움은 값의 형편 — 굳었나 아직인가.
          fill: sealed ? c.itemSorted : c.itemDefault,
          // 테두리는 견줌의 표식 — 더 짧은 소식을 거절한 적 있나.
          stroke: refused ? c.danger : sealed ? c.itemSorted : c.border,
          'stroke-width': sealed ? 4 : 2,
        });
        const ink = el('text', {
          x: p.x,
          y: p.y + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: sealed ? c.textInverse : c.text,
        });
        ink.textContent = n;
        nodeLayer.appendChild(circle);
        nodeLayer.appendChild(ink);
        parts.disc.set(n, circle);
      }
    }

    /** 거리 칸 하나. 굳었으면 뚜껑이 함께 선다. */
    function drawChip(scene: NegativeEdgeBreaksScene, node: string): void {
      const cc = chipAt(node);
      const value = distOf(scene, node);
      const sealed = isSealed(scene, node);
      const refused = refusedAt(scene, node);
      const known = value !== null;

      const g = el('g');
      const box = el('rect', {
        x: cc.x - CHIP_W / 2,
        y: cc.y - CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 6,
        fill: sealed ? c.itemSorted : c.bg,
        stroke: refused ? c.danger : sealed ? c.itemSorted : known ? c.text : c.border,
        'stroke-width': refused ? 3 : 2,
      });
      // 아직 아무 값도 못 받은 칸만 점선이다 — 값의 형편이 채움과 테두리 꼴을 정한다.
      if (!known) box.setAttribute('stroke-dasharray', '4 3');
      const ink = el('text', {
        x: cc.x,
        y: cc.y + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: sealed ? c.textInverse : known ? c.text : c.textMuted,
      });
      ink.textContent = fmt(value);
      g.appendChild(box);
      g.appendChild(ink);
      chipLayer.appendChild(g);
      if (node === scene.goal) parts.goalChip = g;

      if (!sealed) return;
      // 굳은 자리에는 뚜껑이 물려 있다. 굳었다는 말을 채움과 함께 두 겹으로 한다.
      const up = above(node);
      const restY = up ? cc.y - CHIP_H / 2 - 4 : cc.y + CHIP_H / 2 + 4;
      const lid = el('g');
      lid.appendChild(
        el('rect', {
          x: cc.x - (CHIP_W / 2 + 5),
          y: restY - 5,
          width: CHIP_W + 10,
          height: 10,
          rx: 5,
          fill: refused ? c.danger : c.itemSorted,
        }),
      );
      chipLayer.appendChild(lid);
      parts.lid.set(node, lid);
    }

    /** 참값. 도착점은 큰 칸으로, 나머지 어긋난 자리는 작은 배지로 남는다. */
    function drawTruthValues(scene: NegativeEdgeBreaksScene): void {
      if (scene.truthPath.length === 0) return;
      const total = truthTotal(scene);

      for (const m of truthMismatches(scene)) {
        if (m.node === scene.goal) continue;
        const cc = chipAt(m.node);
        const mx = cc.x - CHIP_W / 2 - 4 - MINI_W / 2;
        chipLayer.appendChild(
          el('rect', {
            x: mx - MINI_W / 2,
            y: cc.y - MINI_H / 2,
            width: MINI_W,
            height: MINI_H,
            rx: 5,
            fill: c.accent,
            stroke: c.accent,
            'stroke-width': 2,
          }),
        );
        const mini = el('text', {
          x: mx,
          y: cc.y + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: c.stateInk,
        });
        mini.textContent = fmt(m.value);
        chipLayer.appendChild(mini);
      }

      // 도착점의 참값. 굳힌 칸의 반대편에 서므로 두 수가 한 화면에 나란히 남는다.
      if (!scene.truthPath.includes(scene.goal) || total === null) return;
      const tc = truthCellAt(scene.goal);
      const g = el('g');
      g.appendChild(
        el('rect', {
          x: tc.x - CHIP_W / 2,
          y: tc.y - CHIP_H / 2,
          width: CHIP_W,
          height: CHIP_H,
          rx: 6,
          fill: c.accent,
          stroke: c.accent,
          'stroke-width': 2,
        }),
      );
      const ink = el('text', {
        x: tc.x,
        y: tc.y + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: c.stateInk,
      });
      ink.textContent = fmt(total);
      g.appendChild(ink);
      chipLayer.appendChild(g);
      parts.goalTruth = g;
    }

    /** 두 수에 이름을 붙이고 틀린 쪽에 가위표를 단다. 견줌이 끝난 뒤에만 선다. */
    function drawJudgement(scene: NegativeEdgeBreaksScene): void {
      if (!scene.judged) return;
      const cc = chipAt(scene.goal);
      const mark = el('text', {
        x: cc.x + CHIP_W / 2 + 10,
        y: cc.y + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: c.danger,
      });
      mark.textContent = CROSS;
      chipLayer.appendChild(mark);

      const up = above(scene.goal);
      chipLayer.appendChild(
        makeLabel(
          { x: cc.x, y: up ? cc.y - CHIP_H / 2 - 8 : cc.y + CHIP_H / 2 + 16 },
          tr('label.settled', 'settled'),
          fontSizes.xs,
        ),
      );
      // 참값 칸이 아직 서지 않았으면 그 이름표도 짓지 않는다 — 숨기는 것이 아니라
      // 짓지 않는 쪽이다 (닿지 않는 도착점이면 참 최단 자체가 없다).
      if (parts.goalTruth === null) return;
      const tc = truthCellAt(scene.goal);
      chipLayer.appendChild(
        makeLabel(
          { x: tc.x, y: up ? tc.y + CHIP_H / 2 + 16 : tc.y - CHIP_H / 2 - 8 },
          tr('label.true', 'true'),
          fontSizes.xs,
        ),
      );
    }

    /**
     * 남는 표식들 — 튕긴 후보 · 비켜선 후보 · 막과 갇힌 소식.
     *
     * 옮기기 전에는 이 셋이 전부 `layers.fx` 에 쌓이기만 하고 그것을 아는 코드가
     * 없었다. 쌓이던 것이 곧 이 조각의 주장이라 여기로 끌어올린다.
     */
    function drawMarks(scene: NegativeEdgeBreaksScene): void {
      scene.refusals.forEach((r, i) => {
        const ax = axisOf(r.from, r.to);
        if (!ax) return;
        const stack = scene.refusals.filter((o, k) => k < i && o.from === r.from && o.to === r.to)
          .length;
        const tok = makeToken({
          text: fmt(r.candidate),
          fill: c.danger,
          stroke: c.danger,
          ink: c.stateInk,
        });
        const strike = el('line', {
          x1: -17,
          y1: 0,
          x2: 17,
          y2: 0,
          stroke: c.stateInk,
          'stroke-width': 2,
        });
        tok.g.appendChild(strike);
        place(tok.g, restAt(ax, 1, stack));
        markLayer.appendChild(tok.g);
        parts.refusal.push({ g: tok.g, box: tok.box, strike });
      });

      scene.keeps.forEach((k, i) => {
        const ax = axisOf(k.from, k.to);
        if (!ax) return;
        const stack = scene.keeps.filter((o, j) => j < i && o.from === k.from && o.to === k.to)
          .length;
        // 거절과 어휘를 가른다 — 채움 없이 회색 점선으로 비켜설 뿐 가위표는 없다.
        const tok = makeToken({
          text: fmt(k.candidate),
          fill: 'none',
          stroke: c.textMuted,
          ink: c.textMuted,
          dash: true,
        });
        place(tok.g, restAt(ax, -1, stack));
        markLayer.appendChild(tok.g);
        parts.keep.push({ g: tok.g, box: tok.box });
      });

      for (const b of scene.blocks) {
        const ax = axisOf(b.node, b.to);
        if (!ax) continue;
        const gx = ax.a.x + ax.ux * BARRIER_AT;
        const gy = ax.a.y + ax.uy * BARRIER_AT;
        markLayer.appendChild(
          el('line', {
            x1: gx + ax.nx * 16,
            y1: gy + ax.ny * 16,
            x2: gx - ax.nx * 16,
            y2: gy - ax.ny * 16,
            stroke: c.danger,
            'stroke-width': 5,
            'stroke-linecap': 'round',
          }),
        );
        const ghost = makeToken({
          text: fmt(b.wouldBe),
          fill: c.bg,
          stroke: c.danger,
          ink: c.danger,
          w: GHOST_W,
          dash: true,
        });
        place(ghost.g, { x: ax.a.x + ax.ux * GHOST_HOME, y: ax.a.y + ax.uy * GHOST_HOME });
        markLayer.appendChild(ghost.g);
        parts.ghost.push(ghost.g);
      }
    }

    // ── 캡션. 무엇을 말할지는 장면이 정하고 문자는 여기서 만든다 (C10) ───────

    function captionTextOf(scene: NegativeEdgeBreaksScene): string {
      const cap: NegativeEdgeBreaksCaption | null = scene.caption;
      if (cap === null) return '';
      switch (cap.kind) {
        case 'start':
          return tr('caption.start', 'Start at {start}. Nothing is settled yet.', {
            start: scene.start,
          });
        case 'settle':
          return tr('caption.settle', 'The nearest one left is {node} at {d} — settle it.', {
            node: cap.node,
            d: fmt(distOf(scene, cap.node)),
          });
        case 'accept':
          return tr('caption.accept', 'Relax {from}→{to}: {d}. {to} takes it.', {
            from: cap.from,
            to: cap.to,
            d: fmt(distOf(scene, cap.to)),
          });
        case 'sealed': {
          const r = lastRefusal(scene);
          return tr(
            'caption.sealed',
            '{from}→{to} gives {cand}, shorter than {kept}. But {to} is settled and refuses it.',
            {
              from: cap.from,
              to: cap.to,
              cand: fmt(r?.candidate ?? candidateOf(scene, cap.from, cap.to)),
              kept: fmt(r?.kept ?? distOf(scene, cap.to)),
            },
          );
        }
        case 'kept': {
          const k = lastKeep(scene);
          return tr(
            'caption.kept',
            '{from}→{to} gives {cand}, no better than {kept}. Nothing moves.',
            {
              from: cap.from,
              to: cap.to,
              cand: fmt(k?.candidate ?? candidateOf(scene, cap.from, cap.to)),
              kept: fmt(k?.kept ?? distOf(scene, cap.to)),
            },
          );
        }
        case 'blocked': {
          const b = lastBlock(scene);
          return tr('caption.blocked', 'So {wouldBe} never leaves {node}, and {to} stays {stays}.', {
            wouldBe: fmt(b?.wouldBe ?? null),
            node: cap.node,
            to: cap.to,
            stays: fmt(b?.stays ?? distOf(scene, cap.to)),
          });
        }
        case 'truth':
          return tr('caption.truth', 'The real shortest path is {path} = {total}.', {
            path: scene.truthPath.join('→'),
            total: fmt(truthTotal(scene)),
          });
        case 'verdict':
          return tr(
            'caption.verdict',
            '{goal} keeps {settled}, but the answer is {truth}. The settled number is wrong.',
            {
              goal: scene.goal,
              settled: fmt(distOf(scene, scene.goal)),
              truth: fmt(truthTotal(scene)),
            },
          );
      }
    }

    function drawStatic(scene: NegativeEdgeBreaksScene): void {
      layout(scene);
      clear(edgeLayer);
      clear(truthLayer);
      clear(nodeLayer);
      clear(chipLayer);
      clear(markLayer);
      // 운동이 쓰던 임시 노드는 정적 화면에 남기지 않는다. 비우는 것으로 거둔다.
      clear(fxLayer);
      parts = {
        lid: new Map(),
        disc: new Map(),
        refusal: [],
        keep: [],
        ghost: [],
        goalChip: null,
        goalTruth: null,
      };

      drawEdges(scene);
      drawTruthPath(scene);
      drawNodes(scene);
      for (const n of scene.nodes) drawChip(scene, n);
      drawTruthValues(scene);
      drawJudgement(scene);
      drawMarks(scene);

      const [a, b] = wrap(captionTextOf(scene), 92);
      capLine1.textContent = a;
      capLine2.textContent = b;
    }

    // ── 걸음 함수. 정적 그리기가 세운 끝 자리에서 **뒤로 물려** 흐르게 한다 ───

    /** 뚜껑이 내려앉아 값을 물린다. */
    function runSettle(node: string, my: number): Promise<void> {
      const lid = parts.lid.get(node);
      if (!lid) return Promise.resolve();
      const dy = above(node) ? -SEAL_LIFT : SEAL_LIFT;
      return animate(SEAL_MS, my, (e) => {
        lid.setAttribute('transform', `translate(0 ${fix(dy * (1 - ease(e)))})`);
      });
    }

    /** 후보가 간선을 따라 날아가 거리 칸에 앉는다. */
    function runAccept(
      scene: NegativeEdgeBreaksScene,
      from: string,
      to: string,
      my: number,
    ): Promise<void> {
      const a = spot.get(from);
      if (!a) return Promise.resolve();
      const target = chipAt(to);
      const tok = makeToken({
        text: fmt(distOf(scene, to)),
        fill: c.itemComparing,
        stroke: c.itemComparing,
        ink: c.stateInk,
      });
      fxLayer.appendChild(tok.g);
      return animate(TRAVEL_MS, my, (e) => {
        const travel = Math.min(1, e / FADE_FROM);
        place(tok.g, lerp(a, target, ease(travel)));
        // 값이 칸에 앉았으니 나르던 것은 사그라든다. 한 시계 안의 뒷마디다.
        const fade = e <= FADE_FROM ? 1 : 1 - (e - FADE_FROM) / (1 - FADE_FROM);
        tok.g.setAttribute('opacity', String(fix(fade)));
      });
    }

    /**
     * 후보가 굳은 자리에 부딪혀 튕겨 나간다.
     *
     * 옮길 것이 한 뜻으로 묶여 있으므로 **시계를 하나만 돌린다** — 날아가고, 부딪혀
     * 멎고, 비켜서는 셋이 한 마디의 세 구간이다.
     */
    function runBounce(
      scene: NegativeEdgeBreaksScene,
      from: string,
      to: string,
      refused: boolean,
      my: number,
    ): Promise<void> {
      const ax = axisOf(from, to);
      if (!ax) return Promise.resolve();
      const mark = refused
        ? parts.refusal[parts.refusal.length - 1]
        : parts.keep[parts.keep.length - 1];
      if (!mark) return Promise.resolve();
      const strike = refused ? parts.refusal[parts.refusal.length - 1].strike : null;
      const disc = parts.disc.get(to);
      const start = ax.a;
      const hit = hitAt(ax);
      // 정적 그리기가 세워 둔 자리를 **되읽지 않고** 같은 셈을 다시 한다 — 화면을
      // 도로 읽으면 되감은 직후에는 그것이 아직 옛 화면의 값이다.
      const marks = refused ? scene.refusals : scene.keeps;
      const stack = marks.filter(
        (o, k) => k < marks.length - 1 && o.from === from && o.to === to,
      ).length;
      const rest = restAt(ax, refused ? 1 : -1, stack);

      const total = refused ? REFUSE_MS : KEEP_MS;
      return animate(total, my, (e) => {
        let p: Pt;
        if (e < HIT_AT) p = lerp(start, hit, ease(e / HIT_AT));
        else if (e < HOLD_UNTIL) p = hit;
        else p = lerp(hit, rest, ease((e - HOLD_UNTIL) / (1 - HOLD_UNTIL)));
        place(mark.g, p);

        // 아직 견주는 중인 후보다. 부딪힌 뒤에야 제 칠을 입는다.
        const landed = e >= HOLD_UNTIL;
        mark.box.setAttribute('fill', landed ? (refused ? c.danger : 'none') : c.itemComparing);
        mark.box.setAttribute('stroke', landed ? (refused ? c.danger : c.textMuted) : c.itemComparing);
        if (strike) strike.setAttribute('opacity', landed ? '1' : '0');

        // 굳은 껍질이 부딪히는 동안 한 번 두꺼워진다. 붉은 테는 정적으로 **남는다.**
        if (refused && disc) {
          const ringing = e >= HIT_AT && e < HOLD_UNTIL;
          disc.setAttribute('stroke-width', ringing ? '7' : '4');
        }
      });
    }

    /** 갇힌 소식이 밖으로 나가려다 막에 되밀린다. */
    function runBlock(node: string, to: string, my: number): Promise<void> {
      const ax = axisOf(node, to);
      const ghost = parts.ghost[parts.ghost.length - 1];
      if (!ax || !ghost) return Promise.resolve();
      const home = { x: ax.a.x + ax.ux * GHOST_HOME, y: ax.a.y + ax.uy * GHOST_HOME };
      const out = { x: ax.a.x + ax.ux * GHOST_OUT, y: ax.a.y + ax.uy * GHOST_OUT };
      return animate(PUSH_MS, my, (e) => {
        place(ghost, lerp(home, out, ease(thereAndBack(e))));
      });
    }

    /**
     * 누계가 참 최단 경로를 밟아 간다.
     *
     * 다리마다 시계를 따로 두지 않는다 — 한 뜻으로 이어진 하나의 걸음이라 밟을 곳을
     * 한 목록에 모으고 **한 `animate`** 로 흘린다.
     */
    function runTruth(scene: NegativeEdgeBreaksScene, my: number): Promise<void> {
      const running = truthRunning(scene);
      if (running.length === 0) return Promise.resolve();
      const stops: Pt[] = scene.truthPath.map((n) => at(n));
      // 마지막 다리는 도착점에서 참값 칸으로 내려앉는 몫이다.
      stops.push(truthCellAt(scene.goal));

      const legs: number[] = [];
      let total = 0;
      for (let i = 1; i < stops.length; i += 1) {
        const d = Math.hypot(stops[i].x - stops[i - 1].x, stops[i].y - stops[i - 1].y);
        legs.push(d);
        total += d;
      }
      if (total <= 0) return Promise.resolve();

      const tok = makeToken({
        text: fmt(running[0]),
        fill: c.accent,
        stroke: c.accent,
        ink: c.stateInk,
      });
      place(tok.g, stops[0]);
      fxLayer.appendChild(tok.g);

      return animate(TRUTH_MS, my, (e) => {
        let travelled = ease(e) * total;
        let i = 0;
        while (i < legs.length - 1 && travelled > legs[i]) {
          travelled -= legs[i];
          i += 1;
        }
        const k = legs[i] > 0 ? Math.min(1, travelled / legs[i]) : 1;
        place(tok.g, lerp(stops[i], stops[i + 1], k));
        // 다리를 건널 때마다 누계가 갱신된다. 자기 글자를 되읽어 덧붙이지 않는다.
        const reached = Math.min(running.length - 1, k >= 1 ? i + 1 : i);
        tok.ink.textContent = fmt(running[reached]);
      });
    }

    /** 굳힌 수와 참값이 나란히 부풀었다 돌아온다. */
    function runJudge(scene: NegativeEdgeBreaksScene, my: number): Promise<void> {
      const targets: Array<{ g: SVGGElement; at: Pt }> = [];
      if (parts.goalChip) targets.push({ g: parts.goalChip, at: chipAt(scene.goal) });
      if (parts.goalTruth) targets.push({ g: parts.goalTruth, at: truthCellAt(scene.goal) });
      if (targets.length === 0) return Promise.resolve();
      return animate(JUDGE_MS, my, (e) => {
        const s = 1 + 0.14 * thereAndBack(e);
        for (const t of targets) {
          t.g.setAttribute(
            'transform',
            `translate(${fix(t.at.x)} ${fix(t.at.y)}) scale(${fix(s)}) translate(${fix(-t.at.x)} ${fix(-t.at.y)})`,
          );
        }
      });
    }

    async function render(
      next: NegativeEdgeBreaksScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: NegativeEdgeBreaksScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'settle':
          await runSettle(step.node, my);
          break;
        case 'accept':
          await runAccept(next, step.from, step.to, my);
          break;
        case 'refuse':
          await runBounce(next, step.from, step.to, true, my);
          break;
        case 'keep':
          await runBounce(next, step.from, step.to, false, my);
          break;
        case 'block':
          await runBlock(step.node, step.to, my);
          break;
        case 'truth':
          await runTruth(next, my);
          break;
        case 'judge':
          await runJudge(next, my);
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 자취를 거두고 그 장면을 통째로 다시 세운다. 속성을 하나씩
      // 되돌리는 것보다 안전하고, 보간값의 끝자리가 문자열을 가르지도 않는다.
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) dropFrame(id);
        frames.clear();
        // 기다리던 것을 깨워 보낸다. 매달아 두면 러너의 reset 이 함께 멎는다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
