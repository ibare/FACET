/**
 * divideConquerCombine 전용 stage view — 재귀 나무를 왕복하는 화면.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 필요
 * 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **자리 목록을 장면이 쥐므로 나머지는 전부 거기서 셈해진다.** 깊이와 가로 차례는
 * 부모-자식 잇기를 따라 오르면 나오고, 칸의 개수는 그 자리가 든 값의 개수이고,
 * 배지의 `↓n` · `↑n` 은 쪼개진/합쳐진 차례의 자리 번호다 — 캡션의 "3번 잘랐다" 와
 * 뿌리 옆의 `↓1` 이 같은 배열을 센다.
 *
 * ── 무엇이 움직이는가
 *
 * 이 조각의 동사는 **왕복**이라 화면의 운동도 왕복이다. 값 칸의 복제본이 실제로
 * 자리를 옮긴다. 내려갈 때는 부모 칸에서 떨어져 나온 것이 벌어지며 아래 자식 자리로
 * 내려가고, 올라올 때는 자식 칸의 것이 부모 자리로 되짚어 오른다. 올라오는 길에
 * 값이 **엇갈린다** — 줄이 서는 것은 올라오는 동안이다.
 *
 * 걸음 함수를 다섯 두지 않는다. 다섯 걸음이 하는 일이 달라 보여도 화면에서는
 * **한 목록의 복제본이 옛 자리에서 새 자리로 가고, 몇몇 자리가 들어서고, 가지가
 * 자라고, 한 층이 튄다** 뿐이라 `motionOf` 가 그 목록 하나를 내고 시계 하나가
 * 흘린다. 내려감과 올라옴이 **서로의 역이 아니라 같은 꼴**이라는 것이 이 조각의
 * 주장이기도 하다.
 *
 * ── 운동의 방향이 뒤집힌다
 *
 * 정적 그리기가 정본이라 자리들은 이미 끝 모습으로 서 있고, 걸음은 **아직 못 온
 * 만큼 뒤로 물려** 놓고 출발한다 — 들어설 자리는 opacity 를 0 으로, 자란 가지는
 * 길이를 0 으로, 합쳐진 부모는 **다시 문제로** 되돌려 놓는다. 정적으로 세운 직후라
 * 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다 (S-scene).
 *
 * 되돌려 놓을 "합치기 전 부모의 값" 은 `prev` 에서 꺼내지 않는다. 잎의 값은 어느
 * 걸음에서도 바뀌지 않으므로 `problemValuesOf` 가 아래 잎을 이어 셈한다.
 *
 * ── 머무는 것과 지나가는 것
 *
 * 명령형 stage 는 움직이는 자리의 테두리와 가지 색을 걸음 끝에 **되돌렸다**. 그래서
 * 그 걸음으로 되짚으면 어느 자리가 이번 걸음의 주인공인지 화면에 남지 않았다.
 * 이제 `mark` 에서 파생시켜 그 걸음 내내 머문다.
 *
 * ── 순서 표식
 *
 * 갈래 자리마다 `↓n` (몇 번째로 쪼개졌는지) 와 `↑n` (몇 번째로 합쳐졌는지) 을
 * 남긴다. 재생이 끝난 뒤에도 남으므로, 뿌리의 `↓1 ↑3` 이 이 조각의 주장을 정지
 * 화면으로 말한다. 화살표와 숫자는 도형에 새긴 표식이라 번역하지 않는다 (C10).
 *
 * ── 세로
 *
 * mount 에서 잎 개수를 보고 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view). 재생 중
 * viewBox 를 다시 재면 글 안에 박힌 그림의 아래 문단이 밀린다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  childrenOf,
  frameOf,
  mergeBadge,
  mergeSources,
  problemValuesOf,
  splitBadge,
  type DcMark,
  type DivideConquerCombineScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece "그 폭을 채운다"). */
const CELL_MAX_W = 52;
const CELL_H = 36;
const SIDE_MIN = 30;
const TOP_Y = 42;
const ROW_GAP = 86;
const CAPTION_GAP = 26;
const CAPTION_LINE = 17;
const BOTTOM_PAD = 15;
const DEFAULT_LEAF_COUNT = 4;

const BADGE_W = 26;
const BADGE_H = 16;
const BADGE_OFFSET = 10;

const MOVE_MS = 460;
const SEED_MS = 300;
/** 바닥에서 한 번 튀는 데 드는 시간. 올라갔다 내려오는 것이 한 마디다. */
const SETTLE_MS = 340;
const RING_MS = 300;
const SPLIT_BOW = 16;
const MERGE_BOW = -18;
/** 자리가 들어설 때 위에서 내려오는 거리. */
const ENTER_RISE = 18;
/** 답이 되며 튀어 오르는 높이. */
const BOUNCE = 7;

/** 도형에 새긴 표식 — 방향 화살표. 번역 대상이 아니다 (C10). */
const MARK_DOWN = '↓';
const MARK_UP = '↑';

/** SVG 의 rx 는 수치라 토큰 문자열('6px')에서 값을 꺼내 쓴다. */
const CELL_R = Number.parseInt(radii.md, 10);
const RING_R = Number.parseInt(radii.lg, 10);

function stageHeight(maxDepth: number): number {
  return TOP_Y + maxDepth * ROW_GAP + CELL_H / 2 + CAPTION_GAP + CAPTION_LINE + BOTTOM_PAD;
}

function attr(node: Element, attrs: Record<string, string | number>): void {
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
}

function shape<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  attr(node, attrs);
  return node;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function stamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * 글자 폭 어림. SVG 는 줄바꿈이 없어 캡션을 손으로 접어야 하는데, 한글은 한 글자가
 * 거의 글자 크기만 하고 라틴 문자는 그 절반쯤이라 문자별로 나눠 잰다.
 */
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.54;
  return w;
}

function wrapTwoLines(text: string, size: number, maxWidth: number): string[] {
  if (textWidth(text, size) <= maxWidth) return [text];
  const words = text.split(' ');
  let head = '';
  let tail = '';
  for (const word of words) {
    const next = head === '' ? word : `${head} ${word}`;
    if (tail === '' && textWidth(next, size) <= maxWidth) head = next;
    else tail = tail === '' ? word : `${tail} ${word}`;
  }
  return head === '' ? [text] : [head, tail];
}

/** 한 자리가 캔버스의 어디에 서는가. 장면은 좌표를 모르므로 여기서 역산한다. */
type Place = {
  /** 가로 중심. */
  readonly cx: number;
  /** 칸 한가운데의 세로. */
  readonly midY: number;
  /** 칸 줄의 왼쪽 끝. */
  readonly left: number;
  /** 칸의 개수 — 그 자리가 든 값의 개수다. */
  readonly cells: number;
};

/** 이번 걸음에 날아가는 복제본 하나. */
type Flight = { readonly value: number; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

/**
 * 이번 걸음의 운동 전부. 걸음이 다섯이어도 목록은 하나이고 시계도 하나다.
 *
 * `bow` 는 날아가는 길이 휘는 정도 — 내려갈 때는 아래로 처지고 올라올 때는 위로
 * 솟는다. 그것이 왕복을 눈에 보이게 한다.
 */
type Motion = {
  readonly ms: number;
  readonly bow: number;
  readonly flights: readonly Flight[];
  /**
   * 날아가는 것이 **답**인가.
   *
   * 내려가는 것은 문제라 테두리만 있는 빈 칸이고 올라오는 것은 답이라 채워진 칸이다
   * — 같은 자리를 두 번 지나되 들고 있는 것이 다르다는 이 조각의 주장이 복제본의
   * 칠에도 그대로 있어야 한다.
   */
  readonly answered: boolean;
  /** 이번에 들어서는 자리. */
  readonly entering: readonly string[];
  /** 이번에 자라는 가지 (그 자리로 내려오는 가지). */
  readonly growing: readonly string[];
  /** 이번에 답이 되며 튀는 자리. */
  readonly bouncing: readonly string[];
  /** 결론의 테가 떠오르나. */
  readonly ring: boolean;
};

const STILL: Motion = {
  ms: 0,
  bow: 0,
  flights: [],
  answered: false,
  entering: [],
  growing: [],
  bouncing: [],
  ring: false,
};

export const divideConquerCombineStageView: CanvasView = {
  canvas: { height: stageHeight(Math.round(Math.log2(DEFAULT_LEAF_COUNT))) },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DivideConquerCombineScene> {
    const svg = params.canvas;
    clear(svg);
    const palette: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // ── 잎 개수는 초기 데이터가 정한다. 세로는 여기서 한 번 정하고 다시 재지 않는다.
    // 길이만 읽고 참조는 쥐지 않는다 — algorithm 이 제자리에서 고치는 객체다.
    const seedValues = (params.initialData ?? {}).values;
    const leafCount =
      Array.isArray(seedValues) && seedValues.length > 0 ? seedValues.length : DEFAULT_LEAF_COUNT;
    const maxDepth = Math.max(1, Math.round(Math.log2(leafCount)));
    const height = stageHeight(maxDepth);
    attr(svg, { viewBox: `0 0 ${PIECE_CANVAS_W} ${height}` });

    // ── 격자. 칸 폭은 캔버스에서 역산하고 남는 폭은 나무가 벌어지는 틈으로 쓴다.
    const usable = PIECE_CANVAS_W - SIDE_MIN * 2;
    const cellW = Math.min(CELL_MAX_W, Math.floor(usable / (leafCount * 2)));
    const slack = Math.max(0, usable - cellW * leafCount);

    // 잎 사이 틈은 두 잎의 최소 공통 조상이 얕을수록 넓다 — 나무가 아래로 벌어진다.
    const gapWeights: number[] = [];
    for (let i = 0; i + 1 < leafCount; i += 1) {
      let shared = 0;
      for (let bit = maxDepth - 1; bit >= 0; bit -= 1) {
        if (((i >> bit) & 1) !== (((i + 1) >> bit) & 1)) break;
        shared += 1;
      }
      gapWeights.push(Math.pow(2, maxDepth - 1 - shared));
    }
    const weightSum = gapWeights.reduce((acc, w) => acc + w, 0) || 1;
    const unit = slack / weightSum;

    const span = cellW * leafCount + slack;
    const originX = Math.round((PIECE_CANVAS_W - span) / 2);

    const leafX: number[] = [];
    let cursorX = originX;
    for (let i = 0; i < leafCount; i += 1) {
      leafX.push(cursorX + cellW / 2);
      cursorX += cellW + (gapWeights[i] ?? 0) * unit;
    }

    // 자리의 가로 중심 — 잎에서 위로 접어 올린다. 부모는 두 자식의 한가운데다.
    const centers: number[][] = [];
    centers[maxDepth] = leafX;
    for (let d = maxDepth - 1; d >= 0; d -= 1) {
      const below = centers[d + 1];
      const row: number[] = [];
      for (let i = 0; i * 2 + 1 < below.length; i += 1) {
        row.push((below[i * 2] + below[i * 2 + 1]) / 2);
      }
      centers[d] = row;
    }

    const rowY = (depth: number): number => TOP_Y + depth * ROW_GAP;
    const slotX = (place: Place, slot: number): number =>
      place.left + slot * cellW + cellW / 2;

    // ── 그림 층. 뒤에 붙는 것이 위에 온다.
    const linkLayer = shape('g', {});
    const frameLayer = shape('g', {});
    const ringLayer = shape('g', {});
    const flyLayer = shape('g', {});
    const captionLayer = shape('g', {});
    svg.append(linkLayer, frameLayer, ringLayer, flyLayer, captionLayer);

    const captionSize = Number.parseInt(fontSizes.sm, 10);
    const captionY = TOP_Y + maxDepth * ROW_GAP + CELL_H / 2 + CAPTION_GAP;

    // ── 걸어 둔 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 자리도 가지도 매번 새로 짓지만, 그 손잡이를 담는 `frameGs` ·
     * `linkEls` 는 **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이 `await` 를
     * 지난 뒤 그것을 읽으면 새 손잡이를 타고 살아 있는 화면에 쓴다. 그래서
     * 프레임마다 자기 세대를 확인하고 아니면 손대지 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0) {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const begun = stamp();
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          const raw = Math.min(1, (stamp() - begun) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    // ── 자리를 먼저 한 번에 셈하고 그 다음에 그린다 ─────────────────────────
    //
    // 그리면서 이웃의 "지금 좌표" 를 되읽으면 순회 순서가 곧 숨은 상태가 된다.

    function layoutOf(scene: DivideConquerCombineScene): Map<string, Place> {
      const depths = new Map<string, number>();
      const indices = new Map<string, number>();
      const out = new Map<string, Place>();
      // frames 는 층 순서로 쌓이므로 부모가 늘 자식보다 앞에 온다.
      for (const f of scene.frames) {
        const depth = f.parentId === null ? 0 : (depths.get(f.parentId) ?? 0) + 1;
        const index =
          f.parentId === null ? 0 : (indices.get(f.parentId) ?? 0) * 2 + (f.side === 'R' ? 1 : 0);
        depths.set(f.id, depth);
        indices.set(f.id, index);
        const cells = f.values.length;
        const cx = centers[depth]?.[index] ?? PIECE_CANVAS_W / 2;
        out.set(f.id, {
          cx,
          midY: rowY(depth),
          left: cx - (cells * cellW) / 2,
          cells,
        });
      }
      return out;
    }

    // ── 그리기 ──────────────────────────────────────────────────────────────

    /** 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다. */
    let frameGs = new Map<string, SVGGElement>();
    let linkEls = new Map<string, SVGLineElement>();
    let ringEl: SVGRectElement | null = null;

    function paintBadge(
      parent: SVGGElement,
      mark: string,
      order: number,
      centerX: number,
      centerY: number,
      lit: boolean,
    ): void {
      const badge = shape('g', {});
      badge.appendChild(
        shape('rect', {
          x: centerX - BADGE_W / 2,
          y: centerY - BADGE_H / 2,
          width: BADGE_W,
          height: BADGE_H,
          rx: BADGE_H / 2,
          fill: lit ? palette.accent : 'none',
        }),
      );
      const label = shape('text', {
        x: centerX,
        y: centerY + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: lit ? palette.stateInk : palette.textMuted,
      });
      label.textContent = `${mark}${order}`;
      badge.appendChild(label);
      parent.appendChild(badge);
    }

    /**
     * 자리 하나를 세운다.
     *
     * `values` · `settled` 를 덮어쓸 수 있는 것은 걸음이 **출발 모습으로 되돌려
     * 놓기** 위해서다 (합치기 전의 문제 · 답이 되기 전의 형편). 장면을 고치는 것이
     * 아니라 그 순간의 그림만 바꾸며, 운동이 끝나면 정적 그리기가 통째로 다시
     * 세운다.
     */
    function paintFrame(
      scene: DivideConquerCombineScene,
      lay: Map<string, Place>,
      id: string,
      over?: { values?: readonly number[]; settled?: boolean },
    ): void {
      const g = frameGs.get(id);
      const place = lay.get(id);
      const frame = frameOf(scene, id);
      if (!g || !place || !frame) return;
      clear(g);

      const values = over?.values ?? frame.values;
      const answered = over?.settled ?? frame.settled;
      const active = activeIdOf(scene.mark) === id;
      const y = place.midY - CELL_H / 2;

      for (let slot = 0; slot < place.cells; slot += 1) {
        const x = slotX(place, slot) - cellW / 2;
        g.appendChild(
          shape('rect', {
            x,
            y,
            width: cellW,
            height: CELL_H,
            rx: CELL_R,
            fill: answered ? palette.itemSorted : palette.itemDefault,
            stroke: active ? palette.itemActive : palette.border,
            'stroke-width': active ? 2 : 1,
          }),
        );
        const value = values[slot];
        if (typeof value !== 'number') continue;
        const text = shape('text', {
          x: x + cellW / 2,
          y: y + CELL_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: answered ? palette.textInverse : palette.text,
        });
        text.textContent = String(value);
        g.appendChild(text);
      }

      // 맨 처음 쪼갠 자리가 맨 마지막에 합쳐졌다는 것을 정지 화면으로 남긴다.
      const lit = scene.concluded && id === scene.rootId;
      const right = place.left + place.cells * cellW;
      const down = splitBadge(scene, id);
      const up = mergeBadge(scene, id);
      if (down > 0) {
        paintBadge(g, MARK_DOWN, down, place.left - BADGE_OFFSET - BADGE_W / 2, place.midY, lit);
      }
      if (up > 0) {
        paintBadge(g, MARK_UP, up, right + BADGE_OFFSET + BADGE_W / 2, place.midY, lit);
      }
    }

    /**
     * 이번 걸음의 주인공 자리.
     *
     * 명령형 stage 는 이 강조를 걸음 끝에 되돌려, 되짚으면 어느 자리가 움직였는지
     * 화면에 남지 않았다. 이제 그 걸음 내내 머문다.
     */
    function activeIdOf(mark: DcMark | null): string | null {
      if (!mark) return null;
      return mark.kind === 'split' || mark.kind === 'merge' ? mark.id : null;
    }

    /** 가지의 두 끝 — 부모 칸 아래에서 자식 칸 위로. */
    function linkEnds(
      lay: Map<string, Place>,
      parentId: string,
      childId: string,
    ): { x1: number; y1: number; x2: number; y2: number } | null {
      const p = lay.get(parentId);
      const c = lay.get(childId);
      if (!p || !c) return null;
      return { x1: p.cx, y1: p.midY + CELL_H / 2, x2: c.cx, y2: c.midY - CELL_H / 2 };
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform ·
     * opacity · 보간 끝자리도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: DivideConquerCombineScene): Map<string, Place> {
      clear(linkLayer);
      clear(frameLayer);
      clear(ringLayer);
      clear(flyLayer);
      frameGs = new Map<string, SVGGElement>();
      linkEls = new Map<string, SVGLineElement>();
      ringEl = null;

      const lay = layoutOf(scene);
      const active = activeIdOf(scene.mark);

      for (const frame of scene.frames) {
        if (frame.parentId === null) continue;
        const ends = linkEnds(lay, frame.parentId, frame.id);
        if (!ends) continue;
        const line = shape('line', {
          ...ends,
          stroke: frame.parentId === active ? palette.itemActive : palette.border,
          'stroke-width': 1.5,
        });
        linkLayer.appendChild(line);
        linkEls.set(frame.id, line);
      }

      for (const frame of scene.frames) {
        const g = shape('g', {});
        frameLayer.appendChild(g);
        frameGs.set(frame.id, g);
      }
      for (const frame of scene.frames) paintFrame(scene, lay, frame.id);

      const rootPlace = scene.rootId === null ? undefined : lay.get(scene.rootId);
      if (scene.concluded && rootPlace) {
        // 아직 없는 것은 숨기지 말고 짓지 않는다 — 숨겨 두면 앞 걸음의 수치가
        // 함께 남아 되짚기 판정이 어긋난다.
        ringEl = shape('rect', {
          x: rootPlace.left - 5,
          y: rootPlace.midY - CELL_H / 2 - 5,
          width: rootPlace.cells * cellW + 10,
          height: CELL_H + 10,
          rx: RING_R,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 2,
        });
        ringLayer.appendChild(ringEl);
      }

      return lay;
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: DivideConquerCombineScene): string {
      const cap = scene.caption;
      if (!cap) return '';
      switch (cap.kind) {
        case 'problem':
          return tr('caption.problem', 'One problem: put these values in order.');
        case 'splitRoot':
          return tr('caption.splitRoot', 'Cut it in half. No answer yet — just a smaller problem.');
        case 'split':
          return tr('caption.split', 'Cut again. Still going down.');
        case 'bottom':
          return tr(
            'caption.bottom',
            'A single value is already an answer. The bottom turns the trip around.',
          );
        case 'merge':
          return tr('caption.merge', 'The layer that was cut later is combined first.');
        case 'mergeRoot':
          return tr(
            'caption.mergeRoot',
            'The place cut first is combined last — only now is there one whole answer.',
          );
        case 'done':
          // 쪼갬/합침 횟수는 배지와 같은 배열을 센다 — 두 수가 갈릴 자리가 없다.
          return tr(
            'caption.done',
            '{splits} cuts going down, {merges} combines coming up — the same places, in reverse.',
            { splits: scene.splitSeq.length, merges: scene.mergeSeq.length },
          );
      }
    }

    function drawCaption(scene: DivideConquerCombineScene): void {
      clear(captionLayer);
      const text = captionTextOf(scene);
      if (text === '') return;
      wrapTwoLines(text, captionSize, PIECE_CANVAS_W - SIDE_MIN * 2).forEach((line, i) => {
        const node = shape('text', {
          x: PIECE_CANVAS_W / 2,
          y: captionY + i * CAPTION_LINE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: palette.textMuted,
        });
        node.textContent = line;
        captionLayer.appendChild(node);
      });
    }

    // ── 운동 ────────────────────────────────────────────────────────────────

    /**
     * 이번 걸음에 무엇이 어디서 어디로 가는가.
     *
     * 다섯 걸음이 전부 이 한 함수를 지난다. 내려감과 올라옴은 출발과 도착이 뒤바뀐
     * 같은 꼴이고, 그것이 이 조각이 하려는 말이다.
     */
    function motionOf(scene: DivideConquerCombineScene, lay: Map<string, Place>): Motion {
      const mark = scene.mark;
      if (!mark) return STILL;

      switch (mark.kind) {
        case 'seed':
          return { ...STILL, ms: SEED_MS, entering: [mark.id] };

        case 'split': {
          const parent = lay.get(mark.id);
          const { left, right } = childrenOf(scene, mark.id);
          if (!parent || !left || !right) return STILL;
          const lp = lay.get(left.id);
          const rp = lay.get(right.id);
          if (!lp || !rp) return STILL;

          // 부모 칸에서 복제본이 떨어져 나와 벌어지며 내려간다.
          const flights: Flight[] = [];
          for (let slot = 0; slot < parent.cells; slot += 1) {
            const toLeft = slot < left.values.length;
            const child = toLeft ? lp : rp;
            const childSlot = toLeft ? slot : slot - left.values.length;
            const value = (toLeft ? left.values : right.values)[childSlot];
            if (typeof value !== 'number') continue;
            flights.push({
              value,
              x0: slotX(parent, slot),
              y0: parent.midY,
              x1: slotX(child, childSlot),
              y1: child.midY,
            });
          }
          return {
            ...STILL,
            ms: MOVE_MS,
            bow: SPLIT_BOW,
            flights,
            entering: [left.id, right.id],
            growing: [left.id, right.id],
          };
        }

        case 'settled':
          return { ...STILL, ms: SETTLE_MS, bouncing: mark.ids };

        case 'merge': {
          const parent = lay.get(mark.id);
          const frame = frameOf(scene, mark.id);
          const { left, right } = childrenOf(scene, mark.id);
          if (!parent || !frame || !left || !right) return STILL;
          const lp = lay.get(left.id);
          const rp = lay.get(right.id);
          if (!lp || !rp) return STILL;

          // 자식 칸의 복제본이 부모 자리로 오른다. 오르는 길에 값이 엇갈린다.
          // 어느 칸에서 왔는지는 `reduce` 가 부모의 값을 셈할 때 쓴 함수를 그대로
          // 지난다 — 칸의 글자와 날아온 복제본의 글자가 한 출처다.
          const flights: Flight[] = [];
          mergeSources(mark.from).forEach(({ side, slot }, k) => {
            const source = side === 'L' ? lp : rp;
            const value = frame.values[k];
            if (typeof value !== 'number') return;
            flights.push({
              value,
              x0: slotX(source, slot),
              y0: source.midY,
              x1: slotX(parent, k),
              y1: parent.midY,
            });
          });
          return { ...STILL, ms: MOVE_MS, bow: MERGE_BOW, flights, answered: true };
        }

        case 'conclude':
          return { ...STILL, ms: RING_MS, ring: true };
      }
    }

    /** 날아가는 복제본 하나. 원본은 제자리에 남는다. */
    function makeFlyer(value: number, answered: boolean): SVGGElement {
      const flyer = shape('g', {});
      flyer.appendChild(
        shape('rect', {
          x: -cellW / 2,
          y: -CELL_H / 2,
          width: cellW,
          height: CELL_H,
          rx: CELL_R,
          fill: answered ? palette.itemSorted : palette.itemDefault,
          stroke: palette.itemActive,
          'stroke-width': 2,
        }),
      );
      const text = shape('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: answered ? palette.textInverse : palette.text,
      });
      text.textContent = String(value);
      flyer.appendChild(text);
      flyLayer.appendChild(flyer);
      return flyer;
    }

    /**
     * 걸음 하나 — 끝 모습에서 출발 모습으로 물렸다가 한 시계로 되돌아온다.
     *
     * 시계를 나누지 않는다. 벌어지며 내려가는 복제본과 자라는 가지와 들어서는
     * 자리가 **한 동작**이므로 한 목록에 모아 한 트윈으로 흘린다 (S-scene).
     */
    function flow(
      scene: DivideConquerCombineScene,
      lay: Map<string, Place>,
      mine: number,
    ): Promise<void> {
      const m = motionOf(scene, lay);
      if (m.ms <= 0) return Promise.resolve();

      const flyers = m.flights.map((f) => ({ el: makeFlyer(f.value, m.answered), f }));

      const enteringGs = m.entering
        .map((id) => frameGs.get(id))
        .filter((g): g is SVGGElement => g !== undefined);

      const growingLinks = m.growing
        .map((id) => {
          const el = linkEls.get(id);
          const frame = frameOf(scene, id);
          const ends = frame?.parentId ? linkEnds(lay, frame.parentId, id) : null;
          return el && ends ? { el, ends } : null;
        })
        .filter((v): v is { el: SVGLineElement; ends: { x1: number; y1: number; x2: number; y2: number } } => v !== null);

      // 합쳐진 부모는 **다시 문제로** 되돌려 놓는다. 그 값은 `prev` 가 아니라
      // 아래 잎에서 셈한다 — 잎의 값은 어느 걸음에서도 바뀌지 않는다.
      const mark = scene.mark;
      if (mark?.kind === 'merge') {
        paintFrame(scene, lay, mark.id, {
          values: problemValuesOf(scene, mark.id),
          settled: false,
        });
      }

      let flipped = true;
      if (m.bouncing.length > 0) {
        flipped = false;
        for (const id of m.bouncing) paintFrame(scene, lay, id, { settled: false });
      }

      const draw = (raw: number): void => {
        const e = easeInOut(raw);
        const bow = Math.sin(Math.PI * e) * m.bow;
        for (const { el, f } of flyers) {
          attr(el, {
            transform: `translate(${f.x0 + (f.x1 - f.x0) * e} ${f.y0 + (f.y1 - f.y0) * e + bow})`,
          });
        }
        for (const g of enteringGs) {
          attr(g, { opacity: e, transform: `translate(0 ${(1 - e) * -ENTER_RISE})` });
        }
        for (const { el, ends } of growingLinks) {
          attr(el, {
            x2: ends.x1 + (ends.x2 - ends.x1) * e,
            y2: ends.y1 + (ends.y2 - ends.y1) * e,
          });
        }
        if (m.bouncing.length > 0) {
          const lift = Math.sin(Math.PI * e) * -BOUNCE;
          for (const id of m.bouncing) {
            frameGs.get(id)?.setAttribute('transform', `translate(0 ${lift})`);
          }
          // 꼭대기에서 답이 된다 — 튀어 오르는 것과 채워지는 것이 한 동작이다.
          const answered = raw >= 0.5;
          if (answered !== flipped) {
            flipped = answered;
            for (const id of m.bouncing) paintFrame(scene, lay, id, { settled: answered });
          }
        }
        if (ringEl) ringEl.setAttribute('opacity', String(e));
      };

      // 끝 모습으로 선 것을 출발 모습으로 물려 놓고 시작한다. 정적으로 세운
      // 직후라 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      draw(0);

      return tween(m.ms, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    async function render(
      next: DivideConquerCombineScene,
      /** 출발 모습을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: DivideConquerCombineScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const lay = drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      if (!next.mark) return;

      await flow(next, lay, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리 · opacity · 복제본을 통째로 거둔다. 되돌릴 목록을
      // 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
      drawCaption(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const done of [...pending]) done();
        pending.clear();
        clear(svg);
      },
    };
  },
};
