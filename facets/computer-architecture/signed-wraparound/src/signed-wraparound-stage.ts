/**
 * signed-wraparound-stage — 수의 끝과 끝을 한 화면에 놓고, 오른쪽 끝을 지난
 * 표식이 왼쪽 끝에서 나오는 것을 보인다.
 *
 * ── 형태가 나온 자리
 *
 * 동사는 "넘어간다" 다. 그래서 표식은 실제로 이동한다 — 칸 사이를 미끄러지고,
 * 오른쪽 끝을 지나서는 아래로 휘어 도는 길을 따라 왼쪽 끝으로 들어온다. 그
 * 길은 처음에 그려져 있지 않다. 표식이 지나가면서 비로소 그어지고, 그제야
 * 직선처럼 보이던 것이 닫힌 고리였음이 드러난다.
 *
 * 범위는 256 칸이라 다 그릴 수 없다. 양 끝 세 칸씩만 두고 가운데는 점선과 ⋯
 * 로 생략한다. 생략했다는 전제를 화면에 각주로 달지 않는다 — 그것은 글의
 * 일이다 (S-piece).
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고 (`drawStatic`), 그 다음에
 * 방금 밟은 걸음 하나만 흐르게 한다 (S-scene). 되돌릴 명령이 없으므로
 * `restore()` 도 `conclude()` 도 사라졌다 — 그 둘이 쥐고 있던 "넘어갔나 ·
 * 결론에 이르렀나" 는 이제 장면이 말한다.
 *
 * 운동의 방향이 뒤집혀 있다. 정적 그리기가 정본이라 표식은 이미 닿을 자리에
 * 서 있고 고리도 이미 그어져 있다. 흐르게 할 때만 출발 그림으로 도로 물려
 * 놓고 시작하며, 운동이 끝나면 장면을 통째로 다시 세워 보간이 남긴 좌표
 * 끝자리와 opacity 를 한꺼번에 지운다.
 *
 * ── 뜻마다 제 축을 준다 (프로토콜 4 절 "한 축에 값을 셋 이상 욱여넣지 않는다")
 *
 *   칸의 **채움**   지나온 자취인가          — 값의 형편
 *   칸의 **테두리** 이 끝을 이미 짚었나      — 이음매의 표식
 *   비트의 **색**   그 자리가 1 인가 0 인가  — 값 그 자체
 *   비트의 **밑줄** 이번 걸음에 뒤집혔나     — 자리올림이 번진 자국
 *   부호 자리의 칸막이는 구조라 늘 서 있다.
 *
 * 옛 화면은 비트 하나의 색에 "지금 뒤집히는 중 · 부호 자리 · 그 밖" 셋을
 * 실어, 멎은 화면에서 **부호 자리가 이번에 켜졌다는 사실이 사라졌다.**
 * 2의 보수에서 넘어감의 정체가 그것인데도 그랬다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하고, 세로는 이 그림이 정해 여기 상수로
 * 둔다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { toBits } from './algorithm.js';
import {
  carryOrder,
  nowValue,
  type SignedWraparoundScene,
  type WraparoundCaption,
  type WraparoundStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로. 캡션 세 줄 · 이름표 · 칸 줄 · 아래로 도는 고리까지 담는다. */
const CANVAS_H = 212;

const CAPTION_LINE_Y = [18, 34, 50];
const TAG_Y = 72;
const RAIL_Y = 120;
const LABEL_DY = 30;

/** 양 끝에서 실제로 보이는 칸 수. 가운데는 생략한다. */
const LANE_CELLS = 3;
/** 생략 구간의 가로 길이. */
const MID_GAP = 104;
const CELL_MAX_W = 78;
const SIDE_MIN = 32;
const CELL_H = 34;
const CELL_INSET = 5;
const TOKEN_H = 30;
const TOKEN_INSET = 11;

/** 비트 한 자리의 가로 간격과, 표식 위 비트열의 높이. */
const BIT_ADV = 9;
const BIT_DY = 30;
/** 뒤집힌 자리의 밑줄과, 부호 자리를 가르는 칸막이. */
const BIT_RULE_DY = 4;
const BIT_RULE_HALF = 3.5;
const SIGN_DIV_TOP = -11;
const SIGN_DIV_BOT = 5;

/** 고리 제어점이 바깥으로 나가는 거리와 아래로 내려가는 깊이. */
const LOOP_OUT = 92;
const LOOP_DROP = 80;

/** 넘어가는 걸음에서 들머리 · 고리 · 날머리가 차지하는 몫. */
const ENTER_SHARE = 0.12;
const LOOP_SHARE = 0.76;

const MOVE_MS = 380;
const WRAP_MS = 1150;
const FRAME_MS = 16;

/** 비트가 뒤집히기 시작하고 끝나는 지점, 그리고 값이 바뀌는 지점. */
const RIPPLE_FROM = 0.25;
const RIPPLE_TO = 0.7;
const VALUE_SWITCH = 0.55;

const LOOP_SAMPLES = 64;

/** 지나온 칸의 옅은 칠 — 표식과 같은 색의 밝기 단계다 (S-view 결정 트리 5). */
const TRAIL_SHIFT_LIGHT = 0.24;
const TRAIL_SHIFT_DARK = -0.32;

type Pt = { x: number; y: number };

/**
 * 자리 셈. **먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 이웃의 지금
 * 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
 */
type Geom = {
  /** 화면에 실제로 놓이는 여섯 값 — 왼쪽 끝 셋과 오른쪽 끝 셋. */
  lane: number[];
  cellW: number;
  leftEnd: number;
  rightEnd: number;
  gapStart: number;
  gapEnd: number;
  cellX: (slot: number) => number;
  /** 값이 놓인 칸. 여섯 칸 밖의 값은 생략 구간 쪽 끝으로 붙인다. */
  slotOf: (value: number) => number;
  onLoop: (t: number) => Pt;
  loopLen: number;
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
};

/** 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type BitNode = { glyph: SVGTextElement; rule: SVGLineElement | null };
type Drawn = {
  geom: Geom;
  loop: SVGPathElement | null;
  tokenG: SVGGElement;
  value: SVGTextElement;
  bits: BitNode[];
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 자리를 한 번에 셈한다. 비트 폭만 알면 나머지는 캔버스에서 역산된다. */
function geomOf(bitWidth: number): Geom {
  const min = -(2 ** (bitWidth - 1));
  const max = 2 ** (bitWidth - 1) - 1;
  const lane = [min, min + 1, min + 2, max - 2, max - 1, max];

  const cellW = Math.min(
    CELL_MAX_W,
    Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2 - MID_GAP) / (LANE_CELLS * 2)),
  );
  const laneW = cellW * LANE_CELLS * 2 + MID_GAP;
  const originX = Math.round((PIECE_CANVAS_W - laneW) / 2);
  const leftEnd = originX;
  const rightEnd = originX + laneW;
  const gapStart = originX + cellW * LANE_CELLS;
  const gapEnd = gapStart + MID_GAP;

  const cellX = (slot: number): number =>
    slot < LANE_CELLS
      ? originX + cellW * (slot + 0.5)
      : gapEnd + cellW * (slot - LANE_CELLS + 0.5);

  const slotOf = (value: number): number => {
    const found = lane.indexOf(value);
    if (found >= 0) return found;
    return value < 0 ? LANE_CELLS - 1 : LANE_CELLS;
  };

  const p0: Pt = { x: rightEnd, y: RAIL_Y };
  const p1: Pt = { x: rightEnd + LOOP_OUT, y: RAIL_Y + LOOP_DROP };
  const p2: Pt = { x: leftEnd - LOOP_OUT, y: RAIL_Y + LOOP_DROP };
  const p3: Pt = { x: leftEnd, y: RAIL_Y };

  const onLoop = (t: number): Pt => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  };

  // 길이는 직접 재서 쓴다 — DOM 의 기하 API 에 기대지 않는다.
  let loopLen = 0;
  let prev = onLoop(0);
  for (let i = 1; i <= LOOP_SAMPLES; i += 1) {
    const cur = onLoop(i / LOOP_SAMPLES);
    loopLen += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }

  return {
    lane,
    cellW,
    leftEnd,
    rightEnd,
    gapStart,
    gapEnd,
    cellX,
    slotOf,
    onLoop,
    loopLen,
    p0,
    p1,
    p2,
    p3,
  };
}

/** 오른쪽 끝을 지나 고리를 돌아 왼쪽 끝으로 드는 길. */
function wrapPath(g: Geom, fromX: number, toX: number): (p: number) => Pt {
  return (p: number): Pt => {
    if (p < ENTER_SHARE) {
      return { x: fromX + (g.rightEnd - fromX) * (p / ENTER_SHARE), y: RAIL_Y };
    }
    if (p < ENTER_SHARE + LOOP_SHARE) {
      return g.onLoop((p - ENTER_SHARE) / LOOP_SHARE);
    }
    const exitShare = 1 - ENTER_SHARE - LOOP_SHARE;
    return {
      x: g.leftEnd + (toX - g.leftEnd) * ((p - ENTER_SHARE - LOOP_SHARE) / exitShare),
      y: RAIL_Y,
    };
  };
}

function straightPath(fromX: number, toX: number): (p: number) => Pt {
  return (p: number): Pt => ({ x: fromX + (toX - fromX) * p, y: RAIL_Y });
}

export const signedWraparoundStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SignedWraparoundScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const trailFill = shiftLightness(
      c.itemActive,
      params.theme === 'dark' ? TRAIL_SHIFT_DARK : TRAIL_SHIFT_LIGHT,
    );

    const root = el('g', {});
    svg.appendChild(root);

    // 장면마다 통째로 다시 짓는 층들. 살아남은 옛 프레임이 쥔 것은 이미 떨어져
    // 나간 노드가 되므로 화면을 더럽히지 못한다. 재건 밖에 두는 요소는 없다.
    const railLayer = el('g', {});
    const cellLayer = el('g', {});
    const loopLayer = el('g', {});
    const tokenLayer = el('g', {});
    const captionLayer = el('g', {});
    root.append(railLayer, cellLayer, loopLayer, tokenLayer, captionLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * 걸음 하나가 타이머를 여러 번 지난다. 끊기가 그 가운데로 들어오면 남은
     * 프레임이 이미 새로 선 화면을 덮을 수 있으므로, 프레임마다 자기 세대가
     * 아직 유효한지 보고 아니면 화면에 손대지 않고 물러난다. `isInstant` 는
     * 빗장이 아니다 — 러너가 장면 조각에서 그것을 부르지 않는다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function animate(ms: number, mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const startedAt = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) return finish();
          const p = ms <= 0 ? 1 : clamp01((Date.now() - startedAt) / ms);
          onFrame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 캡션 줄 나누기 ─────────────────────────────────────────────────────
    const CAPTION_PX = Number.parseFloat(fontSizes.sm);
    const CAPTION_MAX_W = PIECE_CANVAS_W - 40;

    const runWidth = (s: string): number => {
      let w = 0;
      for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? CAPTION_PX : CAPTION_PX * 0.53;
      return w;
    };

    /** 캡션을 캔버스 폭에 맞춰 줄로 나눈다. 띄어쓰기가 없는 언어는 글자로 끊는다. */
    const wrapCaption = (text: string): string[] => {
      const lines: string[] = [];
      let line = '';
      const push = (): void => {
        if (line.length > 0) lines.push(line);
        line = '';
      };
      for (const word of text.split(' ')) {
        const candidate = line.length === 0 ? word : `${line} ${word}`;
        if (runWidth(candidate) <= CAPTION_MAX_W) {
          line = candidate;
          continue;
        }
        push();
        if (runWidth(word) <= CAPTION_MAX_W) {
          line = word;
          continue;
        }
        for (const ch of word) {
          if (runWidth(line + ch) > CAPTION_MAX_W) push();
          line += ch;
        }
      }
      push();
      return lines.slice(0, CAPTION_LINE_Y.length);
    };

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      railLayer.replaceChildren();
      cellLayer.replaceChildren();
      loopLayer.replaceChildren();
      tokenLayer.replaceChildren();
      captionLayer.replaceChildren();
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function drawRails(g: Geom, concluded: boolean): void {
      // 결론에 이르면 생략 구간까지 한 줄기로 묶인다 — 직선이 아니라 고리였다.
      const tone = concluded ? c.accent : c.border;
      const seg = (x1: number, x2: number, dashed: boolean): SVGLineElement =>
        el('line', {
          x1,
          y1: RAIL_Y,
          x2,
          y2: RAIL_Y,
          stroke: tone,
          'stroke-width': 2,
          'stroke-linecap': 'round',
          ...(dashed ? { 'stroke-dasharray': '3 7' } : {}),
        });
      railLayer.append(
        seg(g.leftEnd, g.gapStart, false),
        seg(g.gapStart, g.gapEnd, true),
        seg(g.gapEnd, g.rightEnd, false),
      );
    }

    /**
     * 칸과 그 아래 값. 채움은 자취, 테두리는 이음매의 표식이라 부딪히지 않는다.
     *
     * 양 끝 칸의 표식과 이름표는 **자취에서 센다** — 그 값을 이미 밟았는가가
     * 곧 그 끝을 짚었는가다.
     */
    function drawCells(g: Geom, seen: ReadonlySet<number>): void {
      const last = g.lane.length - 1;
      for (let slot = 0; slot < g.lane.length; slot += 1) {
        const value = g.lane[slot];
        const walked = seen.has(value);
        const isEnd = slot === 0 || slot === last;
        const marked = isEnd && walked;
        const x = g.cellX(slot);
        cellLayer.appendChild(
          el('rect', {
            x: x - g.cellW / 2 + CELL_INSET,
            y: RAIL_Y - CELL_H / 2,
            width: g.cellW - CELL_INSET * 2,
            height: CELL_H,
            rx: 8,
            fill: walked ? trailFill : c.bgSubtle,
            stroke: marked ? c.accent : c.border,
            'stroke-width': marked ? 2 : 1,
          }),
        );
        const label = el('text', {
          x,
          y: RAIL_Y + LABEL_DY,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: walked ? c.text : c.textMuted,
        });
        label.textContent = String(value);
        cellLayer.appendChild(label);
      }

      // 생략 표식. 도형에 새긴 글리프이므로 문안이 아니다 (C10).
      const elision = el('text', {
        x: (g.gapStart + g.gapEnd) / 2,
        y: RAIL_Y + LABEL_DY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      elision.textContent = '⋯';
      cellLayer.appendChild(elision);

      // `tr` 은 호출부에 리터럴로 둔다 — 래퍼로 감싸면 en 원본이 변수가 되어
      // 선언과의 대조 검사가 이 조각을 통째로 못 본다 (C10).
      const tag = (x: number, text: string, on: boolean): SVGTextElement => {
        const node = el('text', {
          x,
          y: TAG_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: on ? c.text : c.textMuted,
        });
        node.textContent = text;
        return node;
      };
      cellLayer.append(
        tag(g.cellX(0), tr('label.smallest', 'smallest'), seen.has(g.lane[0])),
        tag(g.cellX(last), tr('label.largest', 'largest'), seen.has(g.lane[last])),
      );
    }

    /**
     * 고리. **아직 지나지 않았으면 짓지 않는다** — 숨기기만 하면 앞 걸음의
     * 값이 함께 남는다 (프로토콜 4 절).
     */
    function drawLoop(g: Geom): SVGPathElement {
      const path = el('path', {
        d: `M ${g.p0.x} ${g.p0.y} C ${g.p1.x} ${g.p1.y} ${g.p2.x} ${g.p2.y} ${g.p3.x} ${g.p3.y}`,
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      });
      loopLayer.appendChild(path);
      return path;
    }

    /** 비트 글자의 색은 그 자리의 값이다 — 1 이면 진하고 0 이면 옅다. */
    function paintBits(bits: BitNode[], shown: string): void {
      for (let i = 0; i < bits.length; i += 1) {
        const on = shown[i] === '1';
        bits[i].glyph.textContent = on ? '1' : '0';
        bits[i].glyph.setAttribute('fill', on ? c.text : c.textMuted);
      }
    }

    /** 표식. 값과 비트열을 함께 싣고 움직인다. */
    function drawToken(
      g: Geom,
      bitWidth: number,
      value: number,
      step: WraparoundStep | null,
    ): Pick<Drawn, 'tokenG' | 'value' | 'bits'> {
      const tokenG = el('g', {
        transform: `translate(${g.cellX(g.slotOf(value))} ${RAIL_Y})`,
      });
      const tokenW = g.cellW - TOKEN_INSET * 2;
      tokenG.appendChild(
        el('rect', {
          x: -tokenW / 2,
          y: -TOKEN_H / 2,
          width: tokenW,
          height: TOKEN_H,
          rx: 8,
          fill: c.itemActive,
        }),
      );
      const valueText = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: c.stateInk,
      });
      valueText.textContent = String(value);
      tokenG.appendChild(valueText);

      const bitX = (i: number): number => (i - (bitWidth - 1) / 2) * BIT_ADV;

      // 부호 자리를 가르는 칸막이. 구조라 늘 서 있다.
      tokenG.appendChild(
        el('line', {
          x1: bitX(0) + BIT_ADV / 2,
          y1: -BIT_DY + SIGN_DIV_TOP,
          x2: bitX(0) + BIT_ADV / 2,
          y2: -BIT_DY + SIGN_DIV_BOT,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      // 이번 걸음에 뒤집힌 자리. 자리올림이 번진 만큼 밑줄이 이어진다.
      const flipped = step === null ? [] : carryOrder(step, bitWidth);
      const bits: BitNode[] = [];
      for (let i = 0; i < bitWidth; i += 1) {
        const glyph = el('text', {
          x: bitX(i),
          y: -BIT_DY,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        tokenG.appendChild(glyph);
        let rule: SVGLineElement | null = null;
        if (flipped.includes(i)) {
          rule = el('line', {
            x1: bitX(i) - BIT_RULE_HALF,
            y1: -BIT_DY + BIT_RULE_DY,
            x2: bitX(i) + BIT_RULE_HALF,
            y2: -BIT_DY + BIT_RULE_DY,
            stroke: c.accent,
            'stroke-width': 1.6,
            'stroke-linecap': 'round',
          });
          tokenG.appendChild(rule);
        }
        bits.push({ glyph, rule });
      }
      paintBits(bits, toBits(value, bitWidth));
      tokenLayer.appendChild(tokenG);
      return { tokenG, value: valueText, bits };
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(scene: SignedWraparoundScene): Drawn {
      const g = geomOf(scene.bitWidth);
      const seen = new Set<number>(scene.visited);
      drawRails(g, scene.concluded);
      drawCells(g, seen);
      const loop = scene.wrapped ? drawLoop(g) : null;
      const token = drawToken(g, scene.bitWidth, nowValue(scene), scene.step);
      return { geom: g, loop, ...token };
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionText(cap: WraparoundCaption, bitWidth: number): string {
      switch (cap.kind) {
        case 'step':
          return tr('caption.step', 'Add one — the marker steps one cell right: {to}', {
            to: cap.to,
          });
        case 'atMax':
          return tr(
            'caption.atMax',
            'The right end — the largest signed value {bits} bits hold is {to}',
            { bits: bitWidth, to: cap.to },
          );
        case 'wrap':
          return tr(
            'caption.wrap',
            'One more — the carry runs into the sign bit, and past the right end the marker comes out at the left: {to}',
            { to: cap.to },
          );
        case 'afterWrap':
          return tr('caption.afterWrap', 'From here it walks right again: {to}', { to: cap.to });
        case 'conclusion':
          return tr(
            'caption.conclusion',
            'Not a line but a ring — the largest value is followed by the smallest',
          );
      }
    }

    function drawCaption(scene: SignedWraparoundScene): void {
      if (scene.caption === null) return;
      const lines = wrapCaption(captionText(scene.caption, scene.bitWidth));
      for (let i = 0; i < lines.length; i += 1) {
        const node = el('text', {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION_LINE_Y[i],
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        node.textContent = lines[i];
        captionLayer.appendChild(node);
      }
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────

    /**
     * 표식을 길 위로 옮기면서 달라지는 비트를 오른쪽에서 왼쪽으로 뒤집는다.
     * 고리를 지나는 걸음이면 지나온 만큼 길이 그어진다.
     *
     * 정적 그리기가 이미 끝 자리를 세워 두었으므로 첫 프레임이 출발 그림으로
     * 도로 물린다. 출발값은 `step` 이 싣고 온 계기값이다 — `prev` 를 들추지
     * 않는다 (S-scene). 옮길 것이 여럿이지만 한 뜻으로 묶인 운동이라 시계는
     * 하나다.
     */
    async function flow(
      scene: SignedWraparoundScene,
      step: WraparoundStep,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const g = drawn.geom;
      const fromX = g.cellX(g.slotOf(step.from));
      const toX = g.cellX(g.slotOf(step.to));
      const path = step.kind === 'wrap' ? wrapPath(g, fromX, toX) : straightPath(fromX, toX);
      const order = carryOrder(step, scene.bitWidth);
      const fromBits = toBits(step.from, scene.bitWidth);
      const toBitsStr = toBits(step.to, scene.bitWidth);

      await animate(step.kind === 'wrap' ? WRAP_MS : MOVE_MS, mine, (raw) => {
        const e = easeInOut(raw);
        const pt = path(e);
        drawn.tokenG.setAttribute('transform', `translate(${pt.x} ${pt.y})`);

        if (drawn.loop !== null && step.kind === 'wrap') {
          const drawnShare = clamp01((e - ENTER_SHARE) / LOOP_SHARE);
          drawn.loop.setAttribute('stroke-dasharray', String(g.loopLen));
          drawn.loop.setAttribute('stroke-dashoffset', String(g.loopLen * (1 - drawnShare)));
        }

        const q = clamp01((e - RIPPLE_FROM) / (RIPPLE_TO - RIPPLE_FROM));
        const reached = Math.round(q * order.length);
        const shown = fromBits.split('');
        for (let k = 0; k < reached; k += 1) shown[order[k]] = toBitsStr[order[k]] ?? '0';
        paintBits(drawn.bits, shown.join(''));
        // 밑줄은 자리올림이 닿은 자리까지만 따라간다.
        for (let k = 0; k < order.length; k += 1) {
          drawn.bits[order[k]]?.rule?.setAttribute('opacity', k < reached ? '1' : '0');
        }

        drawn.value.textContent = String(e >= VALUE_SWITCH ? step.to : step.from);
      });
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만
     * 흐르게 한다. `prev` 는 쓰지 않는다 — 고를 것이 `step` 하나뿐이다.
     */
    async function render(
      next: SignedWraparoundScene,
      _prev: SignedWraparoundScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      rewind();
      const drawn = drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step === null) return;

      await flow(next, step, drawn, mine);
      if (!alive(mine)) return;

      // 흐르며 남은 밑줄의 opacity · 고리의 점선 자국 · 보간된 좌표 끝자리가
      // 노드째 사라진다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      rewind();
      drawStatic(next);
      drawCaption(next);
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
        root.remove();
      },
    };
  },
};
