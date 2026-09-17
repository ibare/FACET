/**
 * 연관도 조각의 그림.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사가 "나란히 앉는다" 이고, 논증은 "칸 수는 그대로인데 묶는 법만 바꿨다" 다.
 * 그래서 **칸을 담는 레일은 처음부터 끝까지 폭도 자리도 바뀌지 않는다.** 바뀌는
 * 것은 레일 안을 가르는 칸막이뿐이다 — 1-way 는 칸막이 셋(자리 넷), 2-way 는
 * 칸막이 하나(자리 둘)다. 가운데 칸막이는 두 짜임에서 좌표가 같아 제자리에
 * 그대로 서 있고, 바깥 칸막이 둘만 가운데로 오므라들며 사라진다. 늘린 것이
 * 없다는 말을 글이 아니라 기하가 하게 하려는 것이다.
 *
 * 네 칸은 크기가 변하지 않고, 첫 칸의 왼쪽 끝과 끝 칸의 오른쪽 끝도 고정이다.
 * 짜임이 바뀔 때 칸 사이의 틈만 재분배된다 (둘씩 붙고, 두 자리 사이가 벌어진다).
 *
 * 주소는 위의 접근 띠에서 **아래로 날아 내려와** 칸에 앉는다. 자리가 차 있으면
 * 앉아 있던 것이 아래로 빠지면서 새것이 내려온다 — 서로 반대 방향의 두 움직임이
 * "쫓아낸다" 를 말한다. 2-way 에서는 빠지는 것 없이 옆 칸에 내려앉는다.
 *
 * ── 두 축을 갈라 둔다
 *
 * 한 속성에 두 뜻을 실으면 어느 쪽도 복원되지 않는다. 그래서 가른다.
 *
 *   채움 = 값의 형편    이 칸에 무엇이 앉아 있나 · 이 접근은 히트였나 미스였나
 *   테두리 = 짚음의 표식 이번 걸음에 무엇을 물었나 (띠의 칸 · 캐시의 칸)
 *
 * 밀어냈다는 것은 결과(채움)와 다른 사실이라 도장 **아래의 작은 쐐기**로 따로
 * 적는다. 미스이면서 쫓아낸 접근은 두 표식을 함께 달아 어느 쪽도 지워지지 않는다.
 *
 * ── 잰 값은 재는 자리에 남긴다
 *
 * 히트/미스 도장은 그 접근을 가리키는 띠의 칸 아래에 찍히고 지워지지 않으므로,
 * 두 판이 끝나면 `M M M M M M` 과 `M M H H H H` 가 같은 세로줄에 맞춰 남는다.
 * 줄 끝의 셈(`M 6 · ↓ 5` / `M 2 · ↓ 0`)은 그 도장을 **센 것**이지 따로 받아 온
 * 수가 아니다 (`missesOf` · `evictionsOf`).
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`fill()` · `evict()` · `hit()` · `regroup()`)를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 운동은 출발 자리로
 * **물렸다가** 돌아오는 꼴이 되고, 운동이 끝나면 그 장면을 통째로 다시 세운다 —
 * 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도 다르면 되짚기 판정이
 * 어긋나기 때문이다 (프로토콜 4 절).
 *
 * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). 되짚기는 `animate:false`
 * 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 한다. 전부 rAF
 * 보간이다.
 *
 * 화면의 글자 중 문안은 캡션 한 줄뿐이고 `params.t` 로 만든다. 나머지
 * (`set 0` · `1-way` · `M` · `H` · `↓` · 주소 숫자) 는 도식에 새겨진 표식이라
 * 키를 만들지 않는다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  cellOf,
  evictionsOf,
  missesOf,
  roundComplete,
  seatsAt,
  setsOfRound,
  waysOf,
  type AssociativityReliefScene,
} from './scene.js';
import { setIndexOf } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

// ── 띠와 도장 줄. 왼쪽에 줄 이름, 오른쪽에 셈을 둘 자리를 비워 둔다.
const SIDE = 24;
const LABEL_W = 46;
const TALLY_W = 104;

const TAPE_Y = 14;
const TOKEN_H = 30;
const TOKEN_MAX_W = 64;
const TOKEN_GAP = 12;

const ROW0_Y = 52;
const ROW_H = 22;
const ROW_GAP = 10;
/** 밀어냈다는 쐐기가 도장 아래로 내려오는 높이. */
const EVICT_TICK_H = 5;

// ── 칸과 레일
const CELL_SIDE_MIN = 48;
const RAIL_PAD = 8;
const CELL_MAX_W = 84;
const CELL_H = 52;
/** 자리마다 하나씩 앉을 때 칸 사이의 틈. 전체 폭은 이 값으로 한 번 정해지고 고정된다. */
const GAP_APART = 58;
/** 한 자리에 둘이 앉을 때 그 둘 사이의 틈. */
const GAP_BESIDE = 20;
const RESIDENT_H = 34;
/** 짚음의 표식이 칸 바깥으로 물러나는 만큼. */
const RING_PAD = 5;

const BOARD_GAP = 15;
const SET_LABEL_GAP = 16;
const EXIT_GAP = 16;
const CAPTION_GAP1 = 34;
const CAPTION_GAP2 = 18;
const CANVAS_TAIL = 14;

// ── 걸음 안의 시간
const FLY_MS = 320;
const HIT_MS = 220;
const REGROUP_MS = 460;
/** 두 줄의 셈을 맞대는 화살이 뻗는 시간. */
const DONE_MS = 260;

/** 캔버스가 처음 잡는 세로. 판 수가 정하므로 정적 그리기가 매번 다시 정한다. */
const DEFAULT_H = 284;

type Layout = {
  count: number;
  tokenCount: number;
  cellW: number;
  span: number;
  originX: number;
  residentW: number;
  tokenW: number;
  tapeX: number;
  railY: number;
  railH: number;
  cellY: number;
  setLabelY: number;
  exitY: number;
  captionY1: number;
  captionY2: number;
  tallyX: number;
  height: number;
};

/** 크기는 상수로 상한만 두고 캔버스에서 역산한다 (S-piece). */
function layoutOf(count: number, tokenCount: number, rows: number): Layout {
  const usable = W - CELL_SIDE_MIN * 2 - RAIL_PAD * 2;
  const cellW = Math.min(
    CELL_MAX_W,
    Math.max(24, Math.floor((usable - GAP_APART * (count - 1)) / count)),
  );
  const span = count * cellW + GAP_APART * (count - 1);
  const originX = Math.round((W - span) / 2);
  const residentW = Math.max(24, cellW - 12);

  const bandX = SIDE + LABEL_W;
  const bandW = W - SIDE - TALLY_W - bandX;
  const tokenW =
    tokenCount > 0
      ? Math.min(
          TOKEN_MAX_W,
          Math.max(20, Math.floor((bandW - TOKEN_GAP * (tokenCount - 1)) / tokenCount)),
        )
      : TOKEN_MAX_W;
  const tapeSpan = tokenCount * tokenW + TOKEN_GAP * Math.max(0, tokenCount - 1);
  const tapeX = bandX + Math.round((bandW - tapeSpan) / 2);

  const rowsBottom = ROW0_Y + (rows - 1) * (ROW_H + ROW_GAP) + ROW_H + EVICT_TICK_H;
  const cellY = rowsBottom + BOARD_GAP;
  const railY = cellY - RAIL_PAD;
  const railH = CELL_H + RAIL_PAD * 2;
  const setLabelY = railY + railH + SET_LABEL_GAP;
  const exitY = setLabelY + EXIT_GAP;
  const captionY1 = exitY + CAPTION_GAP1;
  const captionY2 = captionY1 + CAPTION_GAP2;

  return {
    count,
    tokenCount,
    cellW,
    span,
    originX,
    residentW,
    tokenW,
    tapeX,
    railY,
    railH,
    cellY,
    setLabelY,
    exitY,
    captionY1,
    captionY2,
    tallyX: W - SIDE - TALLY_W + 4,
    height: captionY2 + CANVAS_TAIL,
  };
}

/** 자리 사이의 틈. 한 자리 안이 붙는 만큼 자리 사이가 벌어져 전체 폭은 그대로다. */
function seatGap(L: Layout, ways: number): number {
  const sets = Math.max(1, Math.floor(L.count / ways));
  const between = sets - 1;
  if (between <= 0) return 0;
  return (GAP_APART * (L.count - 1) - GAP_BESIDE * (L.count - sets)) / between;
}

function cellX(L: Layout, i: number, ways: number): number {
  const gap = seatGap(L, ways);
  let x = L.originX;
  for (let k = 0; k < i; k += 1) x += L.cellW + ((k + 1) % ways === 0 ? gap : GAP_BESIDE);
  return x;
}

/** 칸 `k` 와 `k+1` 사이를 가르는 칸막이의 자리. */
function dividerX(L: Layout, k: number, ways: number): number {
  return (cellX(L, k, ways) + L.cellW + cellX(L, k + 1, ways)) / 2;
}

/** 자리 이름이 설 자리 — 그 자리가 품은 칸들의 한가운데. */
function setLabelX(L: Layout, s: number, ways: number): number {
  const first = cellX(L, s * ways, ways);
  const last = cellX(L, s * ways + ways - 1, ways) + L.cellW;
  return (first + last) / 2;
}

const tokenX = (L: Layout, i: number): number => L.tapeX + i * (L.tokenW + TOKEN_GAP);
const rowY = (r: number): number => ROW0_Y + r * (ROW_H + ROW_GAP);

/**
 * 캡션을 두 줄까지 접는다.
 *
 * 열 언어를 담으므로 한 줄로 못 박을 수 없다 — 같은 말이 언어마다 길이가 달라
 * 어느 하나에 맞추면 다른 언어에서 넘쳐 잘린다. 세로는 두 줄치를 늘 비워 두므로
 * 접혀도 높이는 바뀌지 않는다 (S-view).
 */
function wrapCaption(text: string, maxWidth: number, fontPx: number): string[] {
  const wide = /[ᄀ-ᇿ⺀-꓏가-퟿豈-﫿︰-﹏＀-￯]/;
  const width = (s: string): number => {
    let units = 0;
    for (const ch of s) units += wide.test(ch) ? 1 : 0.55;
    return units * fontPx;
  };
  if (text === '' || width(text) <= maxWidth) return [text];
  const words = text.split(' ');
  // 띄어쓰기로 끊기지 않는 글은 글자 단위로 끊는다.
  const units = words.length > 1 ? words : [...text];
  const joiner = words.length > 1 ? ' ' : '';
  let first = '';
  let second = '';
  let overflowed = false;
  for (const unit of units) {
    if (!overflowed) {
      const next = first === '' ? unit : first + joiner + unit;
      if (width(next) <= maxWidth) {
        first = next;
        continue;
      }
      overflowed = true;
    }
    second = second === '' ? unit : second + joiner + unit;
  }
  return second === '' ? [first] : [first, second];
}

/** 한 번의 정적 그리기가 내놓는 손잡이들. 운동이 이것을 쥐고 흐른다. */
type Refs = {
  L: Layout;
  cells: SVGElement[];
  dividers: { k: number; el: SVGElement }[];
  setLabels: SVGElement[];
  /** 칸마다 앉아 있는 것. 빈 칸이면 null. */
  residents: (SVGElement | null)[];
  tokens: SVGElement[];
  rowLabels: SVGElement[];
  /** 판마다의 도장. `[판][접근]`. */
  stamps: SVGElement[][];
  bracket: { line: SVGElement; head: SVGElement; x: number; y0: number; y1: number } | null;
  /** 운동 중에만 사는 것들. 정적 그리기가 매번 비운다. */
  transient: SVGElement;
};

export const associativityReliefStageView: CanvasView = {
  canvas: { height: DEFAULT_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안을 만드는 것이 이제 그리는 쪽의 일이다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);

    // ── 시간 ───────────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const now = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 요소를 매번 새로 짓지만 운동이 쥔 것은 **그때의 손잡이**다.
     * 되짚기나 `destroy` 가 가운데 끼어들면 이미 떨어져 나간 노드를 붙들고 있게
     * 되므로, 깨어난 운동은 자기 세대를 확인하고 아니면 손대지 않는다.
     */
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

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    function tween(ms: number, my: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(my) || ms <= 0) {
          resolve();
          return;
        }
        const started = now();
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
          const raw = Math.min(1, (now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
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

    // ── 그리기 도구 ────────────────────────────────────────────────────
    function put(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    const root = put(canvas, 'g', {});

    /** 주소 하나를 담는 딱지. 자리는 `transform` 하나로만 말한다. */
    function chip(
      parent: Element,
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      fill: string,
      stroke: string,
      ink: string,
      fontSize: string,
    ): SVGElement {
      const g = put(parent, 'g', { transform: `translate(${x} ${y})` });
      put(g, 'rect', { x: 0, y: 0, width: w, height: h, rx: 7, fill, stroke, 'stroke-width': 1 });
      put(
        g,
        'text',
        {
          x: w / 2,
          y: h / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSize,
          fill: ink,
        },
        label,
      );
      return g;
    }

    // ── 문안 ──────────────────────────────────────────────────────────
    /**
     * 지금 접근이 무엇을 했는지 말한다.
     *
     * 인자는 payload 가 아니라 **지어진 장면에서** 나온다 — 밀려난 주소도, 그
     * 자리에 이미 몇이 앉아 있었는지도 자취를 접으면 나오므로, 캡션이 말하는 수와
     * 그림이 보이는 것이 같은 출처를 쓴다.
     */
    function accessCaption(scene: AssociativityReliefScene): string {
      const r = scene.rounds.length - 1;
      const round = scene.rounds[r];
      const i = (round?.accesses.length ?? 0) - 1;
      const access = round?.accesses[i];
      const addr = scene.addresses[i];
      if (!access || addr === undefined) return '';

      const ways = waysOf(scene, r);
      const sets = setsOfRound(scene, r);
      const set = setIndexOf(addr, scene.lineBytes, sets);

      if (access.outcome === 'hit') {
        return t('caption.hit', '{addr} is still sitting in set {set}. Nobody pushed it out — hit.', {
          addr,
          set,
        });
      }

      const before = seatsAt(scene, r, i);
      if (access.outcome === 'evict') {
        return t(
          'caption.evict',
          '{addr} wants set {set} too, but every way there is taken. {victim} is pushed out.',
          { addr, set, victim: before[cellOf(set, access.wayIndex, ways)] ?? 0 },
        );
      }

      // 이미 누가 앉아 있는 자리에 곁들어 앉는 것이 이 조각의 결정적 장면이다.
      let occupied = 0;
      for (let w = 0; w < ways; w += 1) {
        if (before[cellOf(set, w, ways)] !== null) occupied += 1;
      }
      return occupied > 0
        ? t('caption.sitTogether', '{addr} wants set {set} too. This seat holds {ways}, so it sits alongside.', {
            addr,
            set,
            ways,
          })
        : t('caption.fillEmpty', '{addr} lands in set {set}. The way is free, so it just moves in.', {
            addr,
            set,
          });
    }

    function captionText(scene: AssociativityReliefScene): string {
      const caption = scene.caption;
      if (!caption) return '';
      switch (caption.kind) {
        case 'access':
          return accessCaption(scene);
        case 'regroup': {
          const r = scene.rounds.length - 1;
          return t(
            'caption.regroup',
            'Still {lines} lines — only the grouping changes: {ways} per seat, {sets} seats.',
            { lines: scene.totalLines, ways: waysOf(scene, r), sets: setsOfRound(scene, r) },
          );
        }
        case 'done': {
          const first = scene.rounds[0];
          const last = scene.rounds[scene.rounds.length - 1];
          return t('caption.done', 'Same {lines} lines, same accesses. Misses: {before} → {after}.', {
            lines: scene.totalLines,
            before: first ? missesOf(first) : 0,
            after: last ? missesOf(last) : 0,
          });
        }
      }
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────
    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않고 늘 통째로 짓는다 —
     * 그래서 되돌릴 명령이 필요 없고, 어느 걸음에서 오든 결과가 같다 (S-scene).
     */
    function drawStatic(scene: AssociativityReliefScene): Refs {
      root.textContent = '';
      const L = layoutOf(
        scene.totalLines,
        scene.addresses.length,
        Math.max(1, scene.waysList.length),
      );
      // `init()` 이 없으므로 캔버스 세로도 매번 여기서 정한다.
      canvas.setAttribute('viewBox', `0 0 ${W} ${L.height}`);

      const r = scene.rounds.length - 1;
      const ways = waysOf(scene, r);
      const sets = setsOfRound(scene, r);
      const round = scene.rounds[r] ?? { accesses: [] };
      /** 이번에 물은 접근. 아직 아무것도 안 물었으면 -1. */
      const probe = round.accesses.length - 1;
      const seats = seatsAt(scene, r, round.accesses.length);

      // ── 레일. 캐시 그 자체이고, 마운트부터 끝까지 폭도 자리도 바뀌지 않는다.
      put(root, 'rect', {
        x: L.originX - RAIL_PAD,
        y: L.railY,
        width: L.span + RAIL_PAD * 2,
        height: L.railH,
        rx: 12,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });

      // ── 칸막이. 지금 짜임이 세우는 것만 짓는다 — 아직 없는 것은 숨기지 않고
      //    짓지 않는다. 끝이 뭉툭해 길이가 0 이어도 점이 남지 않는다.
      const dividers: { k: number; el: SVGElement }[] = [];
      for (let k = 0; k < L.count - 1; k += 1) {
        if ((k + 1) % ways !== 0) continue;
        const x = dividerX(L, k, ways);
        dividers.push({
          k,
          el: put(root, 'line', {
            x1: x,
            y1: L.railY + 6,
            x2: x,
            y2: L.railY + L.railH - 6,
            stroke: c.border,
            'stroke-width': 2,
          }),
        });
      }

      // ── 칸. 크기가 변하지 않는다. 짜임이 바뀌면 자리만 옮긴다. 테두리는
      //    칸이 있다는 것만 말하고 형편은 지지 않는다.
      const cells: SVGElement[] = [];
      for (let i = 0; i < L.count; i += 1) {
        cells.push(
          put(root, 'rect', {
            x: cellX(L, i, ways),
            y: L.cellY,
            width: L.cellW,
            height: CELL_H,
            rx: 8,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '4 4',
          }),
        );
      }

      // ── 자리 이름. 지금 짜임이 세우는 자리만.
      const setLabels: SVGElement[] = [];
      for (let s = 0; s < sets; s += 1) {
        setLabels.push(
          put(
            root,
            'text',
            {
              x: setLabelX(L, s, ways),
              y: L.setLabelY,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            // 도식에 새겨진 표식이라 키를 만들지 않는다 (C10).
            `set ${s}`,
          ),
        );
      }

      // ── 앉아 있는 것. **채움이 "이 칸에 무엇이 들어 있나" 를 말한다.**
      const residents: (SVGElement | null)[] = [];
      for (let i = 0; i < L.count; i += 1) {
        const addr = seats[i];
        if (addr === null || addr === undefined) {
          residents.push(null);
          continue;
        }
        residents.push(
          chip(
            root,
            cellX(L, i, ways) + (L.cellW - L.residentW) / 2,
            L.cellY + (CELL_H - RESIDENT_H) / 2,
            L.residentW,
            RESIDENT_H,
            String(addr),
            c.itemDefault,
            c.border,
            c.text,
            fontSizes.sm,
          ),
        );
      }

      // ── 이번에 물은 칸. **테두리가 짚음의 표식을 진다** — 채움과 부딪히지
      //    않도록 칸 바깥에 따로 선다. 맺음 걸음에서는 묻고 있는 것이 없다.
      if (probe >= 0 && !scene.settled) {
        const access = round.accesses[probe]!;
        const addr = scene.addresses[probe];
        if (addr !== undefined) {
          const ci = cellOf(setIndexOf(addr, scene.lineBytes, sets), access.wayIndex, ways);
          put(root, 'rect', {
            x: cellX(L, ci, ways) - RING_PAD,
            y: L.cellY - RING_PAD,
            width: L.cellW + RING_PAD * 2,
            height: CELL_H + RING_PAD * 2,
            rx: 12,
            fill: 'none',
            stroke: c.itemActive,
            'stroke-width': 2,
          });
        }
      }

      // ── 접근 띠. 채움은 값(중립)이고 테두리가 "이번에 물은 것" 을 진다.
      const tokens: SVGElement[] = [];
      for (let i = 0; i < L.tokenCount; i += 1) {
        const probed = i === probe && !scene.settled;
        const g = put(root, 'g', { transform: `translate(${tokenX(L, i)} ${TAPE_Y})` });
        put(g, 'rect', {
          x: 0,
          y: 0,
          width: L.tokenW,
          height: TOKEN_H,
          rx: 7,
          fill: c.itemDefault,
          stroke: probed ? c.itemActive : c.border,
          'stroke-width': probed ? 2 : 1,
        });
        put(
          g,
          'text',
          {
            x: L.tokenW / 2,
            y: TOKEN_H / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
          },
          String(scene.addresses[i] ?? ''),
        );
        tokens.push(g);
      }

      // ── 도장 줄. 판마다 하나씩, 지나간 판의 줄이 그대로 남아 견줄 짝이 된다.
      const rowLabels: SVGElement[] = [];
      const stamps: SVGElement[][] = [];
      for (let rr = 0; rr < scene.rounds.length; rr += 1) {
        const y = rowY(rr);
        rowLabels.push(
          put(
            root,
            'text',
            {
              x: L.tapeX - 12,
              y: y + ROW_H / 2,
              'text-anchor': 'end',
              'dominant-baseline': 'central',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            `${waysOf(scene, rr)}-way`,
          ),
        );

        const row: SVGElement[] = [];
        const accesses = scene.rounds[rr]?.accesses ?? [];
        for (let i = 0; i < accesses.length; i += 1) {
          const hit = accesses[i]!.outcome === 'hit';
          const g = put(root, 'g', {});
          put(g, 'rect', {
            x: tokenX(L, i),
            y,
            width: L.tokenW,
            height: ROW_H,
            rx: 5,
            fill: hit ? c.accent : c.danger,
            stroke: hit ? c.accent : c.danger,
            'stroke-width': 1,
          });
          put(
            g,
            'text',
            {
              x: tokenX(L, i) + L.tokenW / 2,
              y: y + ROW_H / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.stateInk,
            },
            // 표식이라 키를 만들지 않는다 (C10).
            hit ? 'H' : 'M',
          );
          // 밀어냈다는 것은 결과와 다른 사실이라 다른 축에 적는다 — 도장 아래로
          // 내려가는 작은 쐐기다. 밀려난 것이 아래로 빠지는 운동과 같은 어휘다.
          if (accesses[i]!.outcome === 'evict') {
            const cx = tokenX(L, i) + L.tokenW / 2;
            put(g, 'polygon', {
              points: `${cx - 4},${y + ROW_H} ${cx + 4},${y + ROW_H} ${cx},${y + ROW_H + EVICT_TICK_H}`,
              fill: c.itemSwapping,
            });
          }
          row.push(g);
        }
        stamps.push(row);
      }

      // ── 다 굴린 줄에는 셈이 선다. 도장과 **같은 자취**를 센 것이다.
      for (let rr = 0; rr < scene.rounds.length; rr += 1) {
        const round_ = scene.rounds[rr];
        if (!round_ || !roundComplete(scene, rr)) continue;
        const y = rowY(rr) + ROW_H / 2;
        put(
          root,
          'text',
          {
            x: L.tallyX,
            y,
            'text-anchor': 'start',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.danger,
          },
          `M ${missesOf(round_)}`,
        );
        put(
          root,
          'text',
          {
            x: L.tallyX + 46,
            y,
            'text-anchor': 'start',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.itemSwapping,
          },
          `↓ ${evictionsOf(round_)}`,
        );
      }

      // ── 두 판을 맞대는 화살. 마지막 걸음이 세우고 그대로 남는다.
      let bracket: Refs['bracket'] = null;
      if (scene.settled && scene.rounds.length >= 2) {
        const x = L.tallyX + 92;
        const y0 = rowY(0) + ROW_H / 2;
        const y1 = rowY(scene.rounds.length - 1) + ROW_H / 2;
        const line = put(root, 'line', {
          x1: x,
          y1: y0,
          x2: x,
          y2: y1,
          stroke: c.accent,
          'stroke-width': 2,
        });
        const head = put(root, 'polygon', {
          points: `${x - 4},${y1 - 7} ${x + 4},${y1 - 7} ${x},${y1}`,
          fill: c.accent,
        });
        bracket = { line, head, x, y0, y1 };
      }

      // ── 캡션.
      const lines = wrapCaption(captionText(scene), W - 48, 14);
      for (const [i, y] of [L.captionY1, L.captionY2].entries()) {
        put(
          root,
          'text',
          {
            x: W / 2,
            y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.text,
          },
          lines[i] ?? '',
        );
      }

      // 운동 중에만 사는 것들은 맨 위에 둔다.
      const transient = put(root, 'g', {});

      return {
        L,
        cells,
        dividers,
        setLabels,
        residents,
        tokens,
        rowLabels,
        stamps,
        bracket,
        transient,
      };
    }

    // ── 운동 ──────────────────────────────────────────────────────────
    /**
     * 접근 하나. 띠에서 딱지가 날아 내려와 칸에 앉는다.
     *
     * 자리가 차 있으면 앉아 있던 것이 **아래로 빠지는 동시에** 새것이 내려온다.
     * 서로 반대 방향의 두 움직임이 한 뜻("쫓아낸다")이라 시계를 하나만 둔다 —
     * 나누면 나란함이 우연히 맞는 꼴이 되고 하나를 `void` 로 던질 여지가 생긴다.
     *
     * 출발 자리도 밀려나는 것도 전부 장면에서 셈으로 나오므로 `prev` 를 보지 않는다.
     */
    async function flowAccess(
      scene: AssociativityReliefScene,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.L;
      const r = scene.rounds.length - 1;
      const round = scene.rounds[r];
      const i = (round?.accesses.length ?? 0) - 1;
      const access = round?.accesses[i];
      const addr = scene.addresses[i];
      if (!access || addr === undefined) return;

      const ways = waysOf(scene, r);
      const sets = setsOfRound(scene, r);
      const ci = cellOf(setIndexOf(addr, scene.lineBytes, sets), access.wayIndex, ways);

      const fromX = tokenX(L, i) + L.tokenW / 2 - L.residentW / 2;
      const fromY = TAPE_Y + (TOKEN_H - RESIDENT_H) / 2;
      const toX = cellX(L, ci, ways) + (L.cellW - L.residentW) / 2;
      const toY = L.cellY + (CELL_H - RESIDENT_H) / 2;

      // 날아 내려오는 것. 정적 그림에는 없으니 임시 레이어에서만 산다.
      const flyer = chip(
        refs.transient,
        fromX,
        fromY,
        L.residentW,
        RESIDENT_H,
        String(addr),
        c.itemActive,
        c.itemActive,
        c.stateInk,
        fontSizes.sm,
      );

      // 밀려나는 것. 그 칸에 앉아 있던 주소를 자취에서 꺼낸다.
      const victim = access.outcome === 'evict' ? (seatsAt(scene, r, i)[ci] ?? null) : null;
      const leaving =
        victim === null
          ? null
          : chip(
              refs.transient,
              toX,
              toY,
              L.residentW,
              RESIDENT_H,
              String(victim),
              c.itemSwapping,
              c.itemSwapping,
              c.stateInk,
              fontSizes.sm,
            );

      const hit = access.outcome === 'hit';
      const landed = refs.residents[ci] ?? null;
      const stamp = refs.stamps[r]?.[i] ?? null;

      await tween(FLY_MS, my, (e) => {
        const arrived = e >= 1;
        flyer.setAttribute('transform', `translate(${lerp(fromX, toX, e)} ${lerp(fromY, toY, e)})`);
        if (leaving) {
          leaving.setAttribute('transform', `translate(${toX} ${lerp(toY, L.exitY, e)})`);
          leaving.setAttribute('opacity', String(1 - e));
        }
        if (!hit) {
          // 내려앉는 순간 날아온 것이 앉은 것으로 바뀐다.
          flyer.setAttribute('opacity', arrived ? '0' : '1');
          landed?.setAttribute('opacity', arrived ? '1' : '0');
        }
        stamp?.setAttribute('opacity', String(Math.min(1, Math.max(0, e * 4 - 3))));
      });

      if (!alive(my) || !hit) return;

      // 히트는 이미 앉아 있던 것을 확인하는 일이라 **부풀었다 돌아오는** 꼴이
      // 맞다. 새로 나타나는 것이 아니므로 앉는 꼴로 그리면 거짓이 된다.
      await tween(HIT_MS, my, (e) => {
        const s = 1 + 0.14 * Math.sin(Math.PI * e);
        const cx = toX + L.residentW / 2;
        const cy = toY + RESIDENT_H / 2;
        landed?.setAttribute(
          'transform',
          `translate(${cx} ${cy}) scale(${s}) translate(${-L.residentW / 2} ${-RESIDENT_H / 2})`,
        );
        flyer.setAttribute('opacity', String(1 - e));
      });
    }

    /**
     * 짜임을 다시 긋는다.
     *
     * 칸이 둘씩 붙고, 자리 사이가 그만큼 벌어지고, 바깥 칸막이 둘이 가운데로
     * 오므라들어 사라진다. 앉아 있던 것들은 판이 바뀌었으니 자리를 뜬다 — 밀려남과
     * 같은 어휘(아래로)다. 전부 한 뜻의 한 사건이라 시계가 하나다.
     *
     * 앞 짜임의 자리도 앞 판에 앉아 있던 것도 자취에서 셈으로 나오므로 `prev` 를
     * 보지 않는다.
     */
    function flowRegroup(
      scene: AssociativityReliefScene,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.L;
      const r = scene.rounds.length - 1;
      if (r < 1) return Promise.resolve();
      const oldWays = waysOf(scene, r - 1);
      const newWays = waysOf(scene, r);
      const oldSets = setsOfRound(scene, r - 1);
      const newSets = setsOfRound(scene, r);

      const cellMoves = refs.cells.map((el, i) => ({
        el,
        from: cellX(L, i, oldWays),
        to: cellX(L, i, newWays),
      }));

      // 칸막이 — 서 있을 것과 사라질 것을 한 목록에 모은다. 사라지는 것은 정적
      // 그림에 없으므로 임시 레이어에 짓는다.
      const barTop = L.railY + 6;
      const barBottom = L.railY + L.railH - 6;
      const barMid = (barTop + barBottom) / 2;
      const fullLen = barBottom - barTop;
      const bars: { el: SVGElement; fromX: number; toX: number; fromLen: number; toLen: number }[] =
        [];
      for (const d of refs.dividers) {
        bars.push({
          el: d.el,
          fromX: dividerX(L, d.k, oldWays),
          toX: dividerX(L, d.k, newWays),
          fromLen: (d.k + 1) % oldWays === 0 ? fullLen : 0,
          toLen: fullLen,
        });
      }
      for (let k = 0; k < L.count - 1; k += 1) {
        if ((k + 1) % oldWays !== 0) continue;
        if ((k + 1) % newWays === 0) continue;
        bars.push({
          el: put(refs.transient, 'line', {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0,
            stroke: c.border,
            'stroke-width': 2,
          }),
          fromX: dividerX(L, k, oldWays),
          toX: dividerX(L, k, newWays),
          fromLen: fullLen,
          toLen: 0,
        });
      }

      // 자리 이름 — 남는 것은 옮겨 앉고, 없어지는 것은 제자리에서 물러난다.
      const labelMoves: {
        el: SVGElement;
        from: number;
        to: number;
        fromOp: number;
        toOp: number;
      }[] = [];
      for (let s = 0; s < newSets; s += 1) {
        const el = refs.setLabels[s];
        if (!el) continue;
        const to = setLabelX(L, s, newWays);
        labelMoves.push({
          el,
          from: s < oldSets ? setLabelX(L, s, oldWays) : to,
          to,
          fromOp: s < oldSets ? 1 : 0,
          toOp: 1,
        });
      }
      for (let s = newSets; s < oldSets; s += 1) {
        const x = setLabelX(L, s, oldWays);
        labelMoves.push({
          el: put(
            refs.transient,
            'text',
            {
              x,
              y: L.setLabelY,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            `set ${s}`,
          ),
          from: x,
          to: x,
          fromOp: 1,
          toOp: 0,
        });
      }

      // 앞 판에 앉아 있던 것들 — 새 판이므로 자리를 뜬다.
      const before = seatsAt(scene, r - 1, scene.addresses.length);
      const leavers: { el: SVGElement; x: number; y: number }[] = [];
      for (let i = 0; i < L.count; i += 1) {
        const addr = before[i];
        if (addr === null || addr === undefined) continue;
        const x = cellX(L, i, oldWays) + (L.cellW - L.residentW) / 2;
        const y = L.cellY + (CELL_H - RESIDENT_H) / 2;
        leavers.push({
          el: chip(
            refs.transient,
            x,
            y,
            L.residentW,
            RESIDENT_H,
            String(addr),
            c.itemDefault,
            c.border,
            c.text,
            fontSizes.sm,
          ),
          x,
          y,
        });
      }

      const newRowLabel = refs.rowLabels[r] ?? null;

      return tween(REGROUP_MS, my, (e) => {
        for (const m of cellMoves) m.el.setAttribute('x', String(lerp(m.from, m.to, e)));
        for (const b of bars) {
          const x = lerp(b.fromX, b.toX, e);
          const half = lerp(b.fromLen, b.toLen, e) / 2;
          b.el.setAttribute('x1', String(x));
          b.el.setAttribute('x2', String(x));
          b.el.setAttribute('y1', String(barMid - half));
          b.el.setAttribute('y2', String(barMid + half));
        }
        for (const m of labelMoves) {
          m.el.setAttribute('x', String(lerp(m.from, m.to, e)));
          m.el.setAttribute('opacity', String(lerp(m.fromOp, m.toOp, e)));
        }
        for (const l of leavers) {
          l.el.setAttribute('transform', `translate(${l.x} ${lerp(l.y, L.exitY, e)})`);
          l.el.setAttribute('opacity', String(1 - e));
        }
        newRowLabel?.setAttribute('opacity', String(e));
      });
    }

    /**
     * 두 판을 맞댄다 — 화살이 위 줄의 셈에서 아래 줄의 셈으로 **뻗어 내려간다.**
     *
     * 이 걸음은 흐를 것이 없어 벽시계가 `stepMs` 뿐이었다. 걸음이 하는 말이
     * "여섯에서 둘로 줄었다" 이므로 운동도 아래로 뻗는 꼴로 고른다.
     */
    function flowDone(refs: Refs, my: number): Promise<void> {
      const b = refs.bracket;
      if (!b) return Promise.resolve();
      return tween(DONE_MS, my, (e) => {
        const y = lerp(b.y0, b.y1, e);
        b.line.setAttribute('y2', String(y));
        b.head.setAttribute('points', `${b.x - 4},${y - 7} ${b.x + 4},${y - 7} ${b.x},${y}`);
      });
    }

    async function render(
      next: AssociativityReliefScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: AssociativityReliefScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다.
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'access':
          await flowAccess(next, refs, my);
          break;
        case 'regroup':
          await flowRegroup(next, refs, my);
          break;
        case 'done':
          await flowDone(refs, my);
          break;
      }

      // 옛 세대면 화면에 손대지 않고 물러난다.
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
        canvas.textContent = '';
      },
    };
  },
};
