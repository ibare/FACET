/**
 * rolling-hash-stage — 굴러가는 해시 조각의 그림.
 *
 * ── 형태가 어디서 나왔는가
 * 동사는 **굴러간다**. 그래서 해시는 숫자 칸이 아니라 **바퀴**다. 글자 줄 아래
 * 레일이 깔려 있고, 창이 한 칸 밀릴 때 바퀴가 그 레일 위를 실제로 굴러간다
 * (회전각 = 이동거리 / 반지름, 참된 구름). 값은 옮겨 적히는 것이 아니라 굴러가서
 * 다음 값이 된다.
 *
 * 창이 한 칸 갈 때 만지는 것은 둘뿐이라는 것이 이 조각의 주장이므로, 창 안의 네
 * 글자를 물들이지 않는다. 대신 **빠지는 글자와 들어오는 글자에만 표식이 서고, 그
 * 둘의 몫(−빼는 값 · +더하는 값)이 각자의 글자 위에 남는다.**
 *
 * 바퀴가 지나간 자리마다 값이 레일 아래에 남아, 창이 한 바퀴 돌아 같은 네 글자로
 * 돌아왔을 때 처음 값과 같은 수가 양 끝에 서는 것이 보인다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showPattern()` · `openWindow()` · `roll()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면 **전체**를 세우고,
 * 방금 달라진 자리만 흐르게 한다 (S-scene).
 *
 * 정적 그리기가 정본이므로 운동의 방향이 뒤집힌다 — 요소는 이미 끝 자리에 서 있고,
 * 흐르게 할 때만 출발 그림으로 되돌려 놓고 시작한다. 그 출발 그림은 `prev` 를
 * 들추지 않고 **장면이 쥔 자취**(`marks`)에서 셈으로 복원한다 — 옛 stage 가
 * `spinDeg` 라는 화면의 거울을 들고 다니며 출발값으로 삼던 자리다.
 *
 * ## 만진 글자의 표식은 남는다
 *
 * 채움은 **값의 형편**(창 안인가 밖인가), 테두리는 **짚음의 표식**(이번에 들어왔나 ·
 * 이번에 빠졌나)이다. 두 축을 갈라 두어야 "창 안이면서 방금 읽힌 글자" 와 "창 밖으로
 * 나가며 빠진 글자" 가 한 화면에 함께 선다. 첫 창은 표식이 창 너비만큼 서고 구르기는
 * 둘만 서므로, **다시 셈하지 않았다는 것**이 정지 화면에 대비로 남는다.
 *
 * 세로는 이 파일이 정하고 가로는 러너가 정한다 (S-piece). 색은 전부
 * design-tokens 경유이며 hex 리터럴은 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { RollingHashCaption, RollingHashScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 내용이 정한다 — 기준 자리 · 몫 칩 · 글자 줄 · 레일 · 자취 · 캡션. */
const STAGE_H = 280;

const SIDE_MIN = 26;
const CELL_MAX_W = 64;
const CELL_H = 52;
const ROW_Y = 100;
const FRAME_PAD = 8;

const CHIP_TOP = 62;
const CHIP_H = 22;

const RAIL_Y = 216;
const WHEEL_R = 22;
const TRAIL_Y = 234;
const WRAP_TICK_Y = 242;
const CAPTION_Y = 266;

const TARGET_Y = 22;
const TARGET_CELL_W = 30;
const TARGET_CELL_H = 30;
const TARGET_PILL_W = 56;
const TARGET_GAP = 12;

const ROW_MID_Y = ROW_Y + CELL_H / 2;
const CHIP_MID_Y = CHIP_TOP + CHIP_H / 2;
const FRAME_Y = ROW_Y - FRAME_PAD;
const FRAME_H = CELL_H + FRAME_PAD * 2;
const WHEEL_Y = RAIL_Y - WHEEL_R;
const DEG_PER_RAD = 180 / Math.PI;

/** 창틀이 처음 좁혀 들어올 때의 여유. */
const FRAME_SLACK = 14;
/** 첫 창의 바퀴가 내려앉는 높이와 그때 되감기는 각. */
const WHEEL_DROP = 34;
const WHEEL_DROP_DEG = 150;
/** 자취가 떨어지는 높이. */
const TRAIL_RISE = 9;
/** 들어오는 몫이 내려오는 높이. */
const CHIP_RISE = 26;

// ── 걸음별 운동 길이 (ms). stepMs 의 쉼 위에 얹힌다 (S-piece 의 걸음 벽시계).
const MS_TARGET_IN = 300;
const MS_FRAME_IN = 220;
const MS_READ_ONE = 110;
const MS_WHEEL_IN = 280;
const MS_ROLL = 460;
const MS_VALUE_POP = 170;
const MS_TRAIL = 180;
const MS_RECAP = 620;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 범위 밖이면 `null`. 색인 접근이 타입으로는 늘 값을 주기 때문에 여기서 가린다. */
function at<T>(items: readonly T[], i: number): T | null {
  return i >= 0 && i < items.length ? items[i] : null;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * 장면이 정하는 배치. 좌표는 장면에 담지 않으므로 여기서 역산한다 (S-piece).
 *
 * 이름을 `Layout` 으로 둔다 — 이 파일에서 `Scene` 은 장면의 것이다 (프로토콜 4 절).
 */
type Layout = {
  letters: string[];
  patternLetters: string[];
  patLen: number;
  cellW: number;
  rowW: number;
  originX: number;
  lastStart: number;
};

/** 이번 걸음이 그 칸에 남긴 표식. 채움(창 안/밖)과 다른 축이다. */
type CellMark = 'read' | 'gone' | null;

export const rollingHashStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RollingHashScene> {
    const palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    const root = el('g');
    svg.appendChild(root);

    // ── 뒷일 정리 채널 (S-piece) ─────────────────────────────────────────
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 이 조각의 걸음은 마디가 이어진 사슬이다 (창틀 → 읽기 → 바퀴 → 자취,
     * 또는 구름 → 값 튀기 → 자취). 중간에 되짚기가 끼어들면 남은 마디들이 깨어나
     * 이미 새로 선 화면을 덮는다. 정적 그리기가 매번 다시 짓기는 하지만 그것이
     * 다시 만드는 것은 **노드**이지 옛 운동이 쥔 **손잡이**가 아니다 — 옛 세대가
     * `root` 에 임시 노드를 붙일 여지가 남는다. 마디마다 자기 번호를 보고 아니면
     * 화면에 손대지 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function wait(ms: number, live: () => boolean): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || !live()) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /**
     * 취소 가능한 시간 진행.
     *
     * 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧 덮어쓰기다.
     */
    function animate(ms: number, onFrame: (e: number) => void, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        onFrame(1);
        return Promise.resolve();
      }
      // 첫 프레임을 동기로 세워 둔다 — 그러지 않으면 정적 그리기가 세운 끝 자리가
      // 한 프레임 번쩍인다.
      onFrame(0);
      return new Promise<void>((resolve) => {
        let id = 0;
        let origin = -1;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (settled) return;
          if (destroyed || !live()) {
            finish();
            return;
          }
          if (origin < 0) origin = now;
          const p = ms <= 0 ? 1 : clamp01((now - origin) / ms);
          onFrame(easeInOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 배치 ─────────────────────────────────────────────────────────────

    function layoutOf(scene: RollingHashScene): Layout {
      const letters = scene.text.split('');
      const patternLetters = scene.pattern.split('');
      const cellCount = Math.max(1, letters.length);
      const patLen = Math.max(1, patternLetters.length);
      // 그 폭을 채운다 — 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
      const cellW = Math.min(
        CELL_MAX_W,
        Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / cellCount),
      );
      const rowW = cellW * cellCount;
      return {
        letters,
        patternLetters,
        patLen,
        cellW,
        rowW,
        originX: Math.round((PIECE_CANVAS_W - rowW) / 2),
        lastStart: letters.length - patLen,
      };
    }

    const cellX = (L: Layout, i: number): number => L.originX + i * L.cellW;
    const cellMidX = (L: Layout, i: number): number => cellX(L, i) + L.cellW / 2;
    const frameX = (L: Layout, start: number): number => cellX(L, start) - FRAME_PAD;
    const frameW = (L: Layout): number => L.cellW * L.patLen + FRAME_PAD * 2;
    const windowMidX = (L: Layout, start: number): number =>
      L.originX + (start + L.patLen / 2) * L.cellW;

    /** 참된 구름 — 회전각은 굴러온 거리를 반지름으로 나눈 값이다. */
    const spinAt = (L: Layout, start: number): number =>
      ((windowMidX(L, start) - windowMidX(L, 0)) / WHEEL_R) * DEG_PER_RAD;

    // ── 장면이 세우는 손잡이들. 매 render 마다 새로 세운다. ────────────────
    let lay: Layout | null = null;
    let cellRects: SVGRectElement[] = [];
    let cellTexts: SVGTextElement[] = [];
    let trailNodes: SVGTextElement[] = [];
    let tickNodes: SVGLineElement[] = [];
    let frameEl: SVGRectElement | null = null;
    let connectorEl: SVGLineElement | null = null;
    let wheelG: SVGGElement | null = null;
    let spokeG: SVGGElement | null = null;
    let wheelFace: SVGCircleElement | null = null;
    let wheelValue: SVGTextElement | null = null;
    let targetG: SVGGElement | null = null;
    let minusChip: SVGGElement | null = null;
    let plusChip: SVGGElement | null = null;
    let recapEl: SVGLineElement | null = null;

    /** 늘 비우고 시작한다 (S-scene). 재건 밖 요소를 하나도 남기지 않는다. */
    function clearAll(): void {
      root.textContent = '';
      lay = null;
      cellRects = [];
      cellTexts = [];
      trailNodes = [];
      tickNodes = [];
      frameEl = null;
      connectorEl = null;
      wheelG = null;
      spokeG = null;
      wheelFace = null;
      wheelValue = null;
      targetG = null;
      minusChip = null;
      plusChip = null;
      recapEl = null;
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 지금 창의 왼쪽 끝. 아직 창이 열리지 않았으면 `null`. */
    function startOf(scene: RollingHashScene): number | null {
      return scene.marks.length > 0 ? scene.marks.length - 1 : null;
    }

    function isMatch(scene: RollingHashScene, hash: number): boolean {
      return scene.patternHash !== null && hash === scene.patternHash;
    }

    /**
     * 칸 하나를 칠한다.
     *
     * **채움은 값의 형편**(창 안인가 밖인가), **테두리는 짚음의 표식**(이번에
     * 들어왔나 · 이번에 빠졌나). 두 축이 부딪히지 않아 "창 안이면서 방금 읽힌 글자"
     * 와 "밖으로 나가며 빠진 글자" 가 한 화면에 함께 선다. 어휘도 갈라 둔다 —
     * 들어온 것은 실선, 빠진 것은 파선이다.
     */
    function paintCell(i: number, inside: boolean, mark: CellMark): void {
      const rect = at(cellRects, i);
      const label = at(cellTexts, i);
      if (rect === null || label === null) return;
      rect.setAttribute('fill', inside ? palette.bgSubtle : palette.itemDefault);
      if (mark === 'read') {
        rect.setAttribute('stroke', palette.itemComparing);
        rect.setAttribute('stroke-width', '3');
        rect.removeAttribute('stroke-dasharray');
      } else if (mark === 'gone') {
        rect.setAttribute('stroke', palette.itemSwapping);
        rect.setAttribute('stroke-width', '3');
        rect.setAttribute('stroke-dasharray', '4 3');
      } else {
        rect.setAttribute('stroke', palette.border);
        rect.setAttribute('stroke-width', '1');
        rect.removeAttribute('stroke-dasharray');
      }
      label.setAttribute('fill', palette.text);
    }

    function markOf(scene: RollingHashScene, i: number): CellMark {
      if (scene.readAt.includes(i)) return 'read';
      if (scene.goneAt === i) return 'gone';
      return null;
    }

    function drawRail(L: Layout): void {
      root.appendChild(
        el('line', {
          x1: L.originX,
          y1: RAIL_Y,
          x2: L.originX + L.rowW,
          y2: RAIL_Y,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );
      const label = el('text', {
        x: L.originX,
        y: WHEEL_Y + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      label.textContent = t('label.hash', 'hash');
      root.appendChild(label);
    }

    /** 바퀴가 지나온 길. 총평 걸음에서만 짓는다 — 아직 없는 것은 짓지 않는다. */
    function drawRecap(scene: RollingHashScene, L: Layout): void {
      if (!scene.done || L.lastStart < 0) return;
      recapEl = el('line', {
        x1: windowMidX(L, 0),
        y1: RAIL_Y,
        x2: windowMidX(L, L.lastStart),
        y2: RAIL_Y,
        stroke: palette.text,
        'stroke-width': 3,
        'stroke-linecap': 'round',
        opacity: 1,
      });
      root.appendChild(recapEl);
    }

    /** 기준 자리 — 찾는 조각과 그 해시. */
    function drawTarget(scene: RollingHashScene, L: Layout): void {
      const bandW = L.patLen * TARGET_CELL_W + TARGET_GAP + TARGET_PILL_W;
      const x0 = L.originX + L.rowW - bandW;

      const label = el('text', {
        x: x0 - 10,
        y: TARGET_Y + TARGET_CELL_H / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      label.textContent = t('label.pattern', 'pattern');
      root.appendChild(label);

      L.patternLetters.forEach((ch, i) => {
        root.appendChild(
          el('rect', {
            x: x0 + i * TARGET_CELL_W,
            y: TARGET_Y,
            width: TARGET_CELL_W,
            height: TARGET_CELL_H,
            rx: 5,
            fill: palette.bgSubtle,
            stroke: palette.border,
            'stroke-width': 1,
          }),
        );
        const glyph = el('text', {
          x: x0 + i * TARGET_CELL_W + TARGET_CELL_W / 2,
          y: TARGET_Y + TARGET_CELL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: palette.text,
        });
        glyph.textContent = ch;
        root.appendChild(glyph);
      });

      // 아직 셈하지 않았으면 알약 자체를 짓지 않는다 (숨기지 않는다).
      if (scene.patternHash === null) return;

      const start = startOf(scene);
      const here = start === null ? null : at(scene.marks, start);
      const match = here !== null && isMatch(scene, here.hash);

      const pillX = x0 + L.patLen * TARGET_CELL_W + TARGET_GAP;
      const g = el('g', { opacity: 1, transform: 'translate(0 0)' });
      g.appendChild(
        el('rect', {
          x: pillX,
          y: TARGET_Y,
          width: TARGET_PILL_W,
          height: TARGET_CELL_H,
          rx: TARGET_CELL_H / 2,
          fill: match ? palette.itemPivot : palette.itemDefault,
          stroke: palette.text,
          'stroke-width': 1.5,
        }),
      );
      const value = el('text', {
        x: pillX + TARGET_PILL_W / 2,
        y: TARGET_Y + TARGET_CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: match ? palette.stateInk : palette.text,
      });
      value.textContent = String(scene.patternHash);
      g.appendChild(value);
      root.appendChild(g);
      targetG = g;
    }

    /** 글자 줄. 창 안팎은 채움으로, 이번에 만진 글자는 테두리로 말한다. */
    function drawRow(scene: RollingHashScene, L: Layout): void {
      const start = startOf(scene);
      L.letters.forEach((ch, i) => {
        const rect = el('rect', {
          x: cellX(L, i),
          y: ROW_Y,
          width: L.cellW,
          height: CELL_H,
          rx: 6,
        });
        root.appendChild(rect);
        cellRects.push(rect);

        const glyph = el('text', {
          x: cellMidX(L, i),
          y: ROW_MID_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: palette.text,
        });
        glyph.textContent = ch;
        root.appendChild(glyph);
        cellTexts.push(glyph);
      });

      for (let i = 0; i < L.letters.length; i += 1) {
        const inside = start !== null && i >= start && i < start + L.patLen;
        paintCell(i, inside, markOf(scene, i));
      }
    }

    /** 창틀 · 이음줄 · 바퀴. 창이 열린 뒤에만 짓는다. */
    function drawWindow(scene: RollingHashScene, L: Layout): void {
      const start = startOf(scene);
      if (start === null) return;
      const here = at(scene.marks, start);
      if (here === null) return;
      const match = isMatch(scene, here.hash);
      const midX = windowMidX(L, start);

      frameEl = el('rect', {
        x: frameX(L, start),
        y: FRAME_Y,
        width: frameW(L),
        height: FRAME_H,
        rx: 10,
        fill: 'none',
        stroke: palette.text,
        'stroke-width': 2,
        opacity: 1,
      });
      root.appendChild(frameEl);

      connectorEl = el('line', {
        x1: midX,
        y1: FRAME_Y + FRAME_H,
        x2: midX,
        y2: WHEEL_Y - WHEEL_R,
        stroke: palette.border,
        'stroke-width': 2,
        opacity: 1,
      });
      root.appendChild(connectorEl);

      const g = el('g', { opacity: 1, transform: `translate(${midX} ${WHEEL_Y})` });
      wheelFace = el('circle', {
        cx: 0,
        cy: 0,
        r: WHEEL_R,
        fill: match ? palette.itemPivot : palette.itemDefault,
        stroke: palette.text,
        'stroke-width': 2,
      });
      g.appendChild(wheelFace);

      spokeG = el('g', { transform: `rotate(${spinAt(L, start)})` });
      spokeG.appendChild(
        el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: -WHEEL_R,
          stroke: palette.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
      g.appendChild(spokeG);

      wheelValue = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: match ? palette.stateInk : palette.text,
      });
      wheelValue.textContent = String(here.hash);
      g.appendChild(wheelValue);

      root.appendChild(g);
      wheelG = g;
    }

    function makeChip(label: string, fill: string, midX: number, midY: number): SVGGElement {
      const w = 18 + label.length * 8;
      const g = el('g', { transform: `translate(${midX} ${midY})`, opacity: 1 });
      g.appendChild(
        el('rect', {
          x: -w / 2,
          y: -CHIP_H / 2,
          width: w,
          height: CHIP_H,
          rx: 6,
          fill,
          stroke: palette.stateInk,
          'stroke-width': 1,
        }),
      );
      const text = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: palette.stateInk,
      });
      text.textContent = label;
      g.appendChild(text);
      root.appendChild(g);
      return g;
    }

    /**
     * 이번 구르기의 두 몫. 각자 제 글자 위에 선다 — 빠진 글자 위에 빼는 값,
     * 들어온 글자 위에 더하는 값. **잰 값은 재는 그 자리에 남긴다** (S-piece).
     */
    function drawTerms(scene: RollingHashScene, L: Layout): void {
      const terms = scene.terms;
      if (terms === null) return;
      if (scene.goneAt !== null) {
        minusChip = makeChip(
          `−${terms.minus}`,
          palette.itemSwapping,
          cellMidX(L, scene.goneAt),
          CHIP_MID_Y,
        );
      }
      const inAt = at(scene.readAt, scene.readAt.length - 1);
      if (inAt !== null) {
        plusChip = makeChip(
          `+${terms.plus}`,
          palette.itemComparing,
          cellMidX(L, inAt),
          CHIP_MID_Y,
        );
      }
    }

    /** 바퀴가 남긴 자취와, 같은 글자로 돌아온 자리의 눈금. */
    function drawTrail(scene: RollingHashScene, L: Layout): void {
      scene.marks.forEach((mark, s) => {
        const node = el('text', {
          x: windowMidX(L, s),
          y: TRAIL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          // 값의 형편 — 조각과 같은 수인가. 한 바퀴 돌았나는 아래 눈금이 말한다.
          fill: isMatch(scene, mark.hash) ? palette.text : palette.textMuted,
          opacity: 1,
        });
        node.textContent = String(mark.hash);
        root.appendChild(node);
        trailNodes.push(node);
      });

      if (scene.wrapAt.length === 0) return;
      for (const s of [0, ...scene.wrapAt]) {
        const tick = el('line', {
          x1: windowMidX(L, s) - 13,
          y1: WRAP_TICK_Y,
          x2: windowMidX(L, s) + 13,
          y2: WRAP_TICK_Y,
          stroke: palette.text,
          'stroke-width': 2,
          'stroke-linecap': 'round',
          opacity: 1,
        });
        root.appendChild(tick);
        tickNodes.push(tick);
      }
    }

    function captionText(cap: RollingHashCaption): string {
      switch (cap.kind) {
        case 'pattern':
          return t('caption.pattern', 'Hash of the pattern: {h}.', { h: cap.h });
        case 'first':
          return t('caption.first', 'The first window reads every letter. Hash: {h}.', {
            h: cap.h,
          });
        case 'roll':
          return t('caption.roll', 'Two touches: one letter out, one in. Hash: {h}.', {
            h: cap.h,
          });
        case 'match':
          return t('caption.match', 'The same hash as the pattern: {h}.', { h: cap.h });
        case 'wrapped':
          return t('caption.wrapped', 'Back to the same letters, and the same hash: {h}.', {
            h: cap.h,
          });
        case 'done':
          return t(
            'caption.done',
            '{windows} windows, {rolls} rolls — letters touched per roll: {touches}.',
            { windows: cap.windows, rolls: cap.rolls, touches: cap.touches },
          );
      }
    }

    function drawCaption(cap: RollingHashCaption | null): void {
      const node = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.text,
      });
      node.textContent = cap === null ? '' : captionText(cap);
      root.appendChild(node);
    }

    function drawStatic(scene: RollingHashScene): void {
      clearAll();
      const L = layoutOf(scene);
      lay = L;
      drawRail(L);
      drawRecap(scene, L);
      drawTarget(scene, L);
      drawRow(scene, L);
      drawWindow(scene, L);
      drawTerms(scene, L);
      drawTrail(scene, L);
      drawCaption(scene.caption);
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 출발 그림으로
    // 되돌려 놓고 시작한다. 출발 그림은 `prev` 를 들추지 않고 장면이 쥔 자취에서
    // 셈으로 얻는다 (S-scene).

    /** 찾는 조각의 해시가 위에서 내려앉는다. */
    async function flowTarget(live: () => boolean): Promise<void> {
      const g = targetG;
      if (g === null) return;
      await animate(
        MS_TARGET_IN,
        (e) => {
          g.setAttribute('transform', `translate(0 ${-18 * (1 - e)})`);
          g.setAttribute('opacity', String(e));
        },
        live,
      );
    }

    /** 첫 창 — 창틀이 좁혀 들어오고, 글자를 하나씩 다 읽고, 바퀴가 내려앉는다. */
    async function flowFirst(live: () => boolean): Promise<void> {
      const L = lay;
      const frame = frameEl;
      const wheel = wheelG;
      const spoke = spokeG;
      const conn = connectorEl;
      const trail = at(trailNodes, 0);
      if (L === null || frame === null || wheel === null || spoke === null) return;

      // 아직 못 온 만큼을 뒤로 물린다.
      wheel.setAttribute('opacity', '0');
      conn?.setAttribute('opacity', '0');
      trail?.setAttribute('opacity', '0');
      for (let i = 0; i < L.letters.length; i += 1) paintCell(i, false, null);

      await animate(
        MS_FRAME_IN,
        (e) => {
          const slack = FRAME_SLACK * (1 - e);
          frame.setAttribute('x', String(frameX(L, 0) - slack));
          frame.setAttribute('width', String(frameW(L) + slack * 2));
        },
        live,
      );
      if (!live()) return;

      // 창 안의 글자를 하나씩 다 읽는다 — 이 조각이 덜어 내려는 값이다.
      for (let k = 0; k < L.patLen; k += 1) {
        paintCell(k, true, 'read');
        await wait(MS_READ_ONE, live);
        if (!live()) return;
      }

      conn?.setAttribute('opacity', '1');
      await animate(
        MS_WHEEL_IN,
        (e) => {
          const midX = windowMidX(L, 0);
          wheel.setAttribute(
            'transform',
            `translate(${midX} ${WHEEL_Y - WHEEL_DROP * (1 - e)})`,
          );
          spoke.setAttribute('transform', `rotate(${-WHEEL_DROP_DEG * (1 - e)})`);
          wheel.setAttribute('opacity', String(e));
        },
        live,
      );
      if (!live()) return;

      await dropTrail(trail, live);
    }

    /**
     * 구르기 — 빠지는 글자와 들어오는 글자는 **한 뜻으로 묶인 운동**이라 시계를
     * 둘로 나누지 않는다. 창틀·바퀴·두 몫을 한 목록에 모아 한 시계로 흘린다.
     */
    async function flowRoll(scene: RollingHashScene, live: () => boolean): Promise<void> {
      const L = lay;
      const frame = frameEl;
      const wheel = wheelG;
      const spoke = spokeG;
      const face = wheelFace;
      const value = wheelValue;
      const conn = connectorEl;
      const minus = minusChip;
      const plus = plusChip;
      if (L === null || frame === null || wheel === null || spoke === null) return;
      if (face === null || value === null) return;

      const start = scene.marks.length - 1;
      const before = at(scene.marks, start - 1);
      const here = at(scene.marks, start);
      if (start < 1 || before === null || here === null) return;

      const outAt = scene.goneAt;
      const inAt = at(scene.readAt, scene.readAt.length - 1);
      const trail = at(trailNodes, start);

      const fromMid = windowMidX(L, start - 1);
      const toMid = windowMidX(L, start);
      const fromDeg = spinAt(L, start - 1);
      const toDeg = spinAt(L, start);
      const wasMatch = isMatch(scene, before.hash);

      // 아직 못 온 만큼을 뒤로 물린다 — 앞 장면을 들추지 않고 자취에서 셈한다.
      value.textContent = String(before.hash);
      face.setAttribute('fill', wasMatch ? palette.itemPivot : palette.itemDefault);
      value.setAttribute('fill', wasMatch ? palette.stateInk : palette.text);
      trail?.setAttribute('opacity', '0');
      const freshTicks = at(scene.wrapAt, scene.wrapAt.length - 1) === start;
      if (freshTicks) for (const tick of tickNodes) tick.setAttribute('opacity', '0');

      await animate(
        MS_ROLL,
        (e) => {
          frame.setAttribute('x', String(frameX(L, start - 1) + L.cellW * e));
          const midX = fromMid + (toMid - fromMid) * e;
          wheel.setAttribute('transform', `translate(${midX} ${WHEEL_Y})`);
          spoke.setAttribute('transform', `rotate(${fromDeg + (toDeg - fromDeg) * e})`);
          conn?.setAttribute('x1', String(midX));
          conn?.setAttribute('x2', String(midX));
          // 빠지는 몫은 글자에서 떠오르고, 들어오는 몫은 위에서 내려온다.
          if (outAt !== null && minus !== null) {
            const y = ROW_MID_Y + (CHIP_MID_Y - ROW_MID_Y) * e;
            minus.setAttribute('transform', `translate(${cellMidX(L, outAt)} ${y})`);
            minus.setAttribute('opacity', String(e));
          }
          if (inAt !== null && plus !== null) {
            const y = CHIP_MID_Y - CHIP_RISE * (1 - e);
            plus.setAttribute('transform', `translate(${cellMidX(L, inAt)} ${y})`);
            plus.setAttribute('opacity', String(e));
          }
          // 창틀이 지나가면 두 글자의 소속이 바뀐다.
          const crossed = e >= 0.5;
          if (outAt !== null) paintCell(outAt, !crossed, crossed ? 'gone' : null);
          if (inAt !== null) paintCell(inAt, crossed, crossed ? 'read' : null);
        },
        live,
      );
      if (!live()) return;

      // 굴러온 값이 다음 값이 된다.
      const match = isMatch(scene, here.hash);
      value.textContent = String(here.hash);
      face.setAttribute('fill', match ? palette.itemPivot : palette.itemDefault);
      value.setAttribute('fill', match ? palette.stateInk : palette.text);
      await animate(
        MS_VALUE_POP,
        (e) => {
          value.setAttribute('transform', `scale(${1 + Math.sin(Math.PI * e) * 0.18})`);
        },
        live,
      );
      if (!live()) return;

      await dropTrail(trail, live, freshTicks ? tickNodes : []);
    }

    /** 굴러온 값이 레일 아래에 내려앉는다. */
    async function dropTrail(
      node: SVGTextElement | null,
      live: () => boolean,
      ticks: readonly SVGLineElement[] = [],
    ): Promise<void> {
      if (node === null && ticks.length === 0) return;
      await animate(
        MS_TRAIL,
        (e) => {
          node?.setAttribute('opacity', String(e));
          node?.setAttribute('y', String(TRAIL_Y - TRAIL_RISE * (1 - e)));
          for (const tick of ticks) tick.setAttribute('opacity', String(e));
        },
        live,
      );
    }

    /** 바퀴가 지나온 길이 한 줄로 그어진다. */
    async function flowRecap(live: () => boolean): Promise<void> {
      const L = lay;
      const line = recapEl;
      if (L === null || line === null) return;
      const from = windowMidX(L, 0);
      const to = windowMidX(L, L.lastStart);
      await animate(
        MS_RECAP,
        (e) => {
          line.setAttribute('x2', String(from + (to - from) * e));
          // 길이 0 인 선이 둥근 끝을 만나면 점이 된다 — 그을 때까지는 없게 둔다.
          line.setAttribute('opacity', String(clamp01(e * 8)));
        },
        live,
      );
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: RollingHashScene,
      _prev: RollingHashScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => alive(mine);

      drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'pattern':
          await flowTarget(live);
          break;
        case 'first':
          await flowFirst(live);
          break;
        case 'roll':
          await flowRoll(next, live);
          break;
        case 'done':
          await flowRecap(live);
          break;
      }

      if (!live()) return;
      // 흐르며 남은 속성·보간의 끝자리·임시 노드가 통째로 사라진다. 정적 경로가
      // 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
