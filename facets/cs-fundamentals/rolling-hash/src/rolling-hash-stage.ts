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
 * 글자를 물들이지 않는다. 대신 **빠지는 글자 하나가 위로 날아 나가고, 들어오는
 * 글자 하나가 위에서 내려와 앉는다.** 창틀은 창의 자리만 말한다.
 *
 * 바퀴가 지나간 자리마다 값이 레일 아래에 남아, 창이 한 바퀴 돌아 같은 네 글자로
 * 돌아왔을 때 처음 값과 같은 수가 양 끝에 서는 것이 보인다.
 *
 * 세로는 이 파일이 정하고 가로는 러너가 정한다 (S-piece). 색은 전부
 * design-tokens 경유이며 hex 리터럴은 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 내용이 정한다 — 기준 자리 · 글자 줄 · 레일 · 자취 · 캡션. */
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

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export type RollingHashScene = {
  text: string;
  pattern: string;
};

/**
 * `initialData` 를 좁힌다. 좁히개는 stage 가 내주고 `mount` 가 부른다 —
 * 좁히는 규칙이 두 벌이 되지 않게 (S-piece).
 */
export function readRollingHashScene(raw: unknown): RollingHashScene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    text: typeof d.text === 'string' ? d.text : '',
    pattern: typeof d.pattern === 'string' ? d.pattern : '',
  };
}

type WindowInit = {
  start: number;
  hash: number;
  match: boolean;
};

type WindowRoll = {
  start: number;
  outIndex: number;
  outTerm: number;
  inIndex: number;
  inValue: number;
  hash: number;
  match: boolean;
  wrapped: boolean;
};

type CellState = 'outside' | 'inside' | 'reading' | 'leaving';

export const rollingHashStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const scene = readRollingHashScene(params.initialData);

    const letters = [...scene.text];
    const patternLetters = [...scene.pattern];
    const cellCount = Math.max(1, letters.length);
    const patLen = Math.max(1, patternLetters.length);
    const lastStart = letters.length - patLen;

    // 그 폭을 채운다 — 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
    const cellW = Math.min(
      CELL_MAX_W,
      Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / cellCount),
    );
    const rowW = cellW * cellCount;
    const originX = Math.round((PIECE_CANVAS_W - rowW) / 2);

    const cellX = (i: number): number => originX + i * cellW;
    const cellMidX = (i: number): number => cellX(i) + cellW / 2;
    const frameX = (start: number): number => cellX(start) - FRAME_PAD;
    const frameW = cellW * patLen + FRAME_PAD * 2;
    const windowMidX = (start: number): number => originX + (start + patLen / 2) * cellW;

    // ── 뒷일 정리 채널 (S-piece) ─────────────────────────────────────────
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';

    function schedule(cb: () => void): number {
      if (hasRaf) return requestAnimationFrame(() => cb());
      return setTimeout(cb, 16) as unknown as number;
    }

    function unschedule(id: number): void {
      if (hasRaf) cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    }

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

    function animate(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = schedule(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 그리기 ───────────────────────────────────────────────────────────
    const svg = params.canvas;
    const root = el('g');
    svg.appendChild(root);

    // 레일 — 바퀴가 구르는 바닥.
    root.appendChild(
      el('line', {
        x1: originX,
        y1: RAIL_Y,
        x2: originX + rowW,
        y2: RAIL_Y,
        stroke: palette.border,
        'stroke-width': 1,
      }),
    );

    // 바퀴가 지나온 길 — 총평 때 한 번에 그어진다.
    const recap = el('line', {
      x1: originX,
      y1: RAIL_Y,
      x2: originX,
      y2: RAIL_Y,
      stroke: palette.text,
      'stroke-width': 3,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    root.appendChild(recap);

    // `hash` 는 도식 라벨 한 단어라 표식이다 — 키를 만들지 않는다 (C10).
    const hashLabel = el('text', {
      x: originX,
      y: WHEEL_Y + 4,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: palette.textMuted,
    });
    hashLabel.textContent = 'hash';
    root.appendChild(hashLabel);

    // ── 기준 자리 — 찾는 조각과 그 해시 ─────────────────────────────────
    const targetBandW = patLen * TARGET_CELL_W + TARGET_GAP + TARGET_PILL_W;
    const targetX = originX + rowW - targetBandW;

    const patternLabel = el('text', {
      x: targetX - 10,
      y: TARGET_Y + TARGET_CELL_H / 2 + 4,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: palette.textMuted,
    });
    patternLabel.textContent = 'pattern';
    root.appendChild(patternLabel);

    patternLetters.forEach((ch, i) => {
      root.appendChild(
        el('rect', {
          x: targetX + i * TARGET_CELL_W,
          y: TARGET_Y,
          width: TARGET_CELL_W,
          height: TARGET_CELL_H,
          rx: 5,
          fill: palette.bgSubtle,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );
      const t = el('text', {
        x: targetX + i * TARGET_CELL_W + TARGET_CELL_W / 2,
        y: TARGET_Y + TARGET_CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: palette.text,
      });
      t.textContent = ch;
      root.appendChild(t);
    });

    const targetPillX = targetX + patLen * TARGET_CELL_W + TARGET_GAP;
    const targetG = el('g', { opacity: 0 });
    const targetPill = el('rect', {
      x: targetPillX,
      y: TARGET_Y,
      width: TARGET_PILL_W,
      height: TARGET_CELL_H,
      rx: TARGET_CELL_H / 2,
      fill: palette.itemDefault,
      stroke: palette.text,
      'stroke-width': 1.5,
    });
    targetG.appendChild(targetPill);
    const targetValue = el('text', {
      x: targetPillX + TARGET_PILL_W / 2,
      y: TARGET_Y + TARGET_CELL_H / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    targetG.appendChild(targetValue);
    root.appendChild(targetG);

    // ── 글자 줄 ──────────────────────────────────────────────────────────
    const cellRects: SVGRectElement[] = [];
    const cellTexts: SVGTextElement[] = [];

    letters.forEach((ch, i) => {
      const rect = el('rect', {
        x: cellX(i),
        y: ROW_Y,
        width: cellW,
        height: CELL_H,
        rx: 6,
        fill: palette.itemDefault,
        stroke: palette.border,
        'stroke-width': 1,
      });
      root.appendChild(rect);
      cellRects.push(rect);

      const t = el('text', {
        x: cellMidX(i),
        y: ROW_MID_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: palette.text,
      });
      t.textContent = ch;
      root.appendChild(t);
      cellTexts.push(t);
    });

    // ── 창틀 ─────────────────────────────────────────────────────────────
    const frame = el('rect', {
      x: frameX(0),
      y: FRAME_Y,
      width: frameW,
      height: FRAME_H,
      rx: 10,
      fill: 'none',
      stroke: palette.text,
      'stroke-width': 2,
      opacity: 0,
    });
    root.appendChild(frame);

    const connector = el('line', {
      x1: windowMidX(0),
      y1: FRAME_Y + FRAME_H,
      x2: windowMidX(0),
      y2: WHEEL_Y - WHEEL_R,
      stroke: palette.border,
      'stroke-width': 2,
      opacity: 0,
    });
    root.appendChild(connector);

    // ── 바퀴 ─────────────────────────────────────────────────────────────
    const wheelG = el('g', { opacity: 0 });
    const wheelFace = el('circle', {
      cx: 0,
      cy: 0,
      r: WHEEL_R,
      fill: palette.itemDefault,
      stroke: palette.text,
      'stroke-width': 2,
    });
    wheelG.appendChild(wheelFace);

    const spokeG = el('g');
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
    wheelG.appendChild(spokeG);

    const wheelValue = el('text', {
      x: 0,
      y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
      fill: palette.text,
    });
    wheelG.appendChild(wheelValue);
    root.appendChild(wheelG);

    // ── 바퀴가 남기는 자취 ───────────────────────────────────────────────
    const trailTexts: SVGTextElement[] = [];
    const wrapTicks: SVGLineElement[] = [];

    for (let s = 0; s <= lastStart; s += 1) {
      const t = el('text', {
        x: windowMidX(s),
        y: TRAIL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
        opacity: 0,
      });
      root.appendChild(t);
      trailTexts.push(t);

      const tick = el('line', {
        x1: windowMidX(s) - 13,
        y1: WRAP_TICK_Y,
        x2: windowMidX(s) + 13,
        y2: WRAP_TICK_Y,
        stroke: palette.text,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        opacity: 0,
      });
      root.appendChild(tick);
      wrapTicks.push(tick);
    }

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    root.appendChild(caption);

    // ── 상태 ─────────────────────────────────────────────────────────────
    let spinDeg = 0;

    function paintCell(i: number, state: CellState): void {
      const rect = cellRects[i];
      const label = cellTexts[i];
      if (!rect || !label) return;
      const fill =
        state === 'reading'
          ? palette.itemComparing
          : state === 'leaving'
            ? palette.itemSwapping
            : state === 'inside'
              ? palette.bgSubtle
              : palette.itemDefault;
      rect.setAttribute('fill', fill);
      label.setAttribute(
        'fill',
        state === 'reading' || state === 'leaving' ? palette.stateInk : palette.text,
      );
    }

    function setWheel(midX: number, dy: number, deg: number): void {
      wheelG.setAttribute('transform', `translate(${midX} ${WHEEL_Y + dy})`);
      spokeG.setAttribute('transform', `rotate(${deg})`);
      connector.setAttribute('x1', String(midX));
      connector.setAttribute('x2', String(midX));
    }

    function applyMatch(match: boolean): void {
      wheelFace.setAttribute('fill', match ? palette.itemPivot : palette.itemDefault);
      wheelValue.setAttribute('fill', match ? palette.stateInk : palette.text);
      targetPill.setAttribute('fill', match ? palette.itemPivot : palette.itemDefault);
      targetValue.setAttribute('fill', match ? palette.stateInk : palette.text);
    }

    function makeChip(label: string, fill: string): SVGGElement {
      const w = 18 + label.length * 8;
      const g = el('g');
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
      const t = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: palette.stateInk,
      });
      t.textContent = label;
      g.appendChild(t);
      root.appendChild(g);
      return g;
    }

    async function dropTrail(start: number, value: number, match: boolean): Promise<void> {
      const mark = trailTexts[start];
      if (!mark) return;
      mark.textContent = String(value);
      mark.setAttribute('fill', match ? palette.text : palette.textMuted);
      await animate(180, (p) => {
        mark.setAttribute('opacity', String(p));
        mark.setAttribute('y', String(TRAIL_Y - 9 * (1 - p)));
      });
    }

    // ── projector 가 부르는 표면 ─────────────────────────────────────────
    function setCaption(text: string): void {
      caption.textContent = text;
    }

    async function showPattern(p: { hash: number }): Promise<void> {
      targetValue.textContent = String(p.hash);
      await animate(300, (t) => {
        targetG.setAttribute('transform', `translate(0 ${-18 * (1 - t)})`);
        targetG.setAttribute('opacity', String(t));
      });
    }

    async function openWindow(w: WindowInit): Promise<void> {
      // 창틀이 좁혀 들어와 자리를 잡는다.
      frame.setAttribute('opacity', '1');
      await animate(220, (t) => {
        const slack = 14 * (1 - t);
        frame.setAttribute('x', String(frameX(w.start) - slack));
        frame.setAttribute('width', String(frameW + slack * 2));
      });

      // 첫 창은 네 글자를 모두 읽는다 — 이 조각이 덜어 내려는 값이다.
      for (let k = 0; k < patLen; k += 1) {
        const i = w.start + k;
        paintCell(i, 'reading');
        await wait(110);
        paintCell(i, 'inside');
      }

      // 셈한 값이 레일 위에 내려앉는다.
      wheelValue.textContent = String(w.hash);
      applyMatch(w.match);
      spinDeg = 0;
      connector.setAttribute('opacity', '1');
      wheelG.setAttribute('opacity', '1');
      await animate(280, (t) => {
        setWheel(windowMidX(w.start), -34 * (1 - t), -150 * (1 - t));
        wheelG.setAttribute('opacity', String(t));
      });
      setWheel(windowMidX(w.start), 0, 0);
      await dropTrail(w.start, w.hash, w.match);
    }

    async function roll(r: WindowRoll): Promise<void> {
      // 1) 앞 글자가 빠져나간다 — 빼는 값을 달고 위로.
      paintCell(r.outIndex, 'leaving');
      const outChip = makeChip(`−${r.outTerm}`, palette.itemSwapping);
      const outX = cellMidX(r.outIndex);
      await animate(200, (t) => {
        outChip.setAttribute(
          'transform',
          `translate(${outX - 10 * t} ${ROW_MID_Y + (CHIP_MID_Y - ROW_MID_Y) * t})`,
        );
        outChip.setAttribute('opacity', String(t < 0.7 ? 1 : (1 - t) / 0.3));
      });
      outChip.remove();
      paintCell(r.outIndex, 'outside');

      // 2) 창이 한 칸 구른다 — 뒤 글자가 내려와 앉는다.
      paintCell(r.inIndex, 'reading');
      const inChip = makeChip(`+${r.inValue}`, palette.itemComparing);
      const inX = cellMidX(r.inIndex);
      const fromX = frameX(r.start - 1);
      const toX = frameX(r.start);
      const fromMid = windowMidX(r.start - 1);
      const toMid = windowMidX(r.start);
      const baseDeg = spinDeg;
      await animate(380, (t) => {
        frame.setAttribute('x', String(fromX + (toX - fromX) * t));
        const midX = fromMid + (toMid - fromMid) * t;
        // 참된 구름 — 회전각은 굴러간 거리를 반지름으로 나눈 값이다.
        setWheel(midX, 0, baseDeg + ((midX - fromMid) / WHEEL_R) * DEG_PER_RAD);
        inChip.setAttribute(
          'transform',
          `translate(${inX} ${CHIP_MID_Y + (ROW_MID_Y - CHIP_MID_Y) * t})`,
        );
        inChip.setAttribute('opacity', String(t < 0.75 ? 1 : (1 - t) / 0.25));
      });
      spinDeg = baseDeg + ((toMid - fromMid) / WHEEL_R) * DEG_PER_RAD;
      inChip.remove();
      paintCell(r.inIndex, 'inside');

      // 3) 굴러온 값이 다음 값이 된다.
      wheelValue.textContent = String(r.hash);
      applyMatch(r.match);
      await animate(170, (t) => {
        const pop = 1 + Math.sin(Math.PI * t) * 0.18;
        wheelValue.setAttribute('transform', `scale(${pop})`);
      });
      wheelValue.setAttribute('transform', 'scale(1)');

      await dropTrail(r.start, r.hash, r.match);

      // 창이 한 바퀴 돌아 같은 네 글자로 왔다 — 양 끝의 값이 같다.
      if (r.wrapped) {
        for (const s of [0, r.start]) {
          trailTexts[s]?.setAttribute('fill', palette.text);
          wrapTicks[s]?.setAttribute('opacity', '1');
        }
      }
    }

    async function finish(): Promise<void> {
      if (lastStart < 0) return;
      const from = windowMidX(0);
      const to = windowMidX(lastStart);
      recap.setAttribute('x1', String(from));
      recap.setAttribute('opacity', '1');
      await animate(620, (t) => {
        recap.setAttribute('x2', String(from + (to - from) * t));
      });
    }

    function rewind(): void {
      spinDeg = 0;
      frame.setAttribute('opacity', '0');
      frame.setAttribute('x', String(frameX(0)));
      frame.setAttribute('width', String(frameW));
      connector.setAttribute('opacity', '0');
      wheelG.setAttribute('opacity', '0');
      wheelValue.textContent = '';
      wheelValue.setAttribute('transform', 'scale(1)');
      setWheel(windowMidX(0), 0, 0);
      applyMatch(false);
      targetG.setAttribute('opacity', '0');
      targetG.setAttribute('transform', 'translate(0 0)');
      targetValue.textContent = '';
      recap.setAttribute('opacity', '0');
      recap.setAttribute('x2', String(windowMidX(0)));
      for (const mark of trailTexts) {
        mark.textContent = '';
        mark.setAttribute('opacity', '0');
        mark.setAttribute('y', String(TRAIL_Y));
        mark.setAttribute('fill', palette.textMuted);
      }
      for (const tick of wrapTicks) tick.setAttribute('opacity', '0');
      for (let i = 0; i < cellRects.length; i += 1) paintCell(i, 'outside');
      caption.textContent = '';
    }

    function destroy(): void {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const id of frames) unschedule(id);
      frames.clear();
      // 걸어 둔 것을 거두는 것만으로는 모자라다 — 기다리던 것을 깨워야
      // `await ctx.emit` 이 돌아온다 (S-piece).
      for (const wake of [...waiters]) wake();
      waiters.clear();
      root.remove();
    }

    setWheel(windowMidX(0), 0, 0);

    return {
      setCaption,
      showPattern,
      openWindow,
      roll,
      finish,
      rewind,
      destroy,
    };
  },
};
