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
 * 일이다 (S-piece). 비트열은 표식과 함께 움직이며, 값이 바뀔 때 달라지는
 * 자리가 오른쪽에서 왼쪽으로 차례로 뒤집힌다. 넘어가는 걸음에서는 그 번짐이
 * 부호 자리까지 닿는다.
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
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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

type Pt = { x: number; y: number };

export type WraparoundStep = {
  from: number;
  to: number;
  fromBits: string;
  toBits: string;
  atMax: boolean;
};

type Scene = { bitWidth: number; start: number };

/**
 * `initialData` 를 좁힌다. 받는 자리는 mount 하나뿐이다 (S-piece) — projector 는
 * 걸음마다 오는 payload 만 좁혀 넘긴다.
 */
function readScene(initialData: Record<string, unknown> | undefined): Scene {
  const d = initialData ?? {};
  const rawWidth = d.bitWidth;
  const bitWidth = typeof rawWidth === 'number' && rawWidth >= 4 ? Math.floor(rawWidth) : 8;
  const max = 2 ** (bitWidth - 1) - 1;
  const min = -(2 ** (bitWidth - 1));
  const rawStart = d.start;
  const start =
    typeof rawStart === 'number' ? Math.min(max, Math.max(min, Math.trunc(rawStart))) : max - 2;
  return { bitWidth, start };
}

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

export const signedWraparoundStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const min = -(2 ** (scene.bitWidth - 1));
    const max = 2 ** (scene.bitWidth - 1) - 1;
    /** 화면에 실제로 놓이는 여섯 값 — 왼쪽 끝 셋과 오른쪽 끝 셋. */
    const lane = [min, min + 1, min + 2, max - 2, max - 1, max];

    // ── 자리 셈. 크기는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
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

    /** 값이 놓인 칸. 여섯 칸 밖의 값은 생략 구간 쪽 끝으로 붙인다. */
    const slotOf = (value: number): number => {
      const found = lane.indexOf(value);
      if (found >= 0) return found;
      return value < 0 ? LANE_CELLS - 1 : LANE_CELLS;
    };

    // ── 고리. 오른쪽 끝에서 나가 아래로 돌아 왼쪽 끝으로 들어온다.
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
    {
      let prev = onLoop(0);
      for (let i = 1; i <= LOOP_SAMPLES; i += 1) {
        const cur = onLoop(i / LOOP_SAMPLES);
        loopLen += Math.hypot(cur.x - prev.x, cur.y - prev.y);
        prev = cur;
      }
    }

    // ── 그리기.
    const root = el('g', {});
    svg.appendChild(root);

    const railLeft = el('line', {
      x1: leftEnd,
      y1: RAIL_Y,
      x2: gapStart,
      y2: RAIL_Y,
      stroke: c.border,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    const railGap = el('line', {
      x1: gapStart,
      y1: RAIL_Y,
      x2: gapEnd,
      y2: RAIL_Y,
      stroke: c.border,
      'stroke-width': 2,
      'stroke-dasharray': '3 7',
      'stroke-linecap': 'round',
    });
    const railRight = el('line', {
      x1: gapEnd,
      y1: RAIL_Y,
      x2: rightEnd,
      y2: RAIL_Y,
      stroke: c.border,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    root.appendChild(railLeft);
    root.appendChild(railGap);
    root.appendChild(railRight);

    const cells: SVGRectElement[] = [];
    for (let slot = 0; slot < lane.length; slot += 1) {
      const x = cellX(slot);
      const rect = el('rect', {
        x: x - cellW / 2 + CELL_INSET,
        y: RAIL_Y - CELL_H / 2,
        width: cellW - CELL_INSET * 2,
        height: CELL_H,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      cells.push(rect);
      root.appendChild(rect);

      const label = el('text', {
        x,
        y: RAIL_Y + LABEL_DY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = String(lane[slot]);
      root.appendChild(label);
    }

    // 생략 표식. 도형에 새긴 글리프이므로 문안이 아니다 (C10).
    const elision = el('text', {
      x: (gapStart + gapEnd) / 2,
      y: RAIL_Y + LABEL_DY,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    elision.textContent = '⋯';
    root.appendChild(elision);

    const smallestTag = el('text', {
      x: cellX(0),
      y: TAG_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    smallestTag.textContent = tr('label.smallest', 'smallest');
    root.appendChild(smallestTag);

    const largestTag = el('text', {
      x: cellX(lane.length - 1),
      y: TAG_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    largestTag.textContent = tr('label.largest', 'largest');
    root.appendChild(largestTag);

    const loop = el('path', {
      d:
        `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`,
      fill: 'none',
      stroke: c.accent,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-dasharray': loopLen,
      'stroke-dashoffset': loopLen,
    });
    root.appendChild(loop);

    // ── 표식. 값과 비트열을 함께 싣고 움직인다.
    const tokenG = el('g', {});
    const tokenW = cellW - TOKEN_INSET * 2;
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
    tokenG.appendChild(valueText);

    const bitTexts: SVGTextElement[] = [];
    for (let i = 0; i < scene.bitWidth; i += 1) {
      const t = el('text', {
        x: (i - (scene.bitWidth - 1) / 2) * BIT_ADV,
        y: -BIT_DY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      bitTexts.push(t);
      tokenG.appendChild(t);
    }
    root.appendChild(tokenG);

    const captionLines = CAPTION_LINE_Y.map((y) => {
      const t = el('text', {
        x: PIECE_CANVAS_W / 2,
        y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      root.appendChild(t);
      return t;
    });

    // ── 상태 갱신.
    const placeToken = (x: number, y: number): void => {
      tokenG.setAttribute('transform', `translate(${x} ${y})`);
    };

    const setValue = (value: number): void => {
      valueText.textContent = String(value);
    };

    /** 비트열을 칠한다. 부호 자리는 늘 진하고, 방금 뒤집힌 자리만 강조한다. */
    const paintBits = (bits: string, hot: number): void => {
      for (let i = 0; i < bitTexts.length; i += 1) {
        const node = bitTexts[i];
        node.textContent = bits[i] ?? '0';
        node.setAttribute('fill', i === hot ? c.accent : i === 0 ? c.text : c.textMuted);
      }
    };

    const setEndEmphasis = (slot: number, on: boolean): void => {
      const rect = cells[slot];
      rect.setAttribute('stroke', on ? c.accent : c.border);
      rect.setAttribute('stroke-width', on ? '2' : '1');
      const tag = slot === 0 ? smallestTag : largestTag;
      tag.setAttribute('fill', on ? c.text : c.textMuted);
    };

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
      return lines.slice(0, captionLines.length);
    };

    // ── 시간. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(dur: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(1);
          return resolve();
        }
        const startedAt = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - startedAt) / dur);
          onFrame(p);
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
        tick();
      });
    }

    /**
     * 표식을 길 위로 옮기면서, 달라지는 비트를 오른쪽에서 왼쪽으로 뒤집는다.
     * 고리를 지나는 걸음이면 지나온 만큼 길이 그어진다.
     */
    const travel = async (opts: {
      path: (p: number) => Pt;
      dur: number;
      fromBits: string;
      toBits: string;
      toValue: number;
      drawLoop: boolean;
    }): Promise<void> => {
      const diff: number[] = [];
      for (let i = opts.fromBits.length - 1; i >= 0; i -= 1) {
        if (opts.fromBits[i] !== opts.toBits[i]) diff.push(i);
      }
      let switched = false;

      await animate(opts.dur, (raw) => {
        const e = easeInOut(raw);
        const pt = opts.path(e);
        placeToken(pt.x, pt.y);

        if (opts.drawLoop) {
          const drawn = clamp01((e - ENTER_SHARE) / LOOP_SHARE);
          loop.setAttribute('stroke-dashoffset', String(loopLen * (1 - drawn)));
        }

        const q = clamp01((e - RIPPLE_FROM) / (RIPPLE_TO - RIPPLE_FROM));
        const flipped = Math.round(q * diff.length);
        const shown = opts.fromBits.split('');
        for (let k = 0; k < flipped; k += 1) shown[diff[k]] = opts.toBits[diff[k]];
        paintBits(shown.join(''), flipped > 0 ? diff[flipped - 1] : -1);

        if (!switched && e >= VALUE_SWITCH) {
          switched = true;
          setValue(opts.toValue);
        }
      });

      paintBits(opts.toBits, -1);
      setValue(opts.toValue);
    };

    /** 오른쪽 끝을 지나 고리를 돌아 왼쪽 끝으로 드는 길. */
    const wrapPath = (fromX: number, toX: number) => (p: number): Pt => {
      if (p < ENTER_SHARE) {
        return { x: fromX + (rightEnd - fromX) * (p / ENTER_SHARE), y: RAIL_Y };
      }
      if (p < ENTER_SHARE + LOOP_SHARE) {
        return onLoop((p - ENTER_SHARE) / LOOP_SHARE);
      }
      const exitShare = 1 - ENTER_SHARE - LOOP_SHARE;
      return {
        x: leftEnd + (toX - leftEnd) * ((p - ENTER_SHARE - LOOP_SHARE) / exitShare),
        y: RAIL_Y,
      };
    };

    const straightPath = (fromX: number, toX: number) => (p: number): Pt => ({
      x: fromX + (toX - fromX) * p,
      y: RAIL_Y,
    });

    const restore = (): void => {
      for (const line of captionLines) line.textContent = '';
      loop.setAttribute('stroke-dashoffset', String(loopLen));
      for (const rail of [railLeft, railGap, railRight]) rail.setAttribute('stroke', c.border);
      setEndEmphasis(0, false);
      setEndEmphasis(lane.length - 1, false);
      placeToken(cellX(slotOf(scene.start)), RAIL_Y);
      setValue(scene.start);
      paintBits(bitsOf(scene.start, scene.bitWidth), -1);
    };

    restore();

    return {
      setCaption(text: string): void {
        const lines = wrapCaption(text);
        for (let i = 0; i < captionLines.length; i += 1) {
          captionLines[i].textContent = lines[i] ?? '';
        }
      },

      async advanceTo(step: WraparoundStep): Promise<void> {
        await travel({
          path: straightPath(cellX(slotOf(step.from)), cellX(slotOf(step.to))),
          dur: MOVE_MS,
          fromBits: step.fromBits,
          toBits: step.toBits,
          toValue: step.to,
          drawLoop: false,
        });
        if (step.atMax) setEndEmphasis(lane.length - 1, true);
      },

      async wrapTo(step: WraparoundStep): Promise<void> {
        await travel({
          path: wrapPath(cellX(slotOf(step.from)), cellX(slotOf(step.to))),
          dur: WRAP_MS,
          fromBits: step.fromBits,
          toBits: step.toBits,
          toValue: step.to,
          drawLoop: true,
        });
        setEndEmphasis(0, true);
      },

      /** 다 보인 뒤 — 직선이던 것이 한 줄기 고리였음을 색으로 묶는다. */
      conclude(): void {
        for (const rail of [railLeft, railGap, railRight]) rail.setAttribute('stroke', c.accent);
        setEndEmphasis(0, true);
        setEndEmphasis(lane.length - 1, true);
      },

      restore(): void {
        restore();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};

/** 2의 보수 비트열. algorithm 과 같은 셈을 화면 복원에도 쓴다. */
function bitsOf(value: number, bitWidth: number): string {
  const span = 2 ** bitWidth;
  const raw = ((value % span) + span) % span;
  let out = '';
  for (let i = bitWidth - 1; i >= 0; i -= 1) {
    out += Math.floor(raw / 2 ** i) % 2 === 1 ? '1' : '0';
  }
  return out;
}
