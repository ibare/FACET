/**
 * scan-until-found-stage — 순차 탐색 조각(piece) 의 그림.
 *
 * ── 화면이 무엇으로 이루어져 있는가
 *
 *        ┌ 눈길 ─ 찾는 값을 들고 줄 위를 오른쪽으로 미끄러진다
 *        ▼
 *   [5][8][2][9][4]                ← 줄. 서 있지 않다. 한 벌뿐이고 두 번 훑린다
 *    ┆  ┆  ┆  ┆  ┆
 *                4
 *  (9)▓▓▓▓▓▓▓▓▓▓▌                  ← 첫 훑기의 자취. 찾은 자리에서 벽에 막혀 멎었다
 *                      5
 *  (6)▓▓▓▓▓▓▓▓▓▓▓▓▓▶︎               ← 둘째 훑기의 자취. 줄 끝을 지나 밖으로 나갔다
 *              ├─────┤             ← 두 자취의 길이 차이
 *
 * 줄은 한 벌만 그린다. 같은 눈길이 그 한 줄을 두 번 지나가고, 지나간 자취만
 * 아래에 한 줄씩 쌓인다. 두 자취가 나란히 놓이므로 길이를 눈으로 견줄 수 있다.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `rewind()` · `setCaption()` · `beginPass()` · `look()` · `hit()` ·
 * `overrun()` · `conclude()` 일곱이 통째로 사라졌다.
 *
 * 함께 사라진 것이 셋 더 있다. 자취가 몇 칸인지를 `<g>` 의 자식 수로만 쥐던
 * `Lane.marks`, 자취가 닿은 오른쪽 끝을 쥐던 `let farEndX`, 그리고 눈길이 어느
 * 단계에 있는지를 `transform` 문자열 안에만 적어 두던 자리. 셋 다 장면이 말한다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편** — 아직 안 보았나 · 보았더니 다르더냐 · 같더냐. **테두리는
 * 짚음의 표식** — 여기까지 보았다. 옮기기 전에는 한 상태가 `fill` 과 `stroke` 를
 * 함께 정해 두 뜻이 한 채널에 겹쳐 있었고, 그래서 "보았는데 달랐다" 와 "아직 안
 * 보았다" 를 회색 한 칠이 겸했다. 갈라 두면 부딪히지 않는다.
 *
 * 칠의 어휘를 셋으로 고정한다 — `itemComparing` 은 **짚음**(테두리 · 자취 토막),
 * `itemPivot` 은 **값이 같다**(칸 채움 · 멎게 한 벽), `danger` 는 **줄 밖**(화살).
 *
 * ── 운동
 *
 * 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 흐르게 할 때만 **출발
 * 그림으로 도로 물려 놓고** 시작하며, 운동이 끝나면 장면을 통째로 다시 세워 흐른
 * 화면과 곧바로 세운 화면이 속성 하나만큼도 갈리지 않게 한다 (S-scene).
 *
 * CSS transition 은 하나도 쓰지 않는다. 되짚기는 `animate: false` 로 오는데
 * transition 이 걸려 있으면 그 뒤에도 화면이 저 혼자 흘러간다.
 *
 * ── 뒷일
 *
 * 스스로 다음 회차를 예약하는 루프는 없다. `destroy()` 가 걸어 둔 프레임을 모두
 * 거두면서 **기다리던 약속을 풀어 준다** — 취소된 프레임은 아예 불리지 않으므로
 * 그것을 빼면 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  gazeOf,
  tallyOf,
  type ScanCaption,
  type ScanPass,
  type ScanStep,
  type ScanUntilFoundScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로. 크기는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const W = PIECE_CANVAS_W;
/** 자취 왼쪽에 「찾는 값」 칩이 설 자리. */
const ROW_LEFT = 40;
/** 줄 오른쪽에 남겨 두는 자리. 여기가 「줄 밖」 이다 — 여백이 아니라 내용이다. */
const EXIT_MIN = 100;
const CELL_MAX_W = 96;
const CELL_GAP = 4;

// ── 세로.
const PROBE_Y = 12;
const PROBE_H = 28;
const PROBE_W = 46;
const POINTER_H = 9;
const ROW_Y = 50;
const ROW_H = 48;
const LANES_TOP = 126;
const LANE_H = 22;
const LANE_GAP = 24;
const CHIP = 22;
const CHIP_GAP = 8;

/** 벽의 굵기와, 위아래로 자취보다 더 나오는 몫. */
const WALL_W = 6;
const WALL_OVER = 5;

/**
 * 훑기 두 번 기준 세로 (126 + 2·22 + 24 + 16 + 24 + 12). 훑기 수가 다르면 정적
 * 그리기가 매번 다시 잰다 — `init()` 이 사라졌으므로 세로도 장면이 정한다.
 */
const DEFAULT_H = 246;

// ── 지속시간. 걸음 벽시계(운동 + stepMs)가 800ms 아래로 떨어지지 않게 잡는다 (S-piece).
const MS_ENTER = 300;
const MS_LOOK = 280;
const MS_STOP = 280;
const MS_EXIT = 500;
const MS_MEASURE = 420;

/** 벽에 막혀 멎을 때 눈길이 튕기는 몫. */
const BUMP = 6;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** 칸이 말하는 **값의 형편**. 테두리(짚음)와 갈라 둔 채움 쪽 어휘다. */
type Verdict = 'unknown' | 'differs' | 'same';

export const scanUntilFoundStageView: CanvasView = {
  canvas: { height: DEFAULT_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ScanUntilFoundScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g');
    svg.appendChild(root);

    // 레이어 순서: 눈금 → 줄 → 자취 → 자 → 눈길. 다섯 다 장면마다 통째로 다시 짓는다.
    const gGrid = el('g');
    const gRow = el('g');
    const gLanes = el('g');
    const gMeasure = el('g');
    const gProbe = el('g');
    root.append(gGrid, gRow, gLanes, gMeasure, gProbe);

    // ── 고정 자리의 캡션 한 줄. 다시 짓지 않고 내용만 갈아 낀다. 재건 밖에 있으므로
    //    정적 경로가 **매번 명시로** 내용과 자리를 쓴다 (빈 줄도 명시로 쓴다).
    const caption = el('text', {
      x: W / 2,
      y: DEFAULT_H - 12,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    root.appendChild(caption);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 걸음 함수가 `await` 를 지나므로, 살아남은 앞 세대가 새로 선 화면을 덮지
     * 못하게 한다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeInOut(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 기하. 자리는 장면의 구조에서 역산한다 (S-piece).
    let n = 1;
    let passCount = 1;
    let cellW = CELL_MAX_W;
    let cellBoxW = CELL_MAX_W - CELL_GAP;
    let rowEnd = ROW_LEFT;
    let tipX = W - 16;
    let lanesBottom = LANES_TOP;
    let measureY = LANES_TOP;
    let height = DEFAULT_H;

    function layout(scene: ScanUntilFoundScene): void {
      n = Math.max(1, scene.values.length);
      passCount = Math.max(1, scene.queries.length);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - ROW_LEFT - EXIT_MIN) / n));
      cellBoxW = cellW - CELL_GAP;
      rowEnd = ROW_LEFT + n * cellW;
      tipX = W - 16;
      lanesBottom = LANES_TOP + passCount * LANE_H + (passCount - 1) * LANE_GAP;
      measureY = lanesBottom + 16;
      height = measureY + 24 + 12;
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    }

    const laneTop = (pass: number): number => LANES_TOP + pass * (LANE_H + LANE_GAP);
    const cellX = (i: number): number => ROW_LEFT + i * cellW;
    const cellCenter = (i: number): number => cellX(i) + cellBoxW / 2;
    /** 앞에서부터 `seen` 칸까지 자취가 닿은 오른쪽 끝. */
    const trailEnd = (seen: number): number => ROW_LEFT + seen * cellW;

    // ── 눈길이 설 자리들. 단계를 좌표로 옮기는 것은 그리는 쪽의 몫이다.
    const OFF_LEFT = -PROBE_W;
    const READY_X = ROW_LEFT - 14;
    const OFF_RIGHT = W + PROBE_W;

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let cellRects: SVGRectElement[] = [];
    let cellTexts: SVGTextElement[] = [];
    let probeNode: SVGGElement | null = null;
    let newestBlock: SVGRectElement | null = null;
    let countNode: SVGTextElement | null = null;
    let wallNode: SVGRectElement | null = null;
    let tailNode: SVGPathElement | null = null;
    let barNodes: { line: SVGLineElement; tick: SVGLineElement; drop: SVGLineElement } | null = null;

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      gGrid.replaceChildren();
      gRow.replaceChildren();
      gLanes.replaceChildren();
      gMeasure.replaceChildren();
      gProbe.replaceChildren();
      cellRects = [];
      cellTexts = [];
      probeNode = null;
      newestBlock = null;
      countNode = null;
      wallNode = null;
      tailNode = null;
      barNodes = null;
    }

    // ── 줄 ────────────────────────────────────────────────────────────────

    /**
     * 칸의 옷. **채움은 값의 형편**(아직 안 봄 / 보니 다름 / 보니 같음), **테두리는
     * 짚음의 표식**(여기까지 보았다). 두 칠이 한 채널에 겹치면 어느 쪽도 되짚기에서
     * 복원되지 않는다.
     */
    function dressCell(i: number, verdict: Verdict, probed: boolean): void {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (!rect || !text) return;
      rect.setAttribute(
        'fill',
        verdict === 'same' ? c.itemPivot : verdict === 'differs' ? c.bgSubtle : c.itemDefault,
      );
      text.setAttribute(
        'fill',
        verdict === 'same' ? c.stateInk : verdict === 'differs' ? c.textMuted : c.text,
      );
      rect.setAttribute('stroke', probed ? c.itemComparing : c.border);
      rect.setAttribute('stroke-width', probed ? '2.5' : '1.5');
    }

    /** 칸 경계를 자취까지 내려 긋는 눈금. 자취 한 토막 = 칸 하나임을 잇는다. */
    function drawGrid(): void {
      for (let i = 0; i <= n; i += 1) {
        gGrid.appendChild(
          el('line', {
            x1: cellX(i) - CELL_GAP / 2,
            y1: ROW_Y + ROW_H + 8,
            x2: cellX(i) - CELL_GAP / 2,
            y2: lanesBottom,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 6',
          }),
        );
      }
    }

    function drawRow(scene: ScanUntilFoundScene): void {
      const pass = scene.passes[scene.passes.length - 1] ?? null;
      const probed = new Set(pass?.probed ?? []);
      for (let i = 0; i < n; i += 1) {
        const rect = el('rect', {
          x: cellX(i),
          y: ROW_Y,
          width: cellBoxW,
          height: ROW_H,
          rx: 5,
        });
        const text = el('text', {
          x: cellCenter(i),
          y: ROW_Y + ROW_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
        });
        text.textContent = String(scene.values[i] ?? '');
        gRow.append(rect, text);
        cellRects.push(rect);
        cellTexts.push(text);
        // 짚어 본 칸만 형편이 드러난다. 값과 찾는 값이 둘 다 장면에 있으므로 여기서
        // 견준다 — 판정을 걸음이 실어 오면 화면과 다른 출처가 된다.
        const verdict: Verdict = !probed.has(i)
          ? 'unknown'
          : pass !== null && scene.values[i] === pass.target
            ? 'same'
            : 'differs';
        dressCell(i, verdict, probed.has(i));
      }
    }

    // ── 자취 줄 ───────────────────────────────────────────────────────────

    /** 자취가 줄 끝을 지나 밖으로 뻗는 화살. `tip` 이 rowEnd 면 넓이가 0 이라 안 보인다. */
    function tailD(y: number, tip: number): string {
      const head = Math.max(rowEnd, tip - 18);
      return (
        `M ${rowEnd} ${y + 6} L ${head} ${y + 6} L ${head} ${y - 3} ` +
        `L ${tip} ${y + LANE_H / 2} L ${head} ${y + LANE_H + 3} L ${head} ${y + LANE_H - 6} ` +
        `L ${rowEnd} ${y + LANE_H - 6} Z`
      );
    }

    /**
     * 훑기 한 줄. 짚어 본 칸마다 토막이 하나씩 쌓이고, 그 길이가 곧 주장이다.
     *
     * 아직 서지 않은 훑기는 **숨기지 않고 짓지 않는다** — 숨기기만 하면 앞 걸음의
     * 속성이 함께 남아 되짚기 판정이 어긋난다.
     */
    function drawLane(pass: ScanPass, index: number, last: boolean): void {
      const y = laneTop(index);

      const chip = el('g');
      chip.appendChild(
        el('rect', {
          x: ROW_LEFT - CHIP_GAP - CHIP,
          y,
          width: CHIP,
          height: CHIP,
          rx: 5,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );
      const chipText = el('text', {
        x: ROW_LEFT - CHIP_GAP - CHIP / 2,
        y: y + CHIP / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      chipText.textContent = String(pass.target);
      chip.appendChild(chipText);
      gLanes.appendChild(chip);

      for (const i of pass.probed) {
        const block = el('rect', {
          x: cellX(i) + 1,
          y,
          width: cellW - 2,
          height: LANE_H,
          rx: 3,
          fill: c.itemComparing,
        });
        gLanes.appendChild(block);
        if (last) newestBlock = block;
      }

      const seen = pass.probed.length;
      if (seen > 0) {
        const count = el('text', {
          x: trailEnd(seen) - CELL_GAP / 2,
          y: y - 5,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        count.textContent = String(seen);
        gLanes.appendChild(count);
        if (last) countNode = count;
      }

      if (pass.outcome === null) return;
      if (pass.outcome.kind === 'found') {
        // 자취 끝의 벽. 찾은 그 자리에서 눈길을 멎게 한 것이다.
        const wall = el('rect', {
          x: trailEnd(seen) - WALL_W,
          y: y - WALL_OVER,
          width: WALL_W,
          height: LANE_H + WALL_OVER * 2,
          rx: 2,
          fill: c.itemPivot,
        });
        gLanes.appendChild(wall);
        if (last) wallNode = wall;
      } else {
        const tail = el('path', { d: tailD(y, tipX), fill: c.danger });
        gLanes.appendChild(tail);
        if (last) tailNode = tail;
      }
    }

    function drawLanes(scene: ScanUntilFoundScene): void {
      scene.passes.forEach((pass, i) => {
        drawLane(pass, i, i === scene.passes.length - 1);
      });
    }

    // ── 길이 차이를 재는 자 ───────────────────────────────────────────────

    /** 멎은 자취의 오른쪽 끝과, 없다고 답한 자취의 오른쪽 끝. */
    function spanOf(scene: ScanUntilFoundScene): { stopX: number; endX: number } | null {
      const { stopped, exhausted } = tallyOf(scene.passes);
      if (stopped === null || exhausted === null) return null;
      // 없다고 답한 자취는 줄 밖으로 나갔으므로 화살 끝까지가 그 길이다. 어느
      // 훑기가 그쪽인지는 `tallyOf` 가 한 번만 가린다 — 여기서 다시 가리면 잣대가
      // 두 군데가 된다.
      return { stopX: trailEnd(stopped.probed.length), endX: tipX };
    }

    function drawMeasure(scene: ScanUntilFoundScene): void {
      if (!scene.concluded) return;
      const span = spanOf(scene);
      if (span === null) return;
      const drop = el('line', {
        x1: span.stopX,
        y1: LANES_TOP - 12,
        x2: span.stopX,
        y2: measureY + 6,
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      });
      const line = el('line', {
        x1: span.stopX,
        y1: measureY,
        x2: span.endX,
        y2: measureY,
        stroke: c.text,
        'stroke-width': 2,
      });
      const tickL = el('line', {
        x1: span.stopX,
        y1: measureY - 5,
        x2: span.stopX,
        y2: measureY + 5,
        stroke: c.text,
        'stroke-width': 2,
      });
      const tickR = el('line', {
        x1: span.endX,
        y1: measureY - 5,
        x2: span.endX,
        y2: measureY + 5,
        stroke: c.text,
        'stroke-width': 2,
      });
      gMeasure.append(drop, line, tickL, tickR);
      barNodes = { line, tick: tickR, drop };
    }

    // ── 눈길 ──────────────────────────────────────────────────────────────

    /** 찾는 값을 들고 줄 위를 미끄러지는 눈길 하나. */
    function makeProbe(x: number, target: number): SVGGElement {
      const g = el('g', { transform: `translate(${x} 0)` });
      g.appendChild(
        el('rect', {
          x: -PROBE_W / 2,
          y: PROBE_Y,
          width: PROBE_W,
          height: PROBE_H,
          rx: 6,
          fill: c.primary,
        }),
      );
      g.appendChild(
        el('path', {
          d: `M -7 ${PROBE_Y + PROBE_H} L 7 ${PROBE_Y + PROBE_H} L 0 ${PROBE_Y + PROBE_H + POINTER_H} Z`,
          fill: c.primary,
        }),
      );
      const label = el('text', {
        x: 0,
        y: PROBE_Y + PROBE_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: c.textInverse,
      });
      label.textContent = String(target);
      g.appendChild(label);
      gProbe.appendChild(g);
      return g;
    }

    /**
     * 눈길이 어디 서 있나 — 장면이 말하는 **단계**를 자리로 옮긴다.
     *
     * 줄 밖으로 나갔거나 아직 들어오지 않았으면 **짓지 않는다.** 화면 밖에 세워
     * 두면 앞 걸음의 자리가 속성에 남는다.
     */
    function drawProbe(scene: ScanUntilFoundScene): void {
      const pass = scene.passes[scene.passes.length - 1] ?? null;
      if (pass === null) return;
      const gaze = gazeOf(scene);
      if (gaze.kind === 'away' || gaze.kind === 'gone') return;
      const x = gaze.kind === 'ready' ? READY_X : cellCenter(gaze.index);
      probeNode = makeProbe(x, pass.target);
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: ScanCaption | null): void {
      caption.setAttribute('y', String(height - 12));
      if (cap === null) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'looking':
          caption.textContent = t('caption.looking', 'Looking for {target}.', {
            target: cap.target,
          });
          return;
        case 'found':
          caption.textContent = t(
            'caption.found',
            'Found it. {seen} cells looked at, then it stopped.',
            { seen: cap.seen },
          );
          return;
        case 'overrun':
          caption.textContent = t(
            'caption.overrun',
            'Off the end. Saying "not here" took all {seen} — there was no place to give up.',
            { seen: cap.seen },
          );
          return;
        case 'gap':
          caption.textContent = t(
            'caption.gap',
            'Stopping cost {stopped}. Answering "no" cost {exhausted}.',
            { stopped: cap.stopped, exhausted: cap.exhausted },
          );
          return;
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(scene: ScanUntilFoundScene): void {
      layout(scene);
      drawGrid();
      drawRow(scene);
      drawLanes(scene);
      drawMeasure(scene);
      drawProbe(scene);
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 그림으로 도로 물려 놓고 시작한다.

    /** 새 훑기가 선다 — 눈길이 줄 왼쪽 밖에서 걸어 들어온다. */
    function flowBegin(live: () => boolean): Promise<void> {
      const g = probeNode;
      if (g === null) return Promise.resolve();
      return animate(
        MS_ENTER,
        (p) => {
          g.setAttribute('transform', `translate(${OFF_LEFT + (READY_X - OFF_LEFT) * p} 0)`);
          g.setAttribute('opacity', String(p));
        },
        live,
      );
    }

    /**
     * 눈길이 한 칸 옮겨 가 들여다보고, 자취가 그만큼 뻗는다.
     *
     * 눈길 · 토막 · 셈 셋이 **한 뜻**이라 한 목록 한 시계로 흐른다. 출발 자리는
     * `step.from` 이 싣고 오므로 `prev` 를 들추지 않는다 (S-scene).
     */
    function flowLook(step: { from: number | null; to: number }, live: () => boolean): Promise<void> {
      const g = probeNode;
      const block = newestBlock;
      const count = countNode;
      const x0 = step.from === null ? READY_X : cellCenter(step.from);
      const x1 = cellCenter(step.to);
      // 들여다보기 전에는 아직 형편이 드러나지 않았다. 끝에서 정적 그리기가 덮는다.
      dressCell(step.to, 'unknown', false);
      const blockW = cellW - 2;
      const cx0 = trailEnd(step.from === null ? 0 : step.from + 1) - CELL_GAP / 2;
      const cx1 = trailEnd(step.to + 1) - CELL_GAP / 2;
      return animate(
        MS_LOOK,
        (p) => {
          g?.setAttribute('transform', `translate(${x0 + (x1 - x0) * p} 0)`);
          block?.setAttribute('width', String(blockW * p));
          count?.setAttribute('x', String(cx0 + (cx1 - cx0) * p));
        },
        live,
      );
    }

    /**
     * 찾았다 — 자취 끝에 벽이 솟고 눈길이 거기 부딪혀 멎는다.
     *
     * 벽이 설 세로는 **장면에서 셈한다.** 세워 둔 요소의 속성을 도로 읽으면 화면이
     * 출발값의 출처가 되어, 되짚어 막 세운 화면에서는 그 값이 아직 옛것이다.
     */
    function flowStop(
      step: { at: number },
      live: () => boolean,
      scene: ScanUntilFoundScene,
    ): Promise<void> {
      const wall = wallNode;
      const g = probeNode;
      const x = cellCenter(step.at);
      const fullH = LANE_H + WALL_OVER * 2;
      const wallY = laneTop(Math.max(0, scene.passes.length - 1)) - WALL_OVER;
      return animate(
        MS_STOP,
        (p) => {
          wall?.setAttribute('height', String(fullH * p));
          wall?.setAttribute('y', String(wallY + (fullH * (1 - p)) / 2));
          const bump = p >= 1 ? 0 : BUMP * Math.sin(Math.PI * p);
          g?.setAttribute('transform', `translate(${x + bump} 0)`);
        },
        live,
      );
    }

    /**
     * 못 찾았다 — 자취가 줄 끝을 지나 화살로 뻗고 눈길도 밖으로 빠져나간다.
     *
     * 정적 그림에는 눈길이 없으므로(줄 밖이다) 흐르는 동안만 쓸 하나를 새로 짓고
     * 끝에서 거둔다.
     */
    async function flowOverrun(
      step: { from: number | null },
      live: () => boolean,
      scene: ScanUntilFoundScene,
    ): Promise<void> {
      const tail = tailNode;
      const pass = scene.passes[scene.passes.length - 1] ?? null;
      const x0 = step.from === null ? READY_X : cellCenter(step.from);
      const g = pass === null ? null : makeProbe(x0, pass.target);
      const y = laneTop(Math.max(0, scene.passes.length - 1));
      await animate(
        MS_EXIT,
        (p) => {
          tail?.setAttribute('d', tailD(y, rowEnd + (tipX - rowEnd) * p));
          g?.setAttribute('transform', `translate(${x0 + (OFF_RIGHT - x0) * p} 0)`);
          g?.setAttribute('opacity', String(1 - p));
        },
        live,
      );
      g?.remove();
    }

    /** 두 자취의 길이 차이를 잰다 — 이 조각이 하려던 말이 여기서 다 나온다. */
    function flowMeasure(live: () => boolean, scene: ScanUntilFoundScene): Promise<void> {
      const bar = barNodes;
      const span = spanOf(scene);
      if (bar === null || span === null) return Promise.resolve();
      return animate(
        MS_MEASURE,
        (p) => {
          const x = span.stopX + (span.endX - span.stopX) * p;
          bar.line.setAttribute('x2', String(x));
          bar.tick.setAttribute('x1', String(x));
          bar.tick.setAttribute('x2', String(x));
          bar.drop.setAttribute('opacity', String(p));
        },
        live,
      );
    }

    function flowOf(
      step: ScanStep,
      live: () => boolean,
      scene: ScanUntilFoundScene,
    ): Promise<void> {
      switch (step.kind) {
        case 'begin':
          return flowBegin(live);
        case 'look':
          return flowLook(step, live);
        case 'stop':
          return flowStop(step, live, scene);
        case 'overrun':
          return flowOverrun(step, live, scene);
        case 'measure':
          return flowMeasure(live, scene);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 그림에 필요한 계기값을 `step` 이 싣고
     * 오므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: ScanUntilFoundScene,
      _prev: ScanUntilFoundScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(step, live, next);
      if (!live()) return;

      // 흐르며 남은 opacity·보간된 좌표 문자열·임시 눈길이 통째로 사라진다. 그 사이에
      // 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 취소된 프레임은 아예 불리지 않는다. 기다리던 것을 여기서 깨우지 않으면
        // `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
