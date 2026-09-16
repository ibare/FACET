/**
 * match-length-per-spot stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 이 화면이 하는 말
 *
 * 동사는 **비춘다** 다. 구간 안의 자리는 왼쪽 거울 자리에서 답을 받아 오는데, 그
 * 일이 화면에서 실제로 일어난다 — 값 알갱이가 거울 칸에서 떠올라 활을 타고 오른쪽
 * 자리로 내려앉는다. 구간 밖에서는 커서 둘이 나란히 걸으며 글자를 견주고, 구간과
 * 오른쪽 끝 표시는 오른쪽으로만 미끄러진다.
 *
 * ── 이행이 화면에 남긴 것
 *
 * 옛 화면은 **견준 자국을 지웠다.** 두 칸을 90ms 물들였다 곧 되돌려, 완주 화면에는
 * "글자를 실제로 몇 번 봤나" 가 없었다. 이 조각의 주장은 *다시 안 재도 된다* 인데
 * 잰 쪽이 안 남으니 아낀 몫도 보이지 않았다. 이제 견줌마다 **글자 칸 바닥에 눈금이
 * 하나 쌓이고 지워지지 않는다** — 같은 글자를 몇 번이나 다시 보는지가 한 화면에
 * 선다. 베껴 온 자리는 눈금을 하나도 남기지 않는다.
 *
 * 베낌의 활도 남는다. 옛 화면은 활을 그렸다 걸음 끝에 지웠다 — 어디서 어디로
 * 베꼈는지가 완주 화면에서 사라졌다. 이제 정적 그리기가 `spot.borrow.from` 에서
 * 활을 파생시켜 매번 다시 세운다.
 *
 * ── 어휘를 가른다 (함정 29)
 *
 * 베껴 온 값과 훑어 잰 값을 같은 모양으로 그리면 "다 재 봤다" 로 읽혀 이 조각의
 * 정반대가 된다. 두 축을 갈라 둔다.
 *
 * | 축 | 말하는 것 |
 * | --- | --- |
 * | 값 칸의 **채움** | 값의 형편 — 비었다 / 정해졌다 |
 * | 값 칸의 **테두리** | 어떻게 얻었나 — 베껴 왔다(노랑) / 훑어 쟀다(기본) |
 * | 글자 칸의 **바닥 눈금** | 그 글자를 몇 번 견줬나 (누적, 지워지지 않는다) |
 * | 글자 칸의 **채움** | 구간의 형편 — 구간 안 / 거울 구간 / 밖 |
 *
 * 옛 화면은 값 칸의 채움 하나에 *정해졌나* 와 *어떻게 얻었나* 두 뜻을 실어, 베끼고
 * 이어서 잰 자리를 어느 쪽으로도 못 그렸다.
 *
 * ── 좌표
 *
 * 가로는 `PIECE_CANVAS_W` 에서 역산한다 — 칸 폭은 상한만 상수로 두고 남는 폭을
 * 여백으로 버리지 않는다 (S-piece). 세로는 그림이 정하는 값이라 이 파일이 상수로
 * 갖는다 (S-view).
 *
 * 문안은 `params.t` 로 만든다. 장면은 무엇을 말할지만 담는다 (C10).
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  borrowOnlyCount,
  comparisonCount,
  comparisonsAt,
  currentWindow,
  freshIndex,
  previousWindow,
  valueAt,
  type MatchLengthPerSpotScene,
  type WindowSpan,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;

// ── 세로 배치. 위에서 아래로 라벨 · 밴드 · 글자칸 · 커서 · 활 · 값칸 · 번호 · 캡션.
const LABEL_Y = 26;
const BAND_Y = 34;
const BAND_H = 10;
const CELLS_Y = 56;
const CELL_H = 48;
/** 글자의 baseline. 눈금이 앉을 바닥을 비워 둔다. */
const GLYPH_BASELINE = CELLS_Y + 30;
/** 견준 자국이 쌓이는 칸 바닥. */
const TALLY_Y = CELLS_Y + CELL_H - 10;
const TALLY_H = 5;
const CURSOR_Y = 110;
const CURSOR_H = 12;
const VALUE_Y = 152;
const VALUE_H = 32;
const INDEX_Y = 202;
const CAPTION_Y = 226;
const CAPTION_LINE_H = 19;
const CANVAS_H = 260;

// ── 가로. 상수는 상한만 두고 실제 크기는 캔버스에서 역산한다.
const CELL_MAX_W = 64;
const SIDE_MIN = 26;
const VALUE_INSET = 7;

/** 베낌의 활이 값 칸 윗변에서 떠오르는 높이. 멀수록 더 솟되 상한을 둔다. */
const ARC_RISE_MIN = 10;
const ARC_RISE_STEP = 5;
const ARC_RISE_MAX = 24;
/** 활의 양 끝이 값 칸 윗변에서 얼마나 떨어지나. */
const ARC_END_GAP = 3;

// ── 걸음 안의 시간. 이 뒤에 stepMs 만큼 더 쉰다.
const FRAME_MS = 16;
const STEP_MOVE_MS = 170;
const HIT_FLASH_MS = 90;
const MISS_FLASH_MS = 280;
const REVEAL_MS = 150;
const BORROW_LIFT_MS = 120;
const BORROW_FLY_MS = 430;
const WINDOW_MOVE_MS = 360;
const SWEEP_MS = 460;
const BOUNCE_MS = 110;

const CAPTION_MAX_CHARS = 72;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 한 줄이 넘치면 빈칸에서 두 줄로 나눈다. 빈칸이 없는 문자는 한 줄로 둔다. */
function wrapCaption(text: string): string[] {
  if (text.length <= CAPTION_MAX_CHARS) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let head = '';
  let i = 0;
  while (i < words.length) {
    const next = head === '' ? words[i] : `${head} ${words[i]}`;
    if (head !== '' && next.length > CAPTION_MAX_CHARS) break;
    head = next;
    i += 1;
  }
  const tail = words.slice(i).join(' ');
  return tail === '' ? [head] : [head, tail];
}

/** 캔버스에서 역산한 자리. 장면은 칸 번호만 알고 좌표는 여기서만 산다 (S-piece). */
type Geom = {
  cellW: number;
  originX: number;
  cellX: (i: number) => number;
  cellCenter: (i: number) => number;
};

/** 밴드 한 벌. 구간이 아직 없으면 짓지 않는다 — 숨기지 않는다 (함정 17). */
type Bands = {
  mirrorBand: SVGRectElement;
  windowBand: SVGRectElement;
  mirrorLabel: SVGTextElement;
  edgeLine: SVGLineElement;
  edgeLabel: SVGTextElement;
};

/** 정적 그리기가 세워 둔 것들. 걸음의 운동이 이 손잡이를 빌려 쓴다. */
type Drawn = {
  geom: Geom;
  cellRects: SVGRectElement[];
  cellGlyphs: SVGTextElement[];
  /** 글자 칸마다 쌓인 견줌 눈금. 앞쪽이 오래된 것이다. */
  tallies: SVGRectElement[][];
  boxGroups: SVGGElement[];
  boxRects: SVGRectElement[];
  boxGlyphs: SVGTextElement[];
  bands: Bands | null;
};

export const matchLengthPerSpotStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MatchLengthPerSpotScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 겹. 뒤에서 앞으로. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gBands = el('g', {});
    const gCells = el('g', {});
    const gSweep = el('g', {});
    const gArcs = el('g', {});
    const gValues = el('g', {});
    const gCursors = el('g', {});
    const gChip = el('g', {});
    const gCaption = el('g', {});
    svg.append(gBands, gCells, gSweep, gArcs, gValues, gCursors, gChip, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 프레임을 여러 마디 지나고, 그 사이에 되짚기가 끼어들면 남은
     * 마디가 **이미 새로 선 화면**을 덮는다. 정적 그리기가 칸을 매번 새로 만들지만
     * 걸음 함수는 `await` 앞에서 쥔 옛 손잡이를 그대로 들고 있다 — 그것을 여기서
     * 끊는다. `isInstant` 는 빗장이 아니다. 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
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

    /** 프레임마다 보간한다. 세대가 바뀌면 그리지 않고 물러난다 (CSS transition 금지). */
    async function tween(
      ms: number,
      mine: number,
      apply: (t: number) => void,
    ): Promise<void> {
      const steps = Math.max(1, Math.round(ms / FRAME_MS));
      for (let s = 1; s <= steps; s += 1) {
        await wait(FRAME_MS);
        // 세대가 바뀌었으면 그리지 않고 물러난다.
        if (!alive(mine)) return;
        apply(easeInOut(s / steps));
      }
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    const valueCenterY = VALUE_Y + VALUE_H / 2;
    const arcEndY = VALUE_Y - ARC_END_GAP;

    function geomOf(scene: MatchLengthPerSpotScene): Geom {
      const n = Math.max(1, scene.text.length);
      const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
      const originX = Math.round((W - n * cellW) / 2);
      return {
        cellW,
        originX,
        cellX: (i) => originX + i * cellW,
        cellCenter: (i) => originX + i * cellW + cellW / 2,
      };
    }

    /** 베낌의 활 하나. 제어점은 거리에서 나온다 — 멀수록 높이 솟는다. */
    function arcOf(
      geom: Geom,
      from: number,
      to: number,
    ): { x0: number; x1: number; cx: number; cy: number } {
      const x0 = geom.cellCenter(from);
      const x1 = geom.cellCenter(to);
      const dist = Math.abs(to - from);
      const rise = Math.min(ARC_RISE_MAX, ARC_RISE_MIN + dist * ARC_RISE_STEP);
      return { x0, x1, cx: (x0 + x1) / 2, cy: arcEndY - 2 * rise };
    }

    // ── 칸의 형편 ─────────────────────────────────────────────────────────

    /**
     * 글자 칸의 채움 — **구간의 형편**만 말한다.
     *
     * 구간 안은 이미 맨 앞과 같다고 확인된 자리이고, 맨 앞의 같은 길이가 그 거울이다.
     */
    function regionFill(i: number, win: WindowSpan | null): string {
      if (win === null) return c.itemDefault;
      if (i >= win.left && i <= win.right) return c.subtreeShadeRight;
      if (i < win.right - win.left + 1) return c.subtreeShadeLeft;
      return c.itemDefault;
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      gBands.textContent = '';
      gCells.textContent = '';
      gSweep.textContent = '';
      gArcs.textContent = '';
      gValues.textContent = '';
      gCursors.textContent = '';
      gChip.textContent = '';
      gCaption.textContent = '';
    }

    /** 견준 자국을 칸 바닥에 나란히 쌓는다. 하나도 없으면 짓지 않는다 (함정 17). */
    function drawTally(geom: Geom, i: number, count: number): SVGRectElement[] {
      if (count <= 0) return [];
      const room = geom.cellW - 10;
      let tickW = 4;
      let gap = 2;
      while (count * (tickW + gap) - gap > room && tickW > 1) tickW -= 1;
      while (count * (tickW + gap) - gap > room && gap > 1) gap -= 1;
      const total = count * (tickW + gap) - gap;
      const startX = geom.cellCenter(i) - total / 2;
      const out: SVGRectElement[] = [];
      for (let k = 0; k < count; k += 1) {
        const tick = el('rect', {
          x: (startX + k * (tickW + gap)).toFixed(2),
          y: TALLY_Y,
          width: tickW,
          height: TALLY_H,
          rx: 1,
          fill: c.textMuted,
        });
        gCells.appendChild(tick);
        out.push(tick);
      }
      return out;
    }

    /** 구간 밴드 한 벌. 구간이 있을 때만 짓는다. */
    function drawBands(geom: Geom, win: WindowSpan): Bands {
      const leftEdge = geom.cellX(win.left);
      const rightEdge = geom.cellX(win.right + 1);
      const span = win.right - win.left + 1;
      const spanW = span * geom.cellW;

      const mirrorBand = el('rect', {
        x: geom.originX, y: BAND_Y, width: spanW, height: BAND_H, rx: 4,
        fill: c.auxCursor, opacity: 0.9,
      });
      const windowBand = el('rect', {
        x: leftEdge, y: BAND_Y, width: rightEdge - leftEdge, height: BAND_H, rx: 4,
        fill: c.accent,
      });
      const mirrorLabel = el('text', {
        x: geom.originX + spanW / 2, y: LABEL_Y, 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
        opacity: spanW > geom.cellW ? 1 : 0,
      });
      mirrorLabel.textContent = t('label.mirror', 'mirror');
      const edgeLine = el('line', {
        x1: rightEdge, y1: BAND_Y - 6, x2: rightEdge, y2: VALUE_Y + VALUE_H + 6,
        stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 4',
      });
      const edgeLabel = el('text', {
        x: rightEdge, y: LABEL_Y, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text,
      });
      // 구간의 오른쪽 끝. 수식 표기라 표식이다 (C10).
      edgeLabel.textContent = 'r';

      gBands.append(mirrorBand, windowBand, edgeLine, mirrorLabel, edgeLabel);
      return { mirrorBand, windowBand, mirrorLabel, edgeLine, edgeLabel };
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 겹을 통째로 비우고 다시 짓는다. 되돌릴 목록을 손으로 관리하지 않으므로 보간이
     * 남긴 `opacity` 나 좌표 끝자리가 남을 자리가 없다 (S-scene).
     */
    function drawStatic(scene: MatchLengthPerSpotScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const n = scene.text.length;
      const win = currentWindow(scene);
      const counts = comparisonsAt(scene);

      const bands = win === null ? null : drawBands(geom, win);

      const cellRects: SVGRectElement[] = [];
      const cellGlyphs: SVGTextElement[] = [];
      const tallies: SVGRectElement[][] = [];
      for (let i = 0; i < n; i += 1) {
        const rect = el('rect', {
          x: geom.cellX(i) + 1, y: CELLS_Y, width: geom.cellW - 2, height: CELL_H, rx: 5,
          fill: regionFill(i, win), stroke: c.border, 'stroke-width': 1,
        });
        const glyph = el('text', {
          x: geom.cellCenter(i), y: GLYPH_BASELINE, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text,
        });
        glyph.textContent = scene.text[i] ?? '';
        gCells.append(rect, glyph);
        cellRects.push(rect);
        cellGlyphs.push(glyph);
        tallies.push(drawTally(geom, i, counts[i] ?? 0));
      }

      // 베낌의 활. 지워지지 않는다 — 어디서 어디로 베꼈나가 완주 화면에 남는다.
      scene.spots.forEach((spot, i) => {
        const borrow = spot.borrow;
        if (borrow === null) return;
        const a = arcOf(geom, borrow.from, i);
        const path = el('path', {
          d: `M ${a.x0} ${arcEndY} Q ${a.cx} ${a.cy} ${a.x1} ${arcEndY}`,
          fill: 'none', stroke: c.auxCursor, 'stroke-width': 1,
          'stroke-dasharray': '4 4', opacity: 0.75,
        });
        gArcs.appendChild(path);
      });

      const boxGroups: SVGGElement[] = [];
      const boxRects: SVGRectElement[] = [];
      const boxGlyphs: SVGTextElement[] = [];
      for (let i = 0; i < n; i += 1) {
        const group = el('g', {});
        const spot = scene.spots[i];
        const filled = spot !== undefined;
        // 채움은 값의 형편, 테두리는 어떻게 얻었나 — 두 축을 가른다 (함정 29).
        const borrowed = spot?.borrow != null;
        const rect = el('rect', {
          x: geom.cellX(i) + VALUE_INSET, y: VALUE_Y,
          width: geom.cellW - VALUE_INSET * 2, height: VALUE_H, rx: 5,
          fill: filled ? c.bgSubtle : 'none',
          stroke: borrowed ? c.accent : c.border,
          'stroke-width': borrowed ? 2 : 1,
        });
        if (!filled) rect.setAttribute('stroke-dasharray', '3 3');
        const glyph = el('text', {
          x: geom.cellCenter(i), y: valueCenterY + 5, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text,
        });
        const value = valueAt(scene, i);
        glyph.textContent = value === null ? '' : String(value);
        group.append(rect, glyph);
        gValues.appendChild(group);
        boxGroups.push(group);
        boxRects.push(rect);
        boxGlyphs.push(glyph);

        // 자리 번호. 수식 표기라 표식이다 (C10).
        const tick = el('text', {
          x: geom.cellCenter(i), y: INDEX_Y, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
        });
        tick.textContent = String(i);
        gValues.appendChild(tick);
      }

      drawCaption(scene);

      return {
        geom, cellRects, cellGlyphs, tallies, boxGroups, boxRects, boxGlyphs, bands,
      };
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: MatchLengthPerSpotScene): void {
      const lines = wrapCaption(captionText(scene));
      for (const line of [0, 1]) {
        const node = el('text', {
          x: W / 2, y: CAPTION_Y + line * CAPTION_LINE_H, 'text-anchor': 'middle',
          'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.textMuted,
        });
        node.textContent = lines[line] ?? '';
        gCaption.appendChild(node);
      }
    }

    /**
     * 캡션의 갈래는 `step` 과 자취에서 남김없이 나온다.
     *
     * 마무리에 뜨는 수 셋도 자취가 센다 — 옛 화면은 아무 수도 말하지 않아 무엇을
     * 얼마나 아꼈는지가 화면 밖에 있었다 (함정 11).
     */
    function captionText(scene: MatchLengthPerSpotScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'whole':
          return t(
            'caption.whole',
            'The front spot matches the whole string — its answer is the full length.',
          );
        case 'mirror': {
          const fresh = freshIndex(scene);
          const capped = fresh === null ? false : scene.spots[fresh]?.borrow?.capped === true;
          return capped
            ? t(
                'caption.capped',
                'What was borrowed reaches the window edge. Beyond it nothing is certain yet.',
              )
            : t(
                'caption.borrow',
                'Inside the window. Borrow the answer from the mirror spot on the left.',
              );
        }
        case 'scan': {
          const fresh = freshIndex(scene);
          const resumed = fresh !== null && scene.spots[fresh]?.borrow != null;
          return resumed
            ? t(
                'caption.extend',
                'What was borrowed is certain. Keep comparing from the window edge on.',
              )
            : t(
                'caption.outside',
                'Outside the window. Compare the characters from the very front.',
              );
        }
        case 'window':
          return t(
            'caption.window',
            'The overlap reached farther right. Move the window over there.',
          );
        case 'done':
          return t(
            'caption.done',
            'Of {spots} spots, {borrowed} never compared a character. Character pairs compared: {compares}.',
            {
              spots: scene.spots.length,
              borrowed: borrowOnlyCount(scene),
              compares: comparisonCount(scene),
            },
          );
      }
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 견주는 커서 둘. 운동 중에만 짓는다 — 정지 화면에는 없다 (함정 27). */
    function makeCursors(x: number): { front: SVGPathElement; spot: SVGPathElement } {
      const d = `M -7 ${CURSOR_H} L 7 ${CURSOR_H} L 0 0 Z`;
      const front = el('path', {
        d, fill: 'none', stroke: c.auxCursor, 'stroke-width': 1.5,
        transform: `translate(${x}, ${CURSOR_Y})`,
      });
      const spot = el('path', {
        d, fill: c.text, transform: `translate(${x}, ${CURSOR_Y})`,
      });
      gCursors.append(front, spot);
      return { front, spot };
    }

    /** 맨 앞 자리 — 문자열 전체를 훑고 그 길이를 값 칸에 놓는다. */
    async function flowWhole(
      scene: MatchLengthPerSpotScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const glyph = drawn.boxGlyphs[0];
      if (glyph !== undefined) glyph.setAttribute('opacity', '0');

      const full = scene.text.length * drawn.geom.cellW - 2;
      const sweep = el('rect', {
        x: drawn.geom.cellX(0) + 1, y: CELLS_Y, width: 0, height: CELL_H, rx: 5,
        fill: c.accent, 'fill-opacity': 0.22,
      });
      gSweep.appendChild(sweep);
      await tween(SWEEP_MS, mine, (e) => {
        sweep.setAttribute('width', (full * e).toFixed(2));
      });
      if (!alive(mine) || glyph === undefined) return;
      await tween(REVEAL_MS, mine, (e) => {
        glyph.setAttribute('opacity', e.toFixed(3));
      });
    }

    /** 구간 밖(또는 구간 끝 너머) — 커서 둘이 나란히 걸으며 글자를 견준다. */
    async function flowScan(
      scene: MatchLengthPerSpotScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const index = freshIndex(scene);
      if (index === null) return;
      const scan = scene.spots[index]?.scan;
      if (scan === undefined || scan === null) return;
      const { geom } = drawn;
      const n = scene.text.length;

      // 이 걸음이 새로 남기는 눈금만 가려 둔다 — 견줄 때마다 하나씩 드러난다.
      const before = comparisonsAt({
        ...scene,
        spots: scene.spots.map((s, i) => (i === index ? { ...s, scan: null } : s)),
      });
      const shown = drawn.tallies.map((ticks, i) => {
        const keep = before[i] ?? 0;
        for (let k = keep; k < ticks.length; k += 1) ticks[k]!.setAttribute('opacity', '0');
        return keep;
      });
      const revealTick = (cell: number): void => {
        const ticks = drawn.tallies[cell];
        if (ticks === undefined) return;
        const at = shown[cell] ?? 0;
        ticks[at]?.removeAttribute('opacity');
        shown[cell] = at + 1;
      };

      const glyph = drawn.boxGlyphs[index];
      if (glyph !== undefined) glyph.setAttribute('opacity', '0');

      const cursors = makeCursors(geom.cellCenter(scan.start));
      const place = (frontX: number, spotX: number): void => {
        cursors.front.setAttribute('transform', `translate(${frontX.toFixed(2)}, ${CURSOR_Y})`);
        cursors.spot.setAttribute('transform', `translate(${spotX.toFixed(2)}, ${CURSOR_Y})`);
      };
      place(geom.cellCenter(scan.start), geom.cellCenter(index + scan.start));

      /** 두 칸을 물들였다 구간 칠로 되돌린다. 자국은 눈금이 남긴다. */
      const flashPair = async (a: number, b: number, fill: string, ms: number): Promise<void> => {
        const win = currentWindow(scene);
        for (const i of [a, b]) {
          if (i < 0 || i >= n) continue;
          drawn.cellRects[i]?.setAttribute('fill', fill);
          drawn.cellGlyphs[i]?.setAttribute('fill', c.stateInk);
        }
        await wait(ms);
        if (!alive(mine)) return;
        for (const i of [a, b]) {
          if (i < 0 || i >= n) continue;
          drawn.cellRects[i]?.setAttribute('fill', regionFill(i, win));
          drawn.cellGlyphs[i]?.setAttribute('fill', c.text);
        }
      };

      let at = scan.start;
      for (let k = scan.start; k < scan.value; k += 1) {
        if (k > at) {
          const fromK = at;
          await tween(STEP_MOVE_MS, mine, (e) => {
            place(
              lerp(geom.cellCenter(fromK), geom.cellCenter(k), e),
              lerp(geom.cellCenter(index + fromK), geom.cellCenter(index + k), e),
            );
          });
          if (!alive(mine)) return;
          at = k;
        }
        revealTick(k);
        revealTick(index + k);
        await flashPair(k, index + k, c.itemComparing, HIT_FLASH_MS);
        if (!alive(mine)) return;
      }

      if (scan.mismatch) {
        // 맞은 견줌이 하나라도 있었으면 커서가 한 칸 더 나아가 어긋난 자리를 짚는다.
        if (scan.value > at) {
          const fromK = at;
          await tween(STEP_MOVE_MS, mine, (e) => {
            place(
              lerp(geom.cellCenter(fromK), geom.cellCenter(scan.value), e),
              lerp(geom.cellCenter(index + fromK), geom.cellCenter(index + scan.value), e),
            );
          });
          if (!alive(mine)) return;
        } else {
          place(geom.cellCenter(scan.value), geom.cellCenter(index + scan.value));
        }
        revealTick(scan.value);
        revealTick(index + scan.value);
        await flashPair(scan.value, index + scan.value, c.itemSwapping, MISS_FLASH_MS);
        if (!alive(mine)) return;
      }

      cursors.front.remove();
      cursors.spot.remove();
      if (glyph === undefined) return;
      await tween(REVEAL_MS, mine, (e) => {
        glyph.setAttribute('opacity', e.toFixed(3));
      });
    }

    /** 구간 안 — 거울 자리의 답이 활을 타고 이 자리로 건너온다. */
    async function flowMirror(
      scene: MatchLengthPerSpotScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const index = freshIndex(scene);
      if (index === null) return;
      const borrow = scene.spots[index]?.borrow;
      if (borrow === undefined || borrow === null) return;
      const { geom } = drawn;

      const glyph = drawn.boxGlyphs[index];
      if (glyph !== undefined) glyph.setAttribute('opacity', '0');

      const source = drawn.boxRects[borrow.from];
      source?.setAttribute('stroke-width', '3');
      await wait(BORROW_LIFT_MS);
      if (!alive(mine)) return;

      const a = arcOf(geom, borrow.from, index);
      const chipW = Math.min(30, geom.cellW - VALUE_INSET * 2);
      const chip = el('g', { transform: `translate(${a.x0}, ${arcEndY})` });
      const chipRect = el('rect', {
        x: -chipW / 2, y: -13, width: chipW, height: 26, rx: 5, fill: c.accent,
      });
      const chipGlyph = el('text', {
        x: 0, y: 5, 'text-anchor': 'middle', 'font-family': fonts.mono,
        'font-size': fontSizes.md, fill: c.stateInk,
      });
      chipGlyph.textContent = String(borrow.value);
      chip.append(chipRect, chipGlyph);
      gChip.appendChild(chip);

      await tween(BORROW_FLY_MS, mine, (e) => {
        const u = 1 - e;
        const x = u * u * a.x0 + 2 * u * e * a.cx + e * e * a.x1;
        const y = u * u * arcEndY + 2 * u * e * a.cy + e * e * arcEndY;
        chip.setAttribute('transform', `translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
      });
      if (!alive(mine)) return;

      chip.remove();
      // 되돌릴 굵기는 화면이 아니라 장면이 말한다 — 거울 자리도 베껴 온 자리일 수 있다.
      source?.setAttribute(
        'stroke-width',
        scene.spots[borrow.from]?.borrow != null ? '2' : '1',
      );
      if (glyph === undefined) return;
      await tween(REVEAL_MS, mine, (e) => {
        glyph.setAttribute('opacity', e.toFixed(3));
      });
    }

    /** 구간이 오른쪽으로 미끄러진다. 오른쪽 끝은 뒤로 가지 않는다. */
    async function flowWindow(
      scene: MatchLengthPerSpotScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const bands = drawn.bands;
      const now = currentWindow(scene);
      const was = previousWindow(scene);
      if (bands === null || now === null || was === null) return;
      const { geom } = drawn;
      const n = scene.text.length;

      const fromL = geom.cellX(was.left);
      const fromR = geom.cellX(was.right + 1);
      const toL = geom.cellX(now.left);
      const toR = geom.cellX(now.right + 1);
      const fromSpan = Math.max(0, fromR - fromL);
      const toSpan = Math.max(0, toR - toL);

      // 칠도 옛 구간에서 출발한다 — 구간이 그리로 옮겨 가는 것이 이 걸음의 말이다.
      const wasWin = fromSpan > 0 ? was : null;
      for (let i = 0; i < n; i += 1) {
        drawn.cellRects[i]?.setAttribute('fill', regionFill(i, wasWin));
      }

      const paint = (l: number, r: number, span: number): void => {
        bands.windowBand.setAttribute('x', l.toFixed(2));
        bands.windowBand.setAttribute('width', Math.max(0, r - l).toFixed(2));
        bands.mirrorBand.setAttribute('width', Math.max(0, span).toFixed(2));
        bands.mirrorBand.setAttribute('opacity', span > 0 ? '0.9' : '0');
        bands.mirrorLabel.setAttribute('x', (geom.originX + span / 2).toFixed(2));
        bands.mirrorLabel.setAttribute('opacity', span > geom.cellW ? '1' : '0');
        bands.edgeLine.setAttribute('x1', r.toFixed(2));
        bands.edgeLine.setAttribute('x2', r.toFixed(2));
        bands.edgeLabel.setAttribute('x', r.toFixed(2));
      };
      paint(fromL, fromR, fromSpan);

      await tween(WINDOW_MOVE_MS, mine, (e) => {
        paint(lerp(fromL, toL, e), lerp(fromR, toR, e), lerp(fromSpan, toSpan, e));
      });
      if (!alive(mine)) return;
      for (let i = 0; i < n; i += 1) {
        drawn.cellRects[i]?.setAttribute('fill', regionFill(i, now));
      }
    }

    /** 마무리 — 글자를 한 번도 견주지 않은 자리들이 차례로 한 번 튄다. */
    async function flowDone(
      scene: MatchLengthPerSpotScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      for (let i = 0; i < scene.spots.length; i += 1) {
        const spot = scene.spots[i]!;
        if (spot.borrow === null || spot.scan !== null) continue;
        const group = drawn.boxGroups[i];
        if (group === undefined) continue;
        await tween(BOUNCE_MS, mine, (e) => {
          group.setAttribute('transform', `translate(0, ${(-6 * e).toFixed(2)})`);
        });
        if (!alive(mine)) return;
        await tween(BOUNCE_MS, mine, (e) => {
          group.setAttribute('transform', `translate(0, ${(-6 * (1 - e)).toFixed(2)})`);
        });
        if (!alive(mine)) return;
        // 보간의 끝자리(`-0`)를 남기지 않는다 — 없애는 것이 되돌리는 것이다.
        group.removeAttribute('transform');
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: MatchLengthPerSpotScene,
      _prev: MatchLengthPerSpotScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'whole':
          await flowWhole(next, drawn, mine);
          break;
        case 'mirror':
          await flowMirror(next, drawn, mine);
          break;
        case 'scan':
          await flowScan(next, drawn, mine);
          break;
        case 'window':
          await flowWindow(next, drawn, mine);
          break;
        case 'done':
          await flowDone(next, drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 운동이 남긴 속성·보간 끝자리·임시 노드가 통째로 사라진다. 되돌릴 목록을
      // 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 타이머는 콜백을 아예 부르지 않으므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
