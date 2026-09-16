/**
 * greedy-can-fail-stage — 같은 선반에서 동전을 집어 나란히 나아가는 두 줄.
 *
 * ── 왜 이 모양인가
 *
 * 물음은 "눈앞의 최선이 끝의 최선인가" 이고, 동사는 **두 길이 갈려 다른 데 닿는다**
 * 이다. 그래서 나무도 막대그래프도 아니다. 화면은 **같은 자로 잰 두 줄**이고, 걸음마다
 * 그 두 줄이 벌어지는 것이 전부다.
 *
 *   - 선반은 하나다. 두 줄이 똑같은 동전을 쓴다는 것을 눈으로 못박는다.
 *   - 걸음마다 동전이 선반에서 **두 갈래로 갈라져 날아간다.** 갈림은 그 궤적이다.
 *   - 동전은 같은 너비의 칸에 놓인다. 칸이 같으니 **줄의 길이가 곧 개수**다.
 *     액면은 지름으로 읽힌다 — 큰 것을 집은 줄이 오히려 길어지는 역전이 보이려면
 *     크기와 길이가 따로 읽혀야 한다.
 *   - 오른쪽 기둥은 "아직 만들어야 하는 몫" 이다. 맨 위 목표가 두 줄로 내려가 각자
 *     줄어들고, 먼저 0 에 닿은 줄에 눈금이 선다.
 *   - 끝에 두 줄 밑으로 잣대가 그어진다. 큰 것부터 집은 줄이 넘어간 만큼이 붉다.
 *
 * **다 끝난 화면에 두 결말이 나란히 남는다.** 놓인 동전도, 먼저 끝난 자리의 눈금도,
 * 두 잣대도, 넘어간 만큼의 붉은 도막도 지워지지 않는다. 이 조각의 주장이 곧 그 둘의
 * 차이이므로 마지막 화면이 그 차이를 그대로 이고 있어야 한다.
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그 장면의
 * 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다 (S-scene).
 * 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * **두 줄은 한 시계로 돈다.** 집는 걸음에는 동전 둘이 날아가고 남은 몫 둘이 함께
 * 바뀌는데, 그 넷이 이 조각의 "나란함" 그 자체다. 시계를 둘로 나누면 나란함이 우연히
 * 맞는 꼴이 되고 하나를 `void` 로 흘릴 여지가 생긴다 — 흐를 것을 `Motion` 하나에 모아
 * 한 시계로 흘리면 `render` 의 Promise 가 넷 다 선 뒤에 구조적으로 풀린다 (S-scene).
 *
 * `prev` 는 들추지 않는다. 날아오는 동전의 출발 자리도, 바뀌기 전의 남은 몫
 * (`지금 남은 몫 + 방금 집은 액면`) 도 전부 `next` 에서 되셈된다.
 *
 * ── 수와 자리
 *
 * 화면에 뜨는 수는 전부 `scene.ts` 의 셈 함수를 지난다 (`countOf` · `remainingOf` ·
 * `excessOf` · `lastPickOf`). 오른쪽 눈금의 수, 잣대의 길이, `4 개` · `2 개`, 캡션의
 * 수가 같은 출처라 갈릴 자리가 없다. 자리는 여기서 캔버스로부터 역산한다 — 칸 폭도
 * 동전의 지름도 장면에 없다 (S-piece).
 *
 * 세로는 내용으로 변하지 않으므로 `viewBox` 를 다시 재지 않는다 (S-view).
 *
 * ── 뒷일
 *
 * rAF 루프 하나만 쓰고 destroy() 에서 세운다. 대기 중인 애니메이션 Promise 는 destroy
 * 시 전부 즉시 결과를 낸다 — **취소된 tick 은 아예 불리지 않으므로** 걸린 채로 두면
 * 알고리즘이 멈춘 자리에서 영영 깨어나지 못한다 (S-piece).
 *
 * 지연 발화를 막는 것은 **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant` 와
 * `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다 (S-scene).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  countOf,
  denominationsOf,
  excessOf,
  GREEDY_LANES,
  lastPickOf,
  movedLanes,
  remainingOf,
  settlingLane,
  type GreedyCanFailScene,
  type GreedyLane,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const px = (token: string): number => Number.parseFloat(token);

// ── 자리. 가로는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 328;
const SIDE = 24;
const NAME_W = 128;
const PILL_W = 84;
const PILL_H = 32;
const PILL_GAP = 18;
const TRACK_X = SIDE + NAME_W;
const TRACK_RIGHT = W - SIDE - PILL_W - PILL_GAP;
const TRACK_W = TRACK_RIGHT - TRACK_X;
const RIGHT_X = TRACK_RIGHT + PILL_GAP;

const COIN_R_MAX = 30;
const COIN_R_MIN = 14;
const CELL_MAX = COIN_R_MAX * 2 + 26;

const SHELF_Y = 84;
const CHIP_H = 44;
const CHIP_Y = SHELF_Y - 52;
const CHIP_NUM_Y = CHIP_Y + 36;
const RAIL_Y: Record<GreedyLane, number> = { greedy: 170, fewest: 262 };
const PILL_NUM_DY = 6;
const TICK_UP = 12;
const TICK_DOWN = 8;
const BAR_DY = 10;
const BAR_WIDTH = 5;
const CAPTION_Y = 298;
const CAPTION_LEAD = 18;
const CAPTION_LINES = 2;

// ── 지속시간. 걸음 하나는 여기에 stepMs 가 더해진 길이다 (S-piece).
const GOAL_MS = 380;
const FLY_MS = 460;
/**
 * 눈금이 서는 걸음에 얹는 운동.
 *
 * 이 걸음은 원래 눈금 하나만 그어 벽시계가 사실상 `stepMs` 였다. `stepMs` 를 올리면
 * 이미 긴 걸음이 함께 길어지므로 이 걸음에만 두께를 더한다 — 눈금이 그어지는 동안
 * 그 줄의 동전들이 한 번 부푼다. 이미 서 있던 것이라 나타나는 꼴이 아니라 부풀었다
 * 돌아오는 꼴이 맞다 (프로토콜 4 절).
 */
const SETTLE_MS = 320;
const DRAW_MS = 440;
const EXCESS_MS = 240;

/** 눈금이 설 때 그 줄의 동전이 부푸는 정도. */
const SWELL = 0.1;
/** 날아오는 동전이 그리는 활의 높이. */
const FLY_ARC = 16;
/** 남은 몫의 수가 갈릴 때 위아래로 빠지는 거리. */
const SWAP_DY = 10;
/** 수가 갈리는 지점. 동전이 거의 다 내려앉았을 때다. */
const SWAP_AT = 0.5;

type TextOpts = {
  size?: string;
  fill?: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
};

/** 선반에 놓인 액면 하나의 자리·지름·칠. 바탕에서 나오므로 매번 다시 셈한다. */
type ShelfCoin = { x: number; y: number; r: number; fill: string };

/** 캔버스에서 역산한 자리들. 장면만 알면 나오는 값이라 매번 다시 셈한다. */
type Layout = {
  cell: number;
  shelf: Map<number, ShelfCoin>;
  /** 줄의 `slot` 번째 칸의 한가운데. */
  coinX(slot: number): number;
  /** 줄에 놓일 때의 지름. 칸이 좁아지면 동전도 그만큼 줄인다. */
  coinR(value: number): number;
};

/** 그린 것의 손잡이. 운동이 만질 것만 쥔다 — 뜻이나 수치는 담지 않는다. */
type LaneNodes = {
  railY: number;
  pillNum: SVGTextElement;
  coins: SVGGElement[];
  tick: SVGLineElement | null;
  bar: SVGLineElement | null;
  excess: SVGLineElement | null;
};

/** 한 걸음에 흐를 것 전부. 시계 하나로 돈다. */
type Motion = { duration: number; apply(t: number): void };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** 액면을 지름으로 읽힌다. 가장 큰 액면이 상한을 쓴다. */
function coinRadius(value: number, maxCoin: number): number {
  if (maxCoin <= 0) return COIN_R_MIN;
  const ratio = Math.min(1, Math.max(0, value / maxCoin));
  return COIN_R_MIN + (COIN_R_MAX - COIN_R_MIN) * ratio;
}

/**
 * 글자 폭을 어림한다. 한글과 전각 글자는 라틴 글자의 두 배 폭으로 센다 — 글자 수로만
 * 재면 한국어 캡션이 화면 밖으로 나간다.
 */
function widthUnits(s: string): number {
  let units = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    units += wide ? 2 : 1;
  }
  return units;
}

/** 캡션을 정해진 줄 수 안으로 접는다. SVG text 는 스스로 접히지 않는다. */
function wrapLines(message: string, maxUnits: number, maxLines: number): string[] {
  const words = message.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (widthUnits(candidate) > maxUnits && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // 줄 수를 넘기면 마지막 줄에 남은 것을 몰아 담는다. 잘라 버리지는 않는다.
  const folded = lines.slice(0, maxLines - 1);
  folded.push(lines.slice(maxLines - 1).join(' '));
  return folded;
}

/**
 * 장면으로부터 자리를 셈한다.
 *
 * 칸 폭은 **칸 예산**으로 역산한다 — 지금까지 놓인 수로 잡으면 줄이 길어질 때마다
 * 이미 놓인 동전이 통째로 밀린다. 예산은 장면의 `capacity` 하나가 말한다.
 */
function layoutOf(scene: GreedyCanFailScene): Layout {
  const denominations = denominationsOf(scene);
  const maxCoin = denominations[0] ?? 0;
  const tone = categorical(Math.max(1, denominations.length), 'vivid');
  const cell = Math.min(CELL_MAX, TRACK_W / Math.max(1, scene.capacity));

  const shelf = new Map<number, ShelfCoin>();
  denominations.forEach((value, i) => {
    const r = coinRadius(value, maxCoin);
    shelf.set(value, {
      x: TRACK_X + (TRACK_W * (i + 0.5)) / denominations.length,
      y: SHELF_Y - r,
      r,
      fill: tone[i % tone.length] ?? '',
    });
  });

  return {
    cell,
    shelf,
    coinX: (slot) => TRACK_X + cell * (slot + 0.5),
    coinR: (value) => Math.min(coinRadius(value, maxCoin), cell / 2 - 3),
  };
}

export const greedyCanFailStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<GreedyCanFailScene> {
    const canvas = params.canvas;
    const pal: Palette = getColors(params.theme);
    // 러너 밖 마운트를 위한 fallback. 러너가 주면 저작자 문안이 얹힌 조회기다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const root = svgEl('g', {});
    canvas.appendChild(root);

    // ── 애니메이션 동력 ──────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await ctx.emit`
     * 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가 통째로 붙들린다
     * (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 모든 요소를 매번 새로 만들므로 살아남은 옛 운동이 쥔 것은 이미
     * 떨어져 나간 노드다. 그래도 빗장을 둔다 — 깨어난 프레임이 헛일을 하는 것을
     * 여기서 끊고, 무엇이 유효한 세대인지가 코드에 적힌다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };
    const nowMs = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(duration: number, my: number, apply: (t: number) => void): Promise<void> {
      const paint = (t: number): void => {
        if (alive(my)) apply(t);
      };
      paint(0);
      if (destroyed || duration <= 0) {
        paint(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const startedAt = nowMs();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const t = Math.min(1, (nowMs() - startedAt) / duration);
          paint(t);
          if (t >= 1) {
            finish();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });
    }

    // ── 그리기 밑감 ──────────────────────────────────────────────────────

    function text(x: number, y: number, content: string, opts: TextOpts = {}): SVGTextElement {
      const node = svgEl('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': opts.size ?? fontSizes.md,
        'font-weight': opts.weight ?? 400,
        fill: opts.fill ?? pal.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      node.textContent = content;
      return node;
    }

    function rule(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      stroke: string,
      width: number,
    ): SVGLineElement {
      return svgEl('line', {
        x1,
        y1,
        x2,
        y2,
        stroke,
        'stroke-width': width,
        'stroke-linecap': 'round',
      });
    }

    function setPos(node: SVGElement, x: number, y: number, scale = 1): void {
      const at = `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
      node.setAttribute('transform', scale === 1 ? at : `${at} scale(${scale.toFixed(4)})`);
    }

    function coinFontSize(r: number): number {
      return Math.max(px(fontSizes.sm), Math.min(px(fontSizes.lg), Math.round(r * 0.85)));
    }

    function coinNode(value: number, r: number, fill: string): SVGGElement {
      const group = svgEl('g', {});
      group.appendChild(svgEl('circle', { cx: 0, cy: 0, r, fill }));
      const size = coinFontSize(r);
      group.appendChild(
        text(0, size * 0.35, String(value), {
          size: `${size}px`,
          weight: 700,
          // categorical 은 테마를 따라 뒤집지 않는 고정 타일이라 잉크도 고정한다.
          fill: pal.stateInk,
          anchor: 'middle',
        }),
      );
      return group;
    }

    const laneLabel = (lane: GreedyLane): string =>
      lane === 'greedy'
        ? tr('label.laneGreedy', 'largest first')
        : tr('label.laneFewest', 'fewest coins');

    // ── 문안 ─────────────────────────────────────────────────────────────

    /**
     * 캡션의 문자를 만든다.
     *
     * 장면은 무엇을 말할지만 쥐고 있고 수는 여기서 셈 함수로 꺼낸다 — 화면의 동전과
     * 잣대가 같은 함수를 지나므로 캡션의 수와 갈릴 수 없다 (C10, 프로토콜 4 절).
     */
    function captionText(scene: GreedyCanFailScene): string {
      const caption = scene.caption;
      if (!caption) return '';
      switch (caption.kind) {
        case 'setup':
          return tr(
            'caption.setup',
            'Both rows share the shelf above and may take any coin as often as they need.',
          );

        case 'goal':
          return tr('caption.goal', 'Both rows set out from the same target — {target}.', {
            target: scene.target,
          });

        case 'fork':
          return tr(
            'caption.fork',
            'The first pick already splits them. One row takes {a}, the other {b}. Left over — {ra} and {rb}.',
            {
              a: lastPickOf(scene, 'greedy') ?? 0,
              b: lastPickOf(scene, 'fewest') ?? 0,
              ra: remainingOf(scene, 'greedy'),
              rb: remainingOf(scene, 'fewest'),
            },
          );

        case 'round':
          return tr(
            'caption.round',
            'Each row takes one more coin by its own rule. Left over — {ra} and {rb}.',
            { ra: remainingOf(scene, 'greedy'), rb: remainingOf(scene, 'fewest') },
          );

        case 'alone': {
          // 움직인 줄이 하나뿐인 걸음이다. 그 줄의 수만 말한다.
          const lane = movedLanes(scene)[0];
          if (lane === undefined) return '';
          return tr(
            'caption.alone',
            'Only the row that is still short moves now. It takes {a}, leaving {ra}.',
            { a: lastPickOf(scene, lane) ?? 0, ra: remainingOf(scene, lane) },
          );
        }

        case 'settled': {
          const lane = settlingLane(scene);
          if (lane === null) return '';
          const other: GreedyLane = lane === 'greedy' ? 'fewest' : 'greedy';
          return tr(
            'caption.settled',
            'One row is already finished with {n} coins. The other is still short — {r}.',
            { n: countOf(scene, lane), r: remainingOf(scene, other) },
          );
        }

        case 'verdict':
          return tr(
            'caption.verdict',
            'Same coins, same target: {g} coins for largest first, {f} for fewest. The bigger first pick cost {d} more.',
            {
              g: countOf(scene, 'greedy'),
              f: countOf(scene, 'fewest'),
              d: excessOf(scene),
            },
          );
      }
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────

    /**
     * 장면이 말하는 것을 전부 세운다.
     *
     * 걸음마다 통째로 다시 짓는다. 되돌릴 명령이 필요 없고, 흐르던 운동이 남긴 속성도
     * 남을 자리가 없다 (S-scene). 요소를 계속 쓰지 않으므로 "숨기기만 해서 앞 걸음의
     * 값이 남는" 자리도 생기지 않는다 — 아직 없는 것은 짓지 않는다.
     */
    function drawStatic(scene: GreedyCanFailScene): Record<GreedyLane, LaneNodes> {
      const at = layoutOf(scene);
      root.textContent = '';

      // 선반 — 두 줄이 함께 쓰는 동전.
      root.appendChild(rule(TRACK_X, SHELF_Y, TRACK_RIGHT, SHELF_Y, pal.border, 1.5));
      for (const [value, spot] of at.shelf) {
        const node = coinNode(value, spot.r, spot.fill === '' ? pal.itemDefault : spot.fill);
        setPos(node, spot.x, spot.y);
        root.appendChild(node);
      }

      // 목표 — 오른쪽 기둥의 머리.
      root.appendChild(
        svgEl('rect', {
          x: RIGHT_X,
          y: CHIP_Y,
          width: PILL_W,
          height: CHIP_H,
          rx: px(radii.md),
          fill: pal.bgSubtle,
          stroke: pal.border,
          'stroke-width': 1,
        }),
      );
      root.appendChild(
        text(RIGHT_X + PILL_W / 2, CHIP_Y + 16, tr('label.target', 'target'), {
          size: fontSizes.xs,
          fill: pal.textMuted,
          anchor: 'middle',
        }),
      );
      root.appendChild(
        text(RIGHT_X + PILL_W / 2, CHIP_NUM_Y, String(scene.target), {
          size: fontSizes.xl,
          weight: 700,
          anchor: 'middle',
        }),
      );

      const excess = excessOf(scene);
      const drawn = {} as Record<GreedyLane, LaneNodes>;

      for (const lane of GREEDY_LANES) {
        const railY = RAIL_Y[lane];
        const count = countOf(scene, lane);
        const settled = scene.settled[lane];

        root.appendChild(rule(TRACK_X, railY, TRACK_RIGHT, railY, pal.border, 1.5));
        root.appendChild(text(SIDE, railY - 6, laneLabel(lane), { weight: 600 }));

        // 개수는 견주는 걸음에서만 뜬다. 그때까지는 줄의 길이가 그것을 말한다.
        if (scene.judged) {
          root.appendChild(
            text(SIDE, railY + 18, tr('label.count', '{n} coins', { n: count }), {
              size: fontSizes.sm,
              fill: pal.textMuted,
            }),
          );
        }

        // 남은 몫 눈금. 끝난 줄인가를 칠로 **매번 명시로** 쓴다.
        root.appendChild(
          svgEl('rect', {
            x: RIGHT_X,
            y: railY - PILL_H / 2,
            width: PILL_W,
            height: PILL_H,
            rx: px(radii.md),
            fill: settled ? pal.itemSorted : pal.bg,
            stroke: settled ? pal.itemSorted : pal.border,
            'stroke-width': 1,
          }),
        );
        const pillNum = text(
          RIGHT_X + PILL_W / 2,
          railY + PILL_NUM_DY,
          scene.started ? String(remainingOf(scene, lane)) : '',
          {
            size: fontSizes.lg,
            weight: 700,
            anchor: 'middle',
            fill: settled ? pal.textInverse : pal.text,
          },
        );
        root.appendChild(pillNum);

        // 집은 동전. 어느 칸에 앉는지는 차례가 정하고 자리는 여기서 역산한다.
        const coins: SVGGElement[] = [];
        scene.picks[lane].forEach((value, slot) => {
          const r = at.coinR(value);
          const spot = at.shelf.get(value);
          const node = coinNode(value, r, spot?.fill === undefined || spot.fill === '' ? pal.itemDefault : spot.fill);
          setPos(node, at.coinX(slot), railY - r);
          root.appendChild(node);
          coins.push(node);
        });

        // 먼저 끝난 자리의 눈금. **남는 강조**라 정적 그리기가 세운다 (S-scene).
        let tick: SVGLineElement | null = null;
        if (settled) {
          const x = TRACK_X + at.cell * count;
          tick = rule(x, railY - TICK_UP, x, railY + BAR_DY + TICK_DOWN, pal.text, 2);
          root.appendChild(tick);
        }

        // 잣대와 넘어간 만큼. 견주기 전에는 아예 짓지 않는다 — 길이 0 짜리 선을
        // 미리 두면 둥근 끝이 점으로 찍혀 잴 자리를 광고한다 (프로토콜 4 절).
        let bar: SVGLineElement | null = null;
        let excessBar: SVGLineElement | null = null;
        if (scene.judged) {
          bar = rule(
            TRACK_X,
            railY + BAR_DY,
            TRACK_X + at.cell * count,
            railY + BAR_DY,
            pal.text,
            BAR_WIDTH,
          );
          root.appendChild(bar);
          if (lane === 'greedy' && excess > 0) {
            excessBar = rule(
              TRACK_X + at.cell * countOf(scene, 'fewest'),
              railY + BAR_DY,
              TRACK_X + at.cell * count,
              railY + BAR_DY,
              pal.danger,
              BAR_WIDTH,
            );
            root.appendChild(excessBar);
          }
        }

        drawn[lane] = { railY, pillNum, coins, tick, bar, excess: excessBar };
      }

      // 캡션 두 줄.
      const maxUnits = Math.floor((W - SIDE * 2) / (px(fontSizes.md) * 0.52));
      const lines = wrapLines(captionText(scene), maxUnits, CAPTION_LINES);
      for (let i = 0; i < CAPTION_LINES; i += 1) {
        root.appendChild(
          text(SIDE, CAPTION_Y + CAPTION_LEAD * i, lines[i] ?? '', {
            size: fontSizes.md,
            fill: pal.textMuted,
          }),
        );
      }

      return drawn;
    }

    // ── 흐르게 할 것 ─────────────────────────────────────────────────────

    /**
     * 이 걸음에 흐를 것을 하나로 모은다.
     *
     * 두 줄이 함께 움직이는 걸음도 목록 하나로 묶어 **시계 하나**가 돌린다. 그래야
     * 나란함이 우연이 아니게 되고 `render` 의 Promise 가 전부 선 뒤에 풀린다 (S-scene).
     */
    function motionFor(
      scene: GreedyCanFailScene,
      drawn: Record<GreedyLane, LaneNodes>,
    ): Motion | null {
      const step = scene.step;
      if (!step) return null;
      const at = layoutOf(scene);

      switch (step.kind) {
        /*
         * 같은 목표가 두 줄로 내려간다. 두 수가 한 시계로 함께 내려가야 "둘이 같은
         * 데서 출발한다" 가 보인다.
         */
        case 'goal': {
          const falling = GREEDY_LANES.map((lane) => ({
            node: drawn[lane].pillNum,
            dy: CHIP_NUM_Y - (drawn[lane].railY + PILL_NUM_DY),
          }));
          return {
            duration: GOAL_MS,
            apply(t) {
              const e = easeOut(t);
              for (const one of falling) {
                one.node.setAttribute('transform', `translate(0 ${(one.dy * (1 - e)).toFixed(2)})`);
              }
            },
          };
        }

        /*
         * 움직인 줄마다 동전 하나가 선반에서 날아와 칸에 앉고, 그 줄의 남은 몫이
         * 갈린다. 둘이 함께 움직이는 걸음이면 넷이 한 시계로 돈다.
         *
         * 바뀌기 전의 남은 몫은 `prev` 에서 꺼내지 않는다 — **지금 남은 몫 + 방금 집은
         * 액면**이라 장면에서 되셈된다 (S-scene).
         */
        case 'pick': {
          const flights: Array<{
            coin: SVGGElement;
            fromX: number;
            fromY: number;
            toX: number;
            toY: number;
            num: SVGTextElement;
            before: string;
            after: string;
          }> = [];
          for (const lane of step.moved) {
            const nodes = drawn[lane];
            const value = lastPickOf(scene, lane);
            const slot = countOf(scene, lane) - 1;
            const coin = nodes.coins[slot];
            if (value === null || !coin) continue;
            const r = at.coinR(value);
            const spot = at.shelf.get(value);
            const left = remainingOf(scene, lane);
            flights.push({
              coin,
              fromX: spot?.x ?? TRACK_X,
              fromY: spot?.y ?? SHELF_Y - r,
              toX: at.coinX(slot),
              toY: nodes.railY - r,
              num: nodes.pillNum,
              before: String(left + value),
              after: String(left),
            });
          }
          if (flights.length === 0) return null;
          return {
            duration: FLY_MS,
            apply(t) {
              const e = easeInOut(t);
              const arc = FLY_ARC * Math.sin(Math.PI * t);
              const swap = t < SWAP_AT;
              const phase = swap ? t / SWAP_AT : (t - SWAP_AT) / (1 - SWAP_AT);
              const p = easeInOut(Math.min(1, phase));
              for (const one of flights) {
                setPos(
                  one.coin,
                  one.fromX + (one.toX - one.fromX) * e,
                  one.fromY + (one.toY - one.fromY) * e - arc,
                );
                one.num.textContent = swap ? one.before : one.after;
                one.num.setAttribute(
                  'transform',
                  `translate(0 ${(swap ? -SWAP_DY * p : SWAP_DY * (1 - p)).toFixed(2)})`,
                );
                one.num.setAttribute('opacity', (swap ? 1 - p : p).toFixed(3));
              }
            },
          };
        }

        /*
         * 먼저 끝난 줄에 눈금이 그어지고, 그 줄의 동전이 한 번 부푼다.
         *
         * 이미 서 있던 것이라 나타나는 꼴이 아니라 부풀었다 돌아오는 꼴이 맞다. 둘을
         * 한 시계로 돌린다.
         */
        case 'settle': {
          const nodes = drawn[step.lane];
          const tick = nodes.tick;
          const swelling = nodes.coins.map((coin, slot) => ({
            coin,
            x: at.coinX(slot),
            y: nodes.railY - at.coinR(scene.picks[step.lane][slot] ?? 0),
          }));
          if (!tick && swelling.length === 0) return null;
          const y1 = nodes.railY - TICK_UP;
          const y2 = nodes.railY + BAR_DY + TICK_DOWN;
          return {
            duration: SETTLE_MS,
            apply(t) {
              const e = easeOut(t);
              if (tick) tick.setAttribute('y2', (y1 + (y2 - y1) * e).toFixed(2));
              const scale = 1 + SWELL * Math.sin(Math.PI * t);
              for (const one of swelling) setPos(one.coin, one.x, one.y, scale);
            },
          };
        }

        /*
         * 두 잣대가 함께 그어지고, 그 뒤에 넘어간 만큼이 붉게 덧그어진다.
         *
         * 두 줄의 잣대는 견주라고 만든 것이라 한 시계로 나란히 자란다.
         */
        case 'judge': {
          const bars = GREEDY_LANES.map((lane) => ({
            node: drawn[lane].bar,
            to: TRACK_X + at.cell * countOf(scene, lane),
          })).filter((b): b is { node: SVGLineElement; to: number } => b.node !== null);
          const over = drawn.greedy.excess;
          const overFrom = TRACK_X + at.cell * countOf(scene, 'fewest');
          const overTo = TRACK_X + at.cell * countOf(scene, 'greedy');
          if (bars.length === 0 && !over) return null;
          const duration = DRAW_MS + (over ? EXCESS_MS : 0);
          const split = DRAW_MS / duration;
          return {
            duration,
            apply(t) {
              const grow = easeOut(Math.min(1, t / split));
              for (const bar of bars) {
                bar.node.setAttribute('x2', (TRACK_X + (bar.to - TRACK_X) * grow).toFixed(2));
              }
              if (over) {
                const after = t <= split ? 0 : easeOut((t - split) / (1 - split));
                over.setAttribute('x2', (overFrom + (overTo - overFrom) * after).toFixed(2));
              }
            },
          };
        }
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다. 되짚기는
     * `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: GreedyCanFailScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: GreedyCanFailScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const drawn = drawStatic(next);
      if (!opts.animate) return;

      const motion = motionFor(next, drawn);
      if (!motion || motion.duration <= 0) return;

      await animate(motion.duration, my, (t) => motion.apply(t));

      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리와 임시 속성을 거두고 그 장면을 통째로 다시 세운다.
      // 속성을 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도 프레임도 없어
      // 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이 깨어나지
        // 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
