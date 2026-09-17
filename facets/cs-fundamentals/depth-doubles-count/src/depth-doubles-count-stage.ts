/**
 * depth-doubles-count 전용 stage view — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 이 그림이 무엇을 하려 하는가
 *
 * 동사는 "배로 벌어진다" 다. 그래서 **자리의 크기와 간격을 층마다 고정** 하고,
 * 한 층 내려갈 때 자리마다 둘로 갈라지게 한다. 층 d 의 자리 수가 `rows[d]` 이고
 * 칸 간격이 층마다 같으므로 자리의 중심은 번호에서 곧바로 나온다
 * (`cx = 띠중심 + (2i + 1 − n)·간격/2`) — 걸음마다 줄 전체가 바깥으로 쏟아져 나간다.
 *
 * 축척을 줄이지 않는 것이 요점이다. 4층(16자리) 까지는 줄이 화면에 온전히
 * 들어오고, 그 아래부터는 **화면 밖으로 넘쳐 나간다.** 잘리는 것이 곧 논증이다 —
 * 층은 하나씩 느는데 자리는 곱으로 늘어서 몇 층 만에 담을 수 없게 된다.
 * 자리 수는 오른쪽 눈금이 계속 말해 주므로 화면이 거짓을 말하지 않는다.
 *
 * ── 화면에 뜨는 수는 모두 `rows` 에서 나온다
 *
 * 눈금의 층별 자리 수, 괄호 옆의 합, 캡션의 인자, 그리고 **실제로 그리는 자리의
 * 개수**까지 전부 장면의 `rows` 하나가 정한다. 합은 `totalOf(rows)` 가 그 수들을
 * 더해서 얻는다 — 그러니 괄호 옆의 1023 은 눈금에 적힌 1·2·4·…·512 의 합 그
 * 자체이고, 화면이 제 안에서 참이다 (`scene.ts` 의 "수는 한 출처에서만").
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 자리들은 이미 끝 자리에 서 있다. 걸음은 **아직 못 온
 * 만큼을 뒤로 물려 두었다가** 프레임마다 그 물림을 줄인다 — 새 자리는 어미 자리
 * 에서 한 층 위에서 출발해 제자리로 미끄러지고 (transform), 어미와 잇는 선은
 * 어미 쪽부터 그려지고 (stroke-dashoffset), 지난 층은 살아 있는 칠에서 가라앉는
 * 칠로 물든다 (fill).
 *
 * **CSS `transition` 을 쓰지 않는다** (S-scene MUST NOT). 전이는 자기 시계로
 * 흐르므로 걸음의 화면이 `render` 가 풀린 뒤에도 저 혼자 바뀔 수 있고, 그러면
 * "그 걸음의 화면" 이라는 말이 성립하지 않는다. 여기서는 `tween` 하나가 시계를
 * 쥐고 `setTimeout(FRAME_MS)` 로 걸어가므로, 화면이 바뀌는 일은 전부 세대 빗장
 * 안에서 일어난다.
 *
 * 한때 `hold()` 가 `transition: 'none'` 으로 끄고 한 프레임 뒤 `release()` 가
 * 다시 켜는 짜임이었다. 지연 발화가 새지는 않았지만 (걸어 둔 노드를 다음 정적
 * 그리기가 통째로 걷어 갔다) 시계가 둘이라, 타이머가 전이보다 먼저 깨는 만큼을
 * `TAIL_MS` 라는 어림수로 메우고 있었다. 시계를 하나로 하면 그 어림이 없어진다.
 *
 * 운동이 끝나면 **장면을 통째로 다시 세운다.** 보간이 남긴 인라인 `transform`·
 * `stroke-dashoffset`·`fill` 이 노드째 사라지므로 되돌릴 목록을 손으로 관리하지
 * 않는다 (S-scene).
 *
 * 걸음 벽시계는 **운동 + `stepMs`** 다 — `render` 가 운동이 다 선 뒤에 풀리므로
 * (S-scene 의 Promise 계약) 선언의 쉼이 그 위에 얹힌다. 그래서 운동을 걸음
 * 간격의 절반 아래로 잡는다. 기본값에서 걸음 하나가 약 1.0 초다 (S-piece 의
 * 800ms 문턱 위).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import type { DepthDoublesCountScene, DepthStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로 골격. 캔버스 폭에서 역산하고 상수는 상한만 둔다.
const W = PIECE_CANVAS_W;
/** 층 번호가 서는 왼쪽 여백. */
const LEFT_GUTTER = 34;
/** 자리 수 · 합 괄호가 서는 오른쪽 여백. */
const RIGHT_GUTTER = 96;
const BAND_X0 = LEFT_GUTTER;
const BAND_X1 = W - RIGHT_GUTTER;
const BAND_W = BAND_X1 - BAND_X0;
const BAND_CX = BAND_X0 + BAND_W / 2;

const DEPTH_X = LEFT_GUTTER - 10;
const COUNT_X = BAND_X1 + 28;
const BRACE_X = W - 58;
const BRACE_ARM = 5;
const TOTAL_X = W - 4;

/** 자리 하나가 차지하는 칸. 4층(16자리) 이 띠를 거의 채우도록 역산한다. */
const SLOT_PITCH_MAX = 34;
const SLOT_PITCH = Math.min(SLOT_PITCH_MAX, Math.floor(BAND_W / 17));
const SLOT_GAP = 8;
const SLOT_W = SLOT_PITCH - SLOT_GAP;
const SLOT_H = 12;
const SLOT_RX = 3;

/** 띠 중심에서 이만큼 벗어난 자리는 완전히 나가서 그릴 것이 없다. */
const BAND_LIMIT = BAND_W / 2 + SLOT_PITCH;

// ── 세로 골격.
const HEADER_Y = 16;
const ROW0_CY = 40;
const ROW_PITCH = 30;
const CAPTION_GAP = 36;
const BOTTOM_PAD = 20;

/** initialData 가 없을 때의 기본 깊이. 캔버스 높이의 초기값도 여기서 나온다. */
const DEFAULT_MAX_DEPTH = 9;
const DEFAULT_STEP_MS = 700;

const BRACE_MS = 420;

/** 보간 한 마디. 프레임을 쓰지 않으므로 이 값이 곧 걸음의 해상도다. */
const FRAME_MS = 16;

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
/** 옛 `cubic-bezier(0.22, 0.61, 0.36, 1)` 자리. */
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
/** 보간 끝자리를 자른다. 마지막 마디는 인라인 값을 지우므로 여기를 지나지 않는다. */
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 두 칠을 섞는다. CSS `transition` 의 색 전환을 대신한다.
 *
 * `p` 가 1 이면 **목표 칠을 글자 그대로** 돌려준다 — 보간이 만든 `rgb(…)` 표기가
 * 끝자리에 남으면 흘려 세운 화면과 곧바로 세운 화면이 갈린다.
 */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

/** 화면에 새겨진 도식 라벨. 번역하면 눈금과 어긋난다 (C10 표식). */
const HEADER_DEPTH = 'depth';
const HEADER_SLOTS = 'slots';

/** clip-path id 가 한 문서에서 겹치지 않게 한다 (한 글에 조각이 여럿 박힌다). */
let instanceSeq = 0;

const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  }
  return node;
};

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number => {
  const raw = source?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
};

/**
 * 층 d 의 i 번째 자리의 중심.
 *
 * 자리 수 `n` 과 번호만으로 정해진다 — 칸 간격이 층마다 같고 줄이 띠 중심을 기준
 * 으로 대칭이기 때문이다. 옛 stage 는 어미의 좌표를 쥐고 `2(cx − C) ± P/2` 로
 * 대물림했는데, 그 쥠이 곧 되감기가 어긋나던 자리였다.
 */
const slotCx = (i: number, n: number): number => BAND_CX + (2 * i + 1 - n) * (SLOT_PITCH / 2);

/**
 * 띠 안에 걸치는 자리의 번호 구간.
 *
 * `|2i + 1 − n| ≤ 2·한계/간격` 을 i 로 푼 것이다. 층이 깊어지면 자리 수가 곱으로
 * 늘지만 그릴 것은 이 구간뿐이라, 512 개를 헛돌지 않는다.
 */
const bandWindow = (n: number): { lo: number; hi: number } => {
  const span = (2 * BAND_LIMIT) / SLOT_PITCH;
  return {
    lo: Math.max(0, Math.ceil((n - span - 1) / 2)),
    hi: Math.min(n - 1, Math.floor((n + span - 1) / 2)),
  };
};

/**
 * 0층부터 마지막 층까지의 합.
 *
 * `2^(depth+1) − 1` 로 셈하지 않는다. 괄호 옆에 서는 수는 **눈금에 적힌 수들의
 * 합**이어야 화면이 제 안에서 참이다 (`scene.ts`).
 */
const totalOf = (rows: readonly number[]): number => {
  let sum = 0;
  for (const n of rows) sum += n;
  return sum;
};

/** 걸음이 뒤로 물려 두었다 놓아 주는 것들. */
type Mover = { node: SVGElement; dx: number; dy: number; fade: boolean };
type Drawer = { node: SVGElement; length: number };

/** 한 걸음의 운동 전부. `tween` 하나가 이것을 통째로 쥐므로 시계가 하나다. */
type Motion = {
  movers: Mover[];
  drawers: Drawer[];
  /** 살아 있는 색에서 가라앉는 색으로 물드는 자리들. */
  settling: SVGRectElement[];
  ms: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type DrawnSlot = {
  rect: SVGRectElement;
  cx: number;
  parentCx: number;
  edge: SVGLineElement | null;
  edgeLen: number;
};
type DrawnRow = { slots: DrawnSlot[]; gutter: SVGTextElement[] };
type Drawn = {
  rows: DrawnRow[];
  brace: { path: SVGPathElement; total: SVGTextElement; length: number } | null;
};

export const depthDoublesCountStageView: CanvasView = {
  canvas: { height: ROW0_CY + ROW_PITCH * DEFAULT_MAX_DEPTH + CAPTION_GAP + BOTTOM_PAD },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DepthDoublesCountScene> {
    const colors = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const maxDepth = Math.max(
      1,
      Math.trunc(readNumber(params.initialData, 'maxDepth', DEFAULT_MAX_DEPTH)),
    );
    const stepMs = readNumber(params.initialData, 'stepMs', DEFAULT_STEP_MS);
    /**
     * 걸음 안의 운동 길이.
     *
     * 걸음 벽시계 = 이 값 + `stepMs` 다. 옛 코드는 운동이 끝나기 전에 resolve 해
     * 두 시간을 겹쳤지만, 장면 방식에서는 `render` 가 장면이 다 선 뒤에 풀려야
     * 하므로 (S-scene) 겹칠 수 없다. 그래서 걸음 간격의 절반 아래로 줄인다.
     */
    const animMs = Math.max(160, Math.min(380, Math.round(stepMs * 0.45)));

    const rowCy = (depth: number): number => ROW0_CY + ROW_PITCH * depth;
    const captionY = rowCy(maxDepth) + CAPTION_GAP;
    const height = captionY + BOTTOM_PAD;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

    const clipId = `ddc-band-${(instanceSeq += 1)}`;
    const defs = svgEl('defs');
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('rect', { x: BAND_X0, y: 0, width: BAND_W, height }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    /** 눈금 — 층 번호와 자리 수. 띠 바깥이라 잘리지 않는다. */
    const gutterGroup = svgEl('g');
    /** 자리와 이음선. 넘치는 것은 여기서 잘린다. */
    const bandGroup = svgEl('g', { 'clip-path': `url(#${clipId})` });
    /** 마지막에 모든 층을 하나로 묶는 괄호. */
    const braceGroup = svgEl('g');
    svg.appendChild(gutterGroup);
    svg.appendChild(bandGroup);
    svg.appendChild(braceGroup);

    const label = (
      x: number,
      y: number,
      anchor: 'start' | 'middle' | 'end',
      size: string,
      family: string,
      fill: string,
    ): SVGTextElement =>
      svgEl('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': family,
        'font-size': size,
        fill,
      });

    const headerDepth = label(2, HEADER_Y, 'start', fontSizes.xs, fonts.body, colors.textMuted);
    headerDepth.textContent = HEADER_DEPTH;
    const headerSlots = label(COUNT_X, HEADER_Y, 'end', fontSizes.xs, fonts.body, colors.textMuted);
    headerSlots.textContent = HEADER_SLOTS;
    svg.appendChild(headerDepth);
    svg.appendChild(headerSlots);

    /**
     * 캡션은 세 층의 재건 밖에 있다 — 한 번 만들고 계속 쓴다. 그래서 정적 경로가
     * **매 걸음 명시로** 써 준다 (빈 문자열까지). 빠뜨리면 되짚은 화면에 앞 걸음의
     * 문장이 남는다 (S-scene).
     */
    const caption = label(W / 2, captionY, 'middle', fontSizes.md, fonts.body, colors.textMuted);
    svg.appendChild(caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. 가운데에 되짚기가 끼어들면 남은 마디가
     * **이미 새로 선 화면**을 덮으므로, 마디마다 자기 번호가 아직 유효한지 보고
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
     *
     * 프레임(`requestAnimationFrame`) 이 아니라 `setTimeout` 으로 걷는다. 프레임은
     * 문서가 안 보이면 멈추므로 걸음이 걸린 채로 남고, 검사 환경에는 아예 없기도
     * 하다 — 그때마다 운동을 통째로 건너뛰는 갈래를 따로 둬야 했다.
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

    const clearGroup = (group: SVGGElement): void => {
      while (group.firstChild) group.removeChild(group.firstChild);
    };

    const makeSlot = (cx: number, cy: number, live: boolean): SVGRectElement =>
      svgEl('rect', {
        x: cx - SLOT_W / 2,
        y: cy - SLOT_H / 2,
        width: SLOT_W,
        height: SLOT_H,
        rx: SLOT_RX,
        fill: live ? colors.itemActive : colors.itemSorted,
      });

    const makeEdge = (fromCx: number, fromCy: number, toCx: number, toCy: number): SVGLineElement =>
      svgEl('line', {
        x1: fromCx,
        y1: fromCy,
        x2: toCx,
        y2: toCy,
        stroke: colors.textMuted,
        'stroke-width': 1,
      });

    /** 층 눈금 두 짝 — 왼쪽 층 번호, 오른쪽 자리 수. 살아 있는 층만 짙다. */
    const makeGutter = (depth: number, count: number, live: boolean): SVGTextElement[] => {
      const depthText = label(
        DEPTH_X,
        rowCy(depth) + 4,
        'end',
        fontSizes.sm,
        fonts.mono,
        colors.textMuted,
      );
      depthText.textContent = String(depth);
      const countText = label(
        COUNT_X,
        rowCy(depth) + 4,
        'end',
        fontSizes.sm,
        fonts.mono,
        live ? colors.text : colors.textMuted,
      );
      countText.textContent = String(count);
      gutterGroup.appendChild(depthText);
      gutterGroup.appendChild(countText);
      return [depthText, countText];
    };

    /** 모든 층을 하나로 묶는 괄호와 그 합. */
    const drawBrace = (rows: readonly number[]): Drawn['brace'] => {
      const top = rowCy(0) - SLOT_H / 2 - 4;
      const bottom = rowCy(rows.length - 1) + SLOT_H / 2 + 4;
      const mid = (top + bottom) / 2;
      const path = svgEl('path', {
        d:
          `M ${BRACE_X - BRACE_ARM} ${top} H ${BRACE_X} V ${mid - BRACE_ARM} ` +
          `L ${BRACE_X + BRACE_ARM} ${mid} L ${BRACE_X} ${mid + BRACE_ARM} ` +
          `V ${bottom} H ${BRACE_X - BRACE_ARM}`,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      });
      const total = label(TOTAL_X, mid + 5, 'end', fontSizes.md, fonts.mono, colors.text);
      total.textContent = String(totalOf(rows));
      braceGroup.appendChild(path);
      braceGroup.appendChild(total);
      return { path, total, length: bottom - top + BRACE_ARM * 6 };
    };

    /**
     * 캡션이 말할 것.
     *
     * 캡션을 장면에 필드로 두지 않는다 — `rows` 와 `gathered` 가 이미 무엇을 말할지
     * 정하므로, 따로 두면 캡션의 수가 눈금의 수와 갈릴 네 번째 출처가 생긴다.
     */
    const captionFor = (scene: DepthDoublesCountScene): string => {
      const rows = scene.rows;
      if (rows.length === 0) return '';
      if (scene.gathered) {
        return t('caption.total', 'Only {depth} levels down, and already {total} slots.', {
          depth: rows.length - 1,
          total: totalOf(rows),
        });
      }
      if (rows.length === 1) return t('caption.root', 'Depth 0 holds one slot.');
      return t('caption.split', 'One level down: every slot splits in two — {count} slots.', {
        count: rows[rows.length - 1],
      });
    };

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    const rewind = (): void => {
      clearGroup(gutterGroup);
      clearGroup(bandGroup);
      clearGroup(braceGroup);
      caption.textContent = '';
    };

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    const drawScene = (scene: DepthDoublesCountScene): Drawn => {
      rewind();

      const rows = scene.rows;
      const drawnRows: DrawnRow[] = [];

      for (let depth = 0; depth < rows.length; depth += 1) {
        const n = rows[depth];
        // 묶이고 나면 살아 있는 층이 없다 — 마지막 층까지 가라앉는다.
        const live = !scene.gathered && depth === rows.length - 1;
        const cy = rowCy(depth);
        const parentCy = rowCy(depth - 1);
        const { lo, hi } = bandWindow(n);
        const slots: DrawnSlot[] = [];

        for (let i = lo; i <= hi; i += 1) {
          const cx = slotCx(i, n);
          // 어미는 늘 자식보다 중심에 가까우므로, 자식이 띠에 걸치면 어미도 걸친다.
          const parentCx = depth === 0 ? cx : slotCx(Math.floor(i / 2), rows[depth - 1]);
          const edge =
            depth === 0 ? null : makeEdge(parentCx, parentCy + SLOT_H / 2, cx, cy - SLOT_H / 2);
          if (edge) bandGroup.appendChild(edge);
          const rect = makeSlot(cx, cy, live);
          bandGroup.appendChild(rect);
          slots.push({
            rect,
            cx,
            parentCx,
            edge,
            edgeLen: Math.hypot(cx - parentCx, ROW_PITCH - SLOT_H),
          });
        }

        drawnRows.push({ slots, gutter: makeGutter(depth, n, live) });
      }

      const brace = scene.gathered && rows.length > 0 ? drawBrace(rows) : null;
      caption.textContent = captionFor(scene);
      return { rows: drawnRows, brace };
    };

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면과 그 자리의 셈에서 나오고
    // `prev` 를 들추지 않는다 (S-scene).

    const motionFor = (step: DepthStep, drawn: Drawn): Motion | null => {
      const last = drawn.rows.length - 1;

      if (step === 'root') {
        const row = drawn.rows[0];
        if (!row) return null;
        // 0층은 한 자리가 위에서 내려온다. 눈금도 함께 내려온다.
        return {
          movers: [
            ...row.slots.map((s) => ({ node: s.rect as SVGElement, dx: 0, dy: -ROW_PITCH, fade: false })),
            ...row.gutter.map((node) => ({ node: node as SVGElement, dx: 0, dy: -ROW_PITCH, fade: false })),
          ],
          drawers: [],
          settling: [],
          ms: animMs,
        };
      }

      if (step === 'split') {
        const row = drawn.rows[last];
        if (!row || last < 1) return null;
        return {
          movers: [
            // 새 자리는 어미 자리에서 한 층 위에 물려 두었다 제자리로 미끄러진다.
            ...row.slots.map((s) => ({
              node: s.rect as SVGElement,
              dx: s.parentCx - s.cx,
              dy: -ROW_PITCH,
              fade: false,
            })),
            ...row.gutter.map((node) => ({ node: node as SVGElement, dx: 0, dy: -ROW_PITCH, fade: false })),
          ],
          // 이음선은 어미 쪽에서부터 그어진다.
          drawers: row.slots.flatMap((s) => (s.edge ? [{ node: s.edge, length: s.edgeLen }] : [])),
          // 지난 층이 가라앉는다. 정적 그리기는 이미 가라앉은 색으로 세워 두었으므로
          // 살아 있는 색에서 출발시킨다.
          settling: drawn.rows[last - 1].slots.map((s) => s.rect),
          ms: animMs,
        };
      }

      if (!drawn.brace) return null;
      return {
        movers: [{ node: drawn.brace.total, dx: BRACE_ARM * 3, dy: 0, fade: true }],
        drawers: [{ node: drawn.brace.path, length: drawn.brace.length }],
        settling: drawn.rows[last]?.slots.map((s) => s.rect) ?? [],
        ms: BRACE_MS,
      };
    };

    /**
     * 운동의 한 마디를 그린다.
     *
     * `p` 가 0 이면 아직 못 온 만큼이 온전히 물려 있고, 1 이면 물림이 없다. 끝
     * 자리는 **정적 그리기가 이미 정해 두었으므로** 마지막 마디는 보간값을 쓰지
     * 않고 인라인 값을 **지운다** — 보간이 만든 글자가 남으면 흘려 세운 화면과
     * 곧바로 세운 화면이 갈린다.
     *
     * 자리 옮김과 선 긋기는 눅여서(`easeOut`), 칠은 고르게(`p` 그대로) 간다.
     * 시계는 하나이고 거기서 갈래만 다르게 읽는다.
     */
    const applyMotion = (motion: Motion, p: number): void => {
      const done = p >= 1;
      const e = easeOut(p);
      for (const m of motion.movers) {
        if (done) {
          m.node.style.removeProperty('transform');
          if (m.fade) m.node.style.removeProperty('opacity');
          continue;
        }
        const back = 1 - e;
        m.node.style.transform = `translate(${round2(m.dx * back)}px, ${round2(m.dy * back)}px)`;
        if (m.fade) m.node.style.opacity = `${round3(e)}`;
      }
      for (const d of motion.drawers) {
        if (done) {
          d.node.style.removeProperty('stroke-dasharray');
          d.node.style.removeProperty('stroke-dashoffset');
          continue;
        }
        d.node.style.strokeDasharray = `${round2(d.length)}`;
        d.node.style.strokeDashoffset = `${round2(d.length * (1 - e))}`;
      }
      for (const rect of motion.settling) {
        if (done) {
          // 정적 그리기가 `fill` 속성으로 이미 가라앉은 칠을 세워 두었다.
          rect.style.removeProperty('fill');
          continue;
        }
        rect.style.fill = mixColor(colors.itemActive, colors.itemSorted, p);
      }
    };

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: DepthDoublesCountScene,
      _prev: DepthDoublesCountScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;
      const motion = motionFor(step, drawn);
      if (motion === null) return;

      await tween(motion.ms, mine, (p) => applyMotion(motion, p));
      if (!alive(mine)) return;

      // 보간이 남긴 인라인 transform·strokeDashoffset·fill 이 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawScene(next);
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
        rewind();
        for (const node of [
          defs,
          gutterGroup,
          bandGroup,
          braceGroup,
          headerDepth,
          headerSlots,
          caption,
        ]) {
          node.remove();
        }
      },
    };
  },
};
