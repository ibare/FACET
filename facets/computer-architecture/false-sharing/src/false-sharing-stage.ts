/**
 * false-sharing stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 무엇이 어디에 있는가
 *
 *   선반 A          코어 A 가 쥔 줄이 올라앉는 자리
 *   메모리 띠       배열의 칸들. 넷씩 울타리로 묶여 한 줄이 된다
 *   선반 B          코어 B 가 쥔 줄이 내려앉는 자리
 *   견줌 띠         배치마다 한 줄. 쓰기 하나가 눈금 하나다
 *
 * 줄(사본)은 **덩어리**다. 코어가 제 칸 하나를 고치려면 그 덩어리를 통째로
 * 끌어와야 하고, 그러면 상대 선반에는 빈 자국만 남는다. 두 코어가 같은 줄을
 * 노리면 덩어리가 위아래로 일곱 번 끌려다니고, 줄이 갈리면 각자 제자리에
 * 가만히 앉아 있다. 움직이는 것은 덩어리이고, 안 움직이는 것이 곧 답이다.
 *
 * 코어가 노리는 칸은 선반에서 내려오는 **가는 선**으로 가리킨다. 두 선은 결코
 * 같은 칸에 닿지 않는다 — 값은 겹치지 않는데 울타리만 같다는 것이 이 조각의
 * 주장이고, 그것이 화면에서 보여야 한다.
 *
 * ── 이행이 고친 것 ①: 앞 배치의 셈이 지워지고 있었다
 *
 * 이 조각의 주장은 **두 배치를 견주는 것**이다 — "달라진 것은 두 값이 같은 줄에
 * 앉았느냐뿐". 그런데 옛 `arrange` 는 `clearMarks()` 로 앞 배치의 무효화 배지를
 * 통째로 지웠다. 벌려 놓은 배치가 끝난 완주 화면에는 **0 만 남고 7 이 없어**
 * 견줄 짝이 사라졌다. 결론은 캡션 한 줄로만 남았다.
 *
 * 지금은 배치마다 **견줌 띠**에 한 줄이 남는다. 줄의 눈금 하나가 쓰기 하나이고,
 * 상대의 사본을 무르게 한 쓰기만 테두리를 두른다. 다 끝난 화면에 일곱 두른 줄과
 * 하나도 두르지 않은 줄이 나란히 선다.
 *
 * ── 이행이 고친 것 ②: "한 울타리에 둘이 들어 있다" 가 그림에 없었다
 *
 * 줄 울타리는 늘 같은 테두리였고, 두 칸이 한 줄에 앉았다는 사실은 캡션 문장에만
 * 있었다. 지금은 두 코어의 칸을 함께 품은 울타리만 테두리가 굵고 붉다.
 *
 * **채움은 값의 형편, 테두리는 겹침·짚음의 표식**으로 갈라 둔다. 그래서 한 칸이
 * 세 가지를 한꺼번에 말해도 서로 부딪히지 않는다.
 *
 *   채움  — 그 칸이 누구의 것인가 (코어 A 색 / 코어 B 색 / 빈 칸)
 *   테두리 — 이 울타리를 둘이 나눠 쓰나 (줄), 이 사본이 빼앗겼나 (빈 자국)
 *   운동  — 지금 누가 쓰고 있나 (덩어리가 끌려오고 값이 튀어 오른다)
 *
 * ── 화면에 뜨는 수는 모두 자취에서 나온다
 *
 * 고친 횟수도 무효화 수도 칸에 담긴 값도 전부 `pictureOf` 가 쓰기 목록에서 낸다.
 * 캡션의 `{writes}` 와 눈금의 개수가 **같은 목록**이라 갈릴 자리가 없다. 옛
 * payload 의 `writes` · `invalidations` · `round` · `indices` · `values` ·
 * `sameLine` · `sharedCount` 는 장면이 이미 버렸으므로 여기 올 길이 없다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 덩어리는 이미 제 선반에 앉아 있고, 운동은 **아직 못 온
 * 만큼을 뒤로 물리는** 꼴이다. 한 바퀴 안에서 코어 둘은 차례로 움직이므로(그것이
 * 이 조각의 박자다) 하나씩 기다린다. 다만 **한 뜻으로 묶인 운동은 시계를 나누지
 * 않는다** — 덩어리가 끌려오는 것과 무효화 셈이 오르는 것은 한 사건이라 한
 * `tween` 이 둘을 함께 그린다. 운동이 끝나면 장면을 통째로 다시 세워 보간이 남긴
 * 좌표 끝자리와 `opacity` 를 노드째 지운다 (S-scene).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * `A` · `B` · `core A` · `RAM` · `a[0]` 은 도형에 새긴 표식이라 번역하지 않는다.
 * 문장인 캡션과 이름표는 `params.t` 로 만든다 (C10).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { falseSharingLine } from './algorithm.js';
import {
  currentRun,
  indexOf,
  pictureOf,
  sameLineOf,
  sharedCountOf,
  valueAt,
  type CoreMark,
  type FalseSharingCaption,
  type FalseSharingScene,
  type Picture,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const CANVAS_H = 360;

/** 왼쪽은 선반 이름이 서는 자리, 오른쪽은 숨 쉴 여백. */
const SIDE_L = 92;
const SIDE_R = 12;
const BLOCK_GAP = 24;
/** 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). */
const CELL_MAX_W = 74;

const SHELF_A_Y = 14;
const SHELF_H = 48;
const SHELF_B_Y = 190;
const LINE_LABEL_Y = 86;
const STRIP_Y = 94;
const CELL_H = 56;
const BADGE_Y = 170;
const SLAB_H = 42;

const SLAB_HOME_Y = STRIP_Y + (CELL_H - SLAB_H) / 2;
const SHELF_A_SLAB_Y = SHELF_A_Y + (SHELF_H - SLAB_H) / 2;
const SHELF_B_SLAB_Y = SHELF_B_Y + (SHELF_H - SLAB_H) / 2;
const DY_A = SHELF_A_SLAB_Y - SLAB_HOME_Y;
const DY_B = SHELF_B_SLAB_Y - SLAB_HOME_Y;

/** 견줌 띠 — 배치마다 한 줄. */
const LEDGER_Y = 262;
const LEDGER_STEP = 24;
const LEDGER_FENCE_W = 20;
const LEDGER_FENCE_H = 14;
const LEDGER_FENCE_GAP = 4;
const LEDGER_TICK_W = 7;
const LEDGER_TICK_H = 13;
const LEDGER_TICK_GAP = 3;
const LEDGER_TICK_PAD = 12;

const CAPTION_Y = 314;
const CAPTION_STEP = 19;
const CAPTION_MAX_LINES = 3;
const CAPTION_PAD = 24;

const FETCH_MS = 320;
const MOVE_MS = 300;
const HOLD_MS = 90;
const RISE_MS = 150;
const RETURN_MS = 260;
const SLIDE_MS = 320;
const GROW_MS = 220;
const NUDGE_MS = 200;
/** 두 줄을 견주는 걸음. 이미 서 있는 수를 부풀렸다 돌린다. */
const WEIGH_MS = 240;

/** 코어 이름은 도형에 새긴 표식이라 번역하지 않는다 (C10). */
const CORE_A_MARK = 'core A';
const CORE_B_MARK = 'core B';
const MEMORY_MARK = 'RAM';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 한글·한자·가나는 라틴 글자의 두 배 폭으로 센다. 줄을 접을 자리를 고르는 자다. */
function widthUnits(text: string): number {
  let n = 0;
  for (const ch of text) {
    n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch) ? 2 : 1;
  }
  return n;
}

function wrapCaption(text: string, maxUnits: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const flush = (): void => {
    if (cur !== '') lines.push(cur);
    cur = '';
  };
  for (const word of text.split(' ')) {
    let rest = word;
    // 띄어쓰기가 없는 글은 낱말 하나가 한 줄을 넘는다. 글자로 끊는다.
    while (widthUnits(rest) > maxUnits) {
      let take = '';
      for (const ch of rest) {
        if (widthUnits(take + ch) > maxUnits) break;
        take += ch;
      }
      if (take === '') break;
      flush();
      lines.push(take);
      rest = rest.slice(take.length);
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
    const next = cur === '' ? rest : `${cur} ${rest}`;
    if (widthUnits(next) > maxUnits) {
      flush();
      cur = rest;
    } else {
      cur = next;
    }
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }
  flush();
  return lines.slice(0, maxLines);
}

/**
 * 자리 셈. **먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 이웃의 지금 좌표를
 * 재면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
 */
type Geom = {
  elemsPerLine: number;
  lineCount: number;
  cellCount: number;
  cellW: number;
  blockW: number;
  stripW: number;
  originX: number;
};

/** 그린 화면의 손잡이. 운동이 만질 것만 내준다. */
type SlabNodes = { g: SVGGElement; values: SVGTextElement[] };
type LedgerRow = { count: SVGTextElement };
type Drawn = {
  geom: Geom;
  cellValues: SVGTextElement[];
  slabs: Map<number, SlabNodes>;
  ghosts: Map<number, SVGRectElement>;
  badges: Map<number, SVGTextElement>;
  connA: SVGLineElement | null;
  connB: SVGLineElement | null;
  ledger: LedgerRow[];
};

/** 무엇을 어디까지 그릴지. 운동이 한 바퀴의 가운데 화면을 세울 때 쓴다. */
type Cut = {
  /** 이 배치까지만 그린다 (0 부터). 생략하면 전부. */
  upToRun?: number;
  /** 마지막 배치를 이 쓰기 수까지만 반영한다. 생략하면 전부. */
  cutWrites?: number;
};

export const falseSharingStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<FalseSharingScene> {
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    /*
     * 색판의 씨앗은 **코어의 수**다. "지금까지 드러난 수" 로 씨를 뿌리면 hue 간격이
     * 통째로 갈려 이미 칠한 것의 색이 바뀐다 (프로토콜 4 절). 코어는 늘 둘이다.
     */
    const hues = categorical(2, 'vivid');
    const COLOR_A = hues[0] ?? c.itemActive;
    const COLOR_B = hues[1] ?? c.itemPivot;
    const coreColor = (core: CoreMark): string => (core === 'A' ? COLOR_A : COLOR_B);
    const coreDy = (core: CoreMark): number => (core === 'A' ? DY_A : DY_B);
    const shelfSlabY = (core: CoreMark): number => (core === 'A' ? SHELF_A_SLAB_Y : SHELF_B_SLAB_Y);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    type Handle = { id: unknown; raf: boolean };
    const pending = new Set<Handle>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 한 바퀴가 프레임을 여러 번 지나고 그 사이에 `destroy` 가 올 수 있다. 마디마다
     * 자기 번호가 아직 유효한지 보고 아니면 화면에 손대지 않고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /*
     * 프레임이 없는 자리(헤드리스)에서는 타이머로 돈다. 운동이 아예 안 돌면 "흘려
     * 세운 화면" 과 "곧바로 세운 화면" 이 같아지는 것이 당연해져 검사가 이빨을
     * 잃는다 (프로토콜 5 절).
     */
    const rafOk = typeof requestAnimationFrame === 'function';

    function schedule(fn: () => void, ms: number): Handle {
      const handle: Handle = { id: 0, raf: rafOk && ms <= 0 };
      const run = (): void => {
        pending.delete(handle);
        fn();
      };
      handle.id = handle.raf ? requestAnimationFrame(run) : setTimeout(run, ms <= 0 ? 16 : ms);
      pending.add(handle);
      return handle;
    }

    function cancelPending(): void {
      for (const handle of pending) {
        if (handle.raf) cancelAnimationFrame(handle.id as number);
        else clearTimeout(handle.id as ReturnType<typeof setTimeout>);
      }
      pending.clear();
    }

    function wait(ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        schedule(finish, ms);
      });
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = ms <= 0 ? 1 : Math.min(1, (now() - started) / ms);
          draw(ease(p));
          if (p >= 1) return finish();
          schedule(tick, 0);
        };
        tick();
      });
    }

    // ── 껍데기. 러너가 붙여 준 캔버스를 비우지 않는다 (S-view).
    const root = el('g', {});
    const gShelf = el('g', {});
    const gStrip = el('g', {});
    const gConn = el('g', {});
    const gGhost = el('g', {});
    const gBadge = el('g', {});
    const gSlab = el('g', {});
    const gLedger = el('g', {});
    const gCaption = el('g', {});
    const layers = [gShelf, gStrip, gConn, gGhost, gBadge, gSlab, gLedger, gCaption];
    for (const layer of layers) root.appendChild(layer);
    svg.appendChild(root);

    function textNode(
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; anchor?: string; weight?: number; family?: string },
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        fill: opts.fill,
        'font-size': opts.size,
        'font-family': opts.family ?? fonts.body,
        'font-weight': opts.weight ?? 400,
        'text-anchor': opts.anchor ?? 'start',
      });
      node.textContent = content;
      return node;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function geomOf(scene: FalseSharingScene): Geom {
      const elemsPerLine =
        scene.elemBytes > 0 ? Math.max(1, Math.floor(scene.lineBytes / scene.elemBytes)) : 1;
      const lineCount = falseSharingLine(scene.spanIndex, scene.lineBytes, scene.elemBytes) + 1;
      const cellCount = lineCount * elemsPerLine;
      const avail = W - SIDE_L - SIDE_R - BLOCK_GAP * (lineCount - 1);
      const cellW = Math.min(CELL_MAX_W, Math.floor(avail / Math.max(1, cellCount)));
      const blockW = cellW * elemsPerLine;
      const stripW = blockW * lineCount + BLOCK_GAP * (lineCount - 1);
      const originX = SIDE_L + Math.round((W - SIDE_L - SIDE_R - stripW) / 2);
      return { elemsPerLine, lineCount, cellCount, cellW, blockW, stripW, originX };
    }

    const blockX = (g: Geom, line: number): number => g.originX + line * (g.blockW + BLOCK_GAP);
    const columnOf = (g: Geom, index: number, line: number): number => index - line * g.elemsPerLine;
    const cellX = (g: Geom, scene: FalseSharingScene, index: number): number => {
      const line = falseSharingLine(index, scene.lineBytes, scene.elemBytes);
      return blockX(g, line) + columnOf(g, index, line) * g.cellW;
    };
    const cellMid = (g: Geom, scene: FalseSharingScene, index: number): number =>
      cellX(g, scene, index) + g.cellW / 2;

    const CONN_A_FROM = SHELF_A_Y + SHELF_H;
    const CONN_A_TO = STRIP_Y;
    const CONN_B_FROM = STRIP_Y + CELL_H;
    const CONN_B_TO = SHELF_B_Y;

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 문장. **en 원본은 호출부에 리터럴로 둔다** — 추출기가 리터럴만
     * 알아보고, `facet.ts` 의 선언이 정본이다 (C10).
     *
     * 인자는 전부 자취에서 낸다. 캡션이 제 수를 따로 들고 있으면 화면과 갈린다.
     */
    function captionText(scene: FalseSharingScene, caption: FalseSharingCaption): string {
      const run = currentRun(scene);
      if (run === null) return '';
      const pic = pictureOf(run, scene.lineBytes, scene.elemBytes);
      switch (caption.kind) {
        case 'together':
          return t(
            'caption.together',
            'Core A writes a[{a}], core B writes a[{b}] — two different cells, and one line holds them both: {line}.',
            {
              a: run.aIndex,
              b: run.bIndex,
              line: falseSharingLine(run.aIndex, scene.lineBytes, scene.elemBytes),
            },
          );
        case 'apart':
          return t(
            'caption.apart',
            'Give core B a line of its own — a[{b}]. Its address: {addr}. That puts it on another line: {line}.',
            {
              b: run.bIndex,
              addr: run.bIndex * scene.elemBytes,
              line: falseSharingLine(run.bIndex, scene.lineBytes, scene.elemBytes),
            },
          );
        case 'collide':
          return t(
            'caption.collide',
            'A drags the line over to change a[{a}]; B drags it back for a[{b}]. Writes: {writes}. Invalidations: {inval}.',
            { a: run.aIndex, b: run.bIndex, writes: pic.writes, inval: pic.invalidations },
          );
        case 'quiet':
          return t(
            'caption.quiet',
            'Each core holds a line of its own, and nothing is dragged away. Writes: {writes}.',
            { writes: pic.writes },
          );
        case 'tally':
          return t('caption.tally', 'Writes: {writes}. Invalidations: {inval}. Values both cores use: {shared}.', {
            writes: pic.writes,
            inval: pic.invalidations,
            shared: sharedCountOf(run),
          });
        case 'tallyApart':
          return t('caption.tallyApart', 'The same count of writes: {writes}. Invalidations: {inval}.', {
            writes: pic.writes,
            inval: pic.invalidations,
          });
        case 'done':
          return t(
            'caption.done',
            'One thing changed — whether the two values sit on the same line. Values they truly share: {shared}.',
            { shared: sharedCountOf(run) },
          );
      }
    }

    const capUnits = Math.floor((W - CAPTION_PAD * 2) / (parseFloat(fontSizes.md) * 0.55));

    function drawCaption(text: string): void {
      const rows = wrapCaption(text, capUnits, CAPTION_MAX_LINES);
      for (let i = 0; i < rows.length; i += 1) {
        const line = rows[i];
        if (line === undefined || line === '') continue;
        gCaption.appendChild(
          textNode(W / 2, CAPTION_Y + i * CAPTION_STEP, line, {
            size: fontSizes.md,
            fill: c.text,
            anchor: 'middle',
          }),
        );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 두 번 그려도 사이에 타이머도 프레임도 없어 깜빡이지 않는다. 운동이 남긴
     * 속성과 보간 끝자리는 노드째 사라진다 (S-scene).
     */
    function drawStatic(scene: FalseSharingScene, cut: Cut = {}): Drawn {
      rewind();
      const g = geomOf(scene);
      const drawn: Drawn = {
        geom: g,
        cellValues: [],
        slabs: new Map(),
        ghosts: new Map(),
        badges: new Map(),
        connA: null,
        connB: null,
        ledger: [],
      };

      const runs =
        cut.upToRun === undefined ? scene.runs : scene.runs.slice(0, Math.max(0, cut.upToRun + 1));
      const last = runs.length - 1;
      const pics: Picture[] = runs.map((r, i) =>
        pictureOf(r, scene.lineBytes, scene.elemBytes, i === last ? cut.cutWrites : undefined),
      );
      const run = runs[last] ?? null;
      const pic = pics[last] ?? null;

      // ── 선반 둘과 이름.
      for (const shelf of [SHELF_A_Y, SHELF_B_Y]) {
        gShelf.appendChild(
          el('rect', {
            x: g.originX - 10,
            y: shelf,
            width: g.stripW + 20,
            height: SHELF_H,
            rx: 8,
            fill: c.bgSubtle,
            stroke: c.border,
          }),
        );
      }
      const nameX = g.originX - 20;
      gShelf.appendChild(
        textNode(nameX, SHELF_A_Y + SHELF_H / 2 + 5, CORE_A_MARK, {
          size: fontSizes.sm,
          fill: c.text,
          anchor: 'end',
          weight: 600,
        }),
      );
      gShelf.appendChild(
        textNode(nameX, SHELF_B_Y + SHELF_H / 2 + 5, CORE_B_MARK, {
          size: fontSizes.sm,
          fill: c.text,
          anchor: 'end',
          weight: 600,
        }),
      );
      gShelf.appendChild(
        textNode(nameX, STRIP_Y + CELL_H / 2 + 4, MEMORY_MARK, {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'end',
          weight: 600,
        }),
      );

      // ── 줄 울타리. **두 코어의 칸을 함께 품은 울타리만 테두리가 다르다** —
      //    이 조각의 주장이 문장이 아니라 그림으로 서는 자리다.
      const sharedFence =
        run !== null && sameLineOf(run, scene.lineBytes, scene.elemBytes)
          ? falseSharingLine(run.aIndex, scene.lineBytes, scene.elemBytes)
          : -1;
      for (let line = 0; line < g.lineCount; line += 1) {
        const crowded = line === sharedFence;
        gStrip.appendChild(
          el('rect', {
            x: blockX(g, line) - 5,
            y: STRIP_Y - 5,
            width: g.blockW + 10,
            height: CELL_H + 10,
            rx: 7,
            fill: 'none',
            stroke: crowded ? c.danger : c.textMuted,
            'stroke-width': crowded ? 2 : 1,
          }),
        );
        gStrip.appendChild(
          textNode(
            blockX(g, line),
            LINE_LABEL_Y,
            t('label.line', 'line {n} · {bytes} B', { n: line, bytes: scene.lineBytes }),
            { size: fontSizes.xs, fill: crowded ? c.danger : c.textMuted, weight: 600 },
          ),
        );
      }

      // ── 메모리 띠의 칸. 채움은 그 칸이 누구의 것인가다.
      const ownerOfCell = (index: number): CoreMark | null => {
        if (run === null) return null;
        if (index === run.aIndex) return 'A';
        if (index === run.bIndex) return 'B';
        return null;
      };
      for (let i = 0; i < g.cellCount; i += 1) {
        const owner = ownerOfCell(i);
        const x = cellX(g, scene, i);
        gStrip.appendChild(
          el('rect', {
            x: x + 1.5,
            y: STRIP_Y,
            width: g.cellW - 3,
            height: CELL_H,
            rx: 4,
            fill: owner === null ? c.bg : coreColor(owner),
            stroke: c.border,
          }),
        );
        const ink = owner === null ? c.textMuted : c.stateInk;
        gStrip.appendChild(
          textNode(x + 8, STRIP_Y + 16, `a[${i}]`, { size: fontSizes.xs, fill: ink }),
        );
        gStrip.appendChild(
          textNode(x + g.cellW - 8, STRIP_Y + 16, String(i * scene.elemBytes), {
            size: fontSizes.xs,
            fill: ink,
            anchor: 'end',
            family: fonts.mono,
          }),
        );
        const value = textNode(
          x + g.cellW / 2,
          STRIP_Y + 45,
          String(pic === null ? 0 : valueAt(pic, i)),
          {
            size: fontSizes.lg,
            fill: ink,
            anchor: 'middle',
            weight: 700,
            family: fonts.mono,
          },
        );
        gStrip.appendChild(value);
        drawn.cellValues.push(value);
      }

      // ── 코어가 노리는 칸을 가리키는 선.
      if (run !== null) {
        const aX = cellMid(g, scene, run.aIndex);
        const bX = cellMid(g, scene, run.bIndex);
        drawn.connA = el('line', {
          x1: aX,
          y1: CONN_A_FROM,
          x2: aX,
          y2: CONN_A_TO,
          stroke: COLOR_A,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        drawn.connB = el('line', {
          x1: bX,
          y1: CONN_B_FROM,
          x2: bX,
          y2: CONN_B_TO,
          stroke: COLOR_B,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        gConn.appendChild(drawn.connA);
        gConn.appendChild(drawn.connB);
      }

      // ── 빼앗겨 빈 자국. 테두리만 남는다 — 사본이 있었는데 무르게 됐다는 표식.
      if (pic !== null) {
        for (const [line, core] of pic.vacated) {
          const node = el('rect', {
            x: blockX(g, line),
            y: shelfSlabY(core),
            width: g.blockW,
            height: SLAB_H,
            rx: 7,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          });
          gGhost.appendChild(node);
          drawn.ghosts.set(line, node);
        }
      }

      // ── 쥐고 있는 줄(사본). 덩어리째 선반에 올라앉는다.
      if (run !== null && pic !== null) {
        for (const [line, core] of pic.holder) {
          const x = blockX(g, line);
          const group = el('g', { transform: `translate(0, ${coreDy(core)})` });
          group.appendChild(
            el('rect', {
              x,
              y: SLAB_HOME_Y,
              width: g.blockW,
              height: SLAB_H,
              rx: 7,
              fill: c.bg,
              stroke: coreColor(core),
              'stroke-width': 2,
            }),
          );
          const mirrors: SVGTextElement[] = [];
          for (let j = 0; j < g.elemsPerLine; j += 1) {
            const index = line * g.elemsPerLine + j;
            const owner = ownerOfCell(index);
            const mx = x + j * g.cellW;
            group.appendChild(
              el('rect', {
                x: mx + 4,
                y: SLAB_HOME_Y + 7,
                width: g.cellW - 8,
                height: SLAB_H - 14,
                rx: 3,
                fill: owner === null ? c.bgSubtle : coreColor(owner),
                stroke: c.border,
              }),
            );
            const mirror = textNode(
              mx + g.cellW / 2,
              SLAB_HOME_Y + SLAB_H / 2 + 5,
              String(valueAt(pic, index)),
              {
                size: fontSizes.sm,
                fill: owner === null ? c.textMuted : c.stateInk,
                anchor: 'middle',
                weight: 700,
                family: fonts.mono,
              },
            );
            group.appendChild(mirror);
            mirrors.push(mirror);
          }
          gSlab.appendChild(group);
          drawn.slabs.set(line, { g: group, values: mirrors });
        }

        // ── 줄마다의 무효화 셈. 두 코어가 앉은 줄에만 단다.
        const lines = new Set<number>([
          falseSharingLine(run.aIndex, scene.lineBytes, scene.elemBytes),
          falseSharingLine(run.bIndex, scene.lineBytes, scene.elemBytes),
        ]);
        for (const line of lines) {
          const count = pic.invalid.get(line) ?? 0;
          const node = textNode(
            blockX(g, line) + g.blockW,
            BADGE_Y,
            t('label.inval', 'invalidated: {n}', { n: count }),
            {
              size: fontSizes.xs,
              fill: count > 0 ? c.danger : c.textMuted,
              anchor: 'end',
              weight: 600,
            },
          );
          gBadge.appendChild(node);
          drawn.badges.set(line, node);
        }
      }

      // ── 견줌 띠. 배치마다 한 줄이 남는다 — 이 조각은 두 배치를 견주는 것이
      //    주장이므로 앞 배치의 셈이 지워지면 안 된다.
      for (let i = 0; i < runs.length; i += 1) {
        const r = runs[i];
        const rp = pics[i];
        if (r === undefined || rp === undefined) continue;
        const cy = LEDGER_Y + i * LEDGER_STEP;

        // 작은 울타리 그림이 이 줄이 어느 배치인지 말한다. 글자가 아니라 띠와
        // 같은 어휘라 따로 읽는 법을 배울 것이 없다.
        for (let line = 0; line < g.lineCount; line += 1) {
          const fx = g.originX + line * (LEDGER_FENCE_W + LEDGER_FENCE_GAP);
          const claims: CoreMark[] = [];
          for (const core of ['A', 'B'] as const) {
            if (falseSharingLine(indexOf(r, core), scene.lineBytes, scene.elemBytes) === line) {
              claims.push(core);
            }
          }
          gLedger.appendChild(
            el('rect', {
              x: fx,
              y: cy - LEDGER_FENCE_H / 2,
              width: LEDGER_FENCE_W,
              height: LEDGER_FENCE_H,
              rx: 3,
              fill: 'none',
              stroke: claims.length > 1 ? c.danger : c.border,
              'stroke-width': claims.length > 1 ? 2 : 1,
            }),
          );
          for (let k = 0; k < claims.length; k += 1) {
            const core = claims[k];
            if (core === undefined) continue;
            gLedger.appendChild(
              el('circle', {
                cx: fx + (LEDGER_FENCE_W * (k + 1)) / (claims.length + 1),
                cy,
                r: 3,
                fill: coreColor(core),
              }),
            );
          }
        }

        // 눈금 하나가 쓰기 하나다. 채움은 누가 썼나, 테두리는 상대의 사본을
        // 무르게 했나 — 두 축이 부딪히지 않는다.
        let k = 0;
        const tickX0 =
          g.originX + g.lineCount * (LEDGER_FENCE_W + LEDGER_FENCE_GAP) + LEDGER_TICK_PAD;
        const shown = rp.writes;
        for (const round of r.rounds) {
          for (const mark of round.writes) {
            if (k >= shown) break;
            gLedger.appendChild(
              el('rect', {
                x: tickX0 + k * (LEDGER_TICK_W + LEDGER_TICK_GAP),
                y: cy - LEDGER_TICK_H / 2,
                width: LEDGER_TICK_W,
                height: LEDGER_TICK_H,
                rx: 2,
                fill: coreColor(mark.core),
                stroke: mark.stole ? c.danger : c.border,
                'stroke-width': mark.stole ? 2 : 1,
              }),
            );
            k += 1;
          }
        }

        const count = textNode(
          g.originX + g.stripW,
          cy + 4,
          t('label.inval', 'invalidated: {n}', { n: rp.invalidations }),
          {
            size: fontSizes.xs,
            fill: rp.invalidations > 0 ? c.danger : c.textMuted,
            anchor: 'end',
            weight: 600,
          },
        );
        gLedger.appendChild(count);
        drawn.ledger.push({ count });
      }

      // ── 캡션.
      if (scene.caption !== null) drawCaption(captionText(scene, scene.caption));

      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 첫 배치. 두 선이 한 뜻으로 자란다 — 시계를 나누지 않는다. */
    async function flowArrange(drawn: Drawn, mine: number): Promise<void> {
      const a = drawn.connA;
      const b = drawn.connB;
      if (a === null || b === null) return;
      await tween(GROW_MS, mine, (e) => {
        a.setAttribute('y2', String(lerp(CONN_A_FROM, CONN_A_TO, e)));
        b.setAttribute('y2', String(lerp(CONN_B_FROM, CONN_B_TO, e)));
      });
    }

    /**
     * 옮겨 앉는다.
     *
     * 앞 배치의 화면을 먼저 세운 뒤(그래야 쥐고 있던 줄이 툭 사라지지 않는다) 그것을
     * 메모리로 내려앉히고, 새 배치를 세운 다음 선을 미끄러뜨린다. 선의 출발 자리는
     * **앞 배치의 색인**에서 나온다 — 화면을 도로 읽지 않는다.
     */
    async function flowRearrange(
      scene: FalseSharingScene,
      mine: number,
    ): Promise<void> {
      const at = scene.runs.length - 1;
      const before = scene.runs[at - 1];
      const run = scene.runs[at];
      if (before === undefined || run === undefined) return;

      const old = drawStatic(scene, { upToRun: at - 1 });
      const oldPic = pictureOf(before, scene.lineBytes, scene.elemBytes);
      const leaving = [...oldPic.holder].map(([line, core]) => ({
        node: old.slabs.get(line)?.g ?? null,
        dy: coreDy(core),
      }));
      const fading = [...old.ghosts.values(), ...old.badges.values()];
      await tween(RETURN_MS, mine, (e) => {
        for (const item of leaving) {
          if (item.node === null) continue;
          item.node.setAttribute('transform', `translate(0, ${lerp(item.dy, 0, e)})`);
          item.node.setAttribute('opacity', String(1 - e));
        }
        for (const node of fading) node.setAttribute('opacity', String(1 - e));
      });
      if (!alive(mine)) return;

      const drawn = drawStatic(scene);
      const a = drawn.connA;
      const b = drawn.connB;
      if (a === null || b === null) return;
      const g = drawn.geom;
      const fromA = cellMid(g, scene, before.aIndex);
      const fromB = cellMid(g, scene, before.bIndex);
      const toA = cellMid(g, scene, run.aIndex);
      const toB = cellMid(g, scene, run.bIndex);
      await tween(SLIDE_MS, mine, (e) => {
        const xa = String(lerp(fromA, toA, e));
        const xb = String(lerp(fromB, toB, e));
        a.setAttribute('x1', xa);
        a.setAttribute('x2', xa);
        b.setAttribute('x1', xb);
        b.setAttribute('x2', xb);
      });
    }

    /**
     * 한 바퀴. 두 코어가 **차례로** 움직인다 — 번갈아 고치는 것이 이 조각의 박자라
     * 나란히 돌리면 그 차례가 안 보인다.
     *
     * 한 쓰기 안에서는 덩어리가 끌려오는 것과 무효화 셈이 오르는 것이 한 사건이라
     * **한 시계**가 둘을 그린다.
     */
    async function flowRound(scene: FalseSharingScene, mine: number): Promise<void> {
      const run = currentRun(scene);
      if (run === null) return;
      const round = run.rounds[run.rounds.length - 1];
      if (round === undefined) return;
      const total = pictureOf(run, scene.lineBytes, scene.elemBytes).writes;
      const doneBefore = total - round.writes.length;

      for (let k = 0; k < round.writes.length; k += 1) {
        const mark = round.writes[k];
        if (mark === undefined) return;
        const cut = doneBefore + k;
        const heldBy = pictureOf(run, scene.lineBytes, scene.elemBytes, cut).holder;
        const index = indexOf(run, mark.core);
        const line = falseSharingLine(index, scene.lineBytes, scene.elemBytes);
        const was = heldBy.get(line);

        const shot = drawStatic(scene, { cutWrites: cut + 1 });
        const slab = shot.slabs.get(line);
        const target = coreDy(mark.core);

        if (slab === undefined) {
          await wait(HOLD_MS, mine);
        } else if (was === undefined) {
          // 아무도 쥔 적 없다. 메모리에서 끌어올린다 — 빼앗는 것이 아니다.
          await tween(FETCH_MS, mine, (e) => {
            slab.g.setAttribute('opacity', String(Math.min(1, e * 3)));
            slab.g.setAttribute('transform', `translate(0, ${lerp(0, target, e)})`);
          });
        } else if (was !== mark.core) {
          // 빼앗는다. 상대 선반에서 끌려오고, 빈 자국이 서고, 셈이 오른다.
          const from = coreDy(was);
          const ghost = shot.ghosts.get(line);
          const badge = shot.badges.get(line);
          await tween(MOVE_MS, mine, (e) => {
            slab.g.setAttribute('transform', `translate(0, ${lerp(from, target, e)})`);
            ghost?.setAttribute('opacity', String(e));
            badge?.setAttribute('transform', `translate(0, ${Math.sin(e * Math.PI) * -5})`);
          });
        } else {
          // 이미 제 손에 있다. 끌어올 것이 없다.
          await wait(HOLD_MS, mine);
        }
        if (!alive(mine)) return;

        const memory = shot.cellValues[index];
        const mirror = slab?.values[columnOf(shot.geom, index, line)];
        await tween(RISE_MS, mine, (e) => {
          const dy = (1 - e) * -8;
          memory?.setAttribute('transform', `translate(0, ${dy})`);
          mirror?.setAttribute('transform', `translate(0, ${dy})`);
        });
        if (!alive(mine)) return;
      }
    }

    /** 이 배치의 셈을 맺는다. 줄의 셈과 띠의 줄이 한 뜻이라 한 시계로 돈다. */
    async function flowSettle(drawn: Drawn, mine: number): Promise<void> {
      const row = drawn.ledger[drawn.ledger.length - 1];
      await tween(NUDGE_MS, mine, (e) => {
        const dy = Math.sin(e * Math.PI) * -4;
        const shift = `translate(0, ${dy})`;
        for (const badge of drawn.badges.values()) badge.setAttribute('transform', shift);
        row?.count.setAttribute('transform', shift);
      });
    }

    /** 두 배치를 견준다. 이미 서 있는 두 수가 부풀었다 돌아온다. */
    async function flowConclude(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.ledger.length === 0) return;
      const anchorX = drawn.geom.originX + drawn.geom.stripW;
      await tween(WEIGH_MS, mine, (e) => {
        const s = 1 + Math.sin(e * Math.PI) * 0.18;
        for (let i = 0; i < drawn.ledger.length; i += 1) {
          const row = drawn.ledger[i];
          if (row === undefined) continue;
          const cy = LEDGER_Y + i * LEDGER_STEP + 4;
          row.count.setAttribute(
            'transform',
            `translate(${anchorX * (1 - s)}, ${cy * (1 - s)}) scale(${s})`,
          );
        }
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: FalseSharingScene,
      _prev: FalseSharingScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'arrange':
          await flowArrange(drawn, mine);
          break;
        case 'rearrange':
          await flowRearrange(next, mine);
          break;
        case 'round':
          await flowRound(next, mine);
          break;
        case 'settle':
          await flowSettle(drawn, mine);
          break;
        case 'conclude':
          await flowConclude(drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 `opacity` 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        cancelPending();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 프레임·타이머는 아예 불리지 않는다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
