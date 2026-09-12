/**
 * write-back vs write-through 조각의 stage view.
 *
 * ── 형태가 어디서 나왔나
 *
 * 동사는 **모인다** 이다. 그래서 고침 하나를 점 하나로 두고, 그 점이 위의
 * 차례표에서 떨어져 어디에 앉는지로 두 정책을 가른다.
 *
 *   왼쪽 write-through — 점이 줄을 스치고 **곧장 아래층까지** 내려가 상자
 *                        하나가 된다. 줄 위에는 아무것도 남지 않는다.
 *   오른쪽 write-back  — 점이 줄 위에 **앉아 쌓인다.** 그 줄이 쫓겨날 때
 *                        쌓인 점들이 상자 하나에 실려 함께 내려간다.
 *
 * 그래서 아래 두 칸에 담기는 점은 양쪽 다 일곱 개인데, 상자는 왼쪽이 일곱이고
 * 오른쪽이 넷이다. 견주는 일이 계기판의 두 숫자가 아니라 **같은 짐을 몇 번에
 * 나눠 날랐는가** 로 보이게 하려는 짜임이다.
 *
 * 좌표는 전부 캔버스에서 역산한다. 세로만 이 파일이 상수로 갖는다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다 — 차례표 · 두 lane · 캡션 두 줄. */
const H = 298;

const PAD = 18;
const LANE_GAP = 16;
const LANE_W = Math.floor((W - PAD * 2 - LANE_GAP) / 2);
const LANE_X = [PAD, PAD + LANE_W + LANE_GAP] as const;

const THROUGH = 0;
const BACK = 1;

const CHIP_Y = 12;
const CHIP_H = 26;
const CHIP_MAX_W = 40;
const CHIP_GAP = 6;
const CURSOR_Y = 42;
const CURSOR_H = 3;

const LANE_TOP = 56;
const LANE_BOTTOM = 252;
const TITLE_Y = 74;
const CACHE_LABEL_Y = 92;
const SLOT_Y = 98;
const SLOT_H = 44;
const SLOT_GAP = 10;
const TAG_W = 36;
const TAG_H = 18;
const TAG_Y = SLOT_Y + 6;
const DOT_ROW_Y = SLOT_Y + 32;
const DOT_GAP = 10;
const DOT_R = 3.6;

const MEM_LABEL_Y = 196;
const BAR_Y = 202;
const BAR_H = 42;
const TOKEN_Y = BAR_Y + 7;
const TOKEN_H = 28;
const TOKEN_GAP = 5;
const TOKEN_MAX_W = 34;
const TOKEN_DOT_GAP = 7;

const CAPTION_Y = [270, 288] as const;

const CURSOR_MS = 140;
const TAG_MS = 190;
const MARK_MS = 230;
const DROP_MS = 320;
const FLUSH_STAGGER_MS = 90;

/**
 * lane 이름은 그 분야에서 원어 그대로 쓰는 말이라 표식이다 — 키를 만들지 않는다
 * (C10 의 판정 2). 한국어 글도 write-back / write-through 로 적는다.
 */
const LANE_NAME = ['write-through', 'write-back'] as const;

export type WriteBackStepView = {
  index: number;
  line: number;
  slot: number;
  hit: boolean;
  marks: number;
  evictSlot: number;
  evictLine: number;
  evictMarks: number;
  throughTotal: number;
  backTotal: number;
};

export type WriteBackFlushView = {
  lines: number[];
  slots: number[];
  marks: number[];
  backTotal: number;
};

export type WriteBackDoneView = {
  writes: number;
  throughTotal: number;
  backTotal: number;
};

type Scene = {
  slotCount: number;
  lineBytes: number;
  writes: number[];
  /** 서로 다른 줄의 수 — 줄마다 다른 색을 주려고 센다. */
  lineCount: number;
};

/**
 * initialData 를 좁히는 자리는 여기다. projector 가 같은 것을 다시 좁혀 밀어
 * 넣지 않는다 (S-piece).
 */
function readScene(initial: unknown): Scene {
  const raw =
    typeof initial === 'object' && initial !== null
      ? (initial as Record<string, unknown>)
      : {};
  const writes = Array.isArray(raw.writes)
    ? raw.writes
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .map((v) => Math.max(0, Math.floor(v)))
    : [];
  const slotCount =
    typeof raw.slotCount === 'number' && raw.slotCount >= 1 ? Math.floor(raw.slotCount) : 2;
  const lineBytes =
    typeof raw.lineBytes === 'number' && raw.lineBytes > 0 ? Math.floor(raw.lineBytes) : 0;
  const lineCount = writes.reduce((acc, line) => Math.max(acc, line + 1), 1);
  return { slotCount, lineBytes, writes, lineCount };
}

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function label(value: string, attrs: Attrs): SVGTextElement {
  const node = el('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = value;
  return node;
}

function place(node: SVGGraphicsElement, x: number, y: number): void {
  node.setAttribute('transform', `translate(${x} ${y})`);
}

const px = (token: string): number => Number.parseFloat(token);

/** 한글·한자·가나처럼 한 글자가 한 칸을 다 쓰는 글자. */
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-｠]/;

/** 글자를 재는 길이 happy-dom 에 없으므로 어림으로 센다. */
function widthOf(value: string, size: number): number {
  let sum = 0;
  for (const ch of value) sum += (WIDE.test(ch) ? 1 : 0.55) * size;
  return sum;
}

/** 캡션을 두 줄까지 접는다. */
function wrap(value: string, max: number, size: number): string[] {
  if (value === '') return ['', ''];
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line === '' || widthOf(next, size) <= max) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && line !== '') lines.push(line);
  // 띄어쓰기가 드문 글(중국어·일본어)은 낱말로 갈리지 않는다. 글자로 자른다.
  if (lines.length === 1 && widthOf(lines[0], size) > max) {
    const whole = lines[0];
    let head = '';
    let cut = 0;
    for (; cut < whole.length; cut += 1) {
      if (widthOf(head + whole[cut], size) > max) break;
      head += whole[cut];
    }
    return [head, whole.slice(cut)];
  }
  return lines;
}

export const writeBackVsThroughStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);
    const scene = readScene(params.initialData);

    // 줄마다 다른 색 — n 개 카테고리 식별이므로 categorical 이다 (S-view 결정 3).
    const lineTint = categorical(Math.max(1, scene.lineCount), 'pastel');
    const tint = (line: number): string =>
      lineTint[Math.min(Math.max(line, 0), lineTint.length - 1)];

    // ── 자리 셈. 상수는 상한만 두고 나머지는 캔버스에서 역산한다 (S-piece).
    const chipCount = Math.max(1, scene.writes.length);
    const chipW = Math.min(
      CHIP_MAX_W,
      Math.floor((W - PAD * 2 - CHIP_GAP * (chipCount - 1)) / chipCount),
    );
    const streamX = Math.round((W - (chipCount * chipW + CHIP_GAP * (chipCount - 1))) / 2);
    const chipX = (index: number): number => streamX + index * (chipW + CHIP_GAP);

    const slotW = Math.floor(
      (LANE_W - 20 - SLOT_GAP * (scene.slotCount - 1)) / scene.slotCount,
    );
    const slotMid = (lane: number, slot: number): number =>
      LANE_X[lane] + 10 + slot * (slotW + SLOT_GAP) + slotW / 2;
    const dotX = (lane: number, slot: number, k: number): number =>
      slotMid(lane, slot) + (Math.min(k, 3) - 1.5) * DOT_GAP;

    const tokenMax = Math.max(1, scene.writes.length);
    const tokenW = Math.min(
      TOKEN_MAX_W,
      Math.floor((LANE_W - 20 - TOKEN_GAP * (tokenMax - 1)) / tokenMax),
    );
    const tokenX = (lane: number, k: number): number => LANE_X[lane] + 10 + k * (tokenW + TOKEN_GAP);

    // ── 기다림. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
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

    const glide = async (node: SVGGraphicsElement, x: number, y: number, ms: number): Promise<void> => {
      node.style.transition = `transform ${ms}ms cubic-bezier(0.33, 0.9, 0.35, 1)`;
      // 시작 자리를 먼저 확정시킨다 — 한 tick 에 두 번 옮기면 전이가 통째로 생략된다.
      node.getBoundingClientRect();
      place(node, x, y);
      await wait(ms);
      node.style.transition = '';
    };

    // ── 뼈대.
    const root = el('g', {});
    const frame = el('g', {});
    const flow = el('g', {});
    const captionRow = el('g', {});
    root.append(frame, flow, captionRow);
    svg.appendChild(root);

    frame.appendChild(
      label(t('label.writeOrder', 'writes, in order'), {
        x: PAD,
        y: CHIP_Y + 18,
        fill: palette.textMuted,
        'font-size': fontSizes.xs,
      }),
    );

    scene.writes.forEach((line, index) => {
      frame.appendChild(
        el('rect', {
          x: chipX(index),
          y: CHIP_Y,
          width: chipW,
          height: CHIP_H,
          rx: 6,
          fill: tint(line),
          stroke: palette.border,
        }),
      );
      frame.appendChild(
        label(`L${line}`, {
          x: chipX(index) + chipW / 2,
          y: CHIP_Y + 18,
          fill: palette.stateInk,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        }),
      );
    });

    const cursor = el('g', {});
    cursor.appendChild(
      el('rect', { x: 0, y: 0, width: chipW, height: CURSOR_H, rx: 1.5, fill: palette.accent }),
    );
    place(cursor, chipX(0), CURSOR_Y);
    frame.appendChild(cursor);

    const countText: SVGTextElement[] = [];
    const barRect: SVGRectElement[] = [];

    for (const lane of [THROUGH, BACK]) {
      frame.appendChild(
        el('rect', {
          x: LANE_X[lane],
          y: LANE_TOP,
          width: LANE_W,
          height: LANE_BOTTOM - LANE_TOP,
          rx: 10,
          fill: 'none',
          stroke: palette.border,
        }),
      );
      frame.appendChild(
        label(LANE_NAME[lane], {
          x: LANE_X[lane] + 10,
          y: TITLE_Y,
          fill: palette.text,
          'font-size': fontSizes.md,
        }),
      );
      frame.appendChild(
        // `cache` · `memory` 는 소문자 도식 라벨 한 단어라 표식이다 — 상수로 두고
        // 키를 만들지 않는다 (C10 의 판정 1·2와 경계 판정). 아래 `label.memoryWrites`
        // 처럼 값이 끼어들어 문장이 되는 것만 키다.
        label('cache', {
          x: LANE_X[lane] + 10,
          y: CACHE_LABEL_Y,
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
        }),
      );
      // `2 × 16 B` 는 수식 표기라 표식이다 — 키를 만들지 않는다 (C10 의 판정 3).
      frame.appendChild(
        label(`${scene.slotCount} × ${scene.lineBytes} B`, {
          x: LANE_X[lane] + LANE_W - 10,
          y: CACHE_LABEL_Y,
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        }),
      );
      for (let slot = 0; slot < scene.slotCount; slot += 1) {
        frame.appendChild(
          el('rect', {
            x: slotMid(lane, slot) - slotW / 2,
            y: SLOT_Y,
            width: slotW,
            height: SLOT_H,
            rx: 8,
            fill: palette.bgSubtle,
            stroke: palette.border,
            'stroke-dasharray': '3 3',
          }),
        );
      }
      frame.appendChild(
        label('memory', {
          x: LANE_X[lane] + 10,
          y: MEM_LABEL_Y,
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
        }),
      );
      const count = label(t('label.memoryWrites', 'memory writes: {n}', { n: 0 }), {
        x: LANE_X[lane] + LANE_W - 10,
        y: MEM_LABEL_Y,
        fill: palette.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'end',
      });
      frame.appendChild(count);
      countText.push(count);

      const bar = el('rect', {
        x: LANE_X[lane],
        y: BAR_Y,
        width: LANE_W,
        height: BAR_H,
        rx: 8,
        fill: palette.bg,
        stroke: palette.border,
      });
      frame.appendChild(bar);
      barRect.push(bar);
    }

    const captionLine = CAPTION_Y.map((y) => {
      const node = label('', {
        x: W / 2,
        y,
        fill: palette.text,
        'font-size': fontSizes.md,
        'text-anchor': 'middle',
      });
      captionRow.appendChild(node);
      return node;
    });

    // ── 움직이는 것들의 상태.
    const tagOf: (SVGGElement | null)[][] = [[], []];
    const dotsOf: SVGCircleElement[][][] = [[], []];
    const stacked = [0, 0];
    for (const lane of [THROUGH, BACK]) {
      for (let slot = 0; slot < scene.slotCount; slot += 1) {
        tagOf[lane].push(null);
        dotsOf[lane].push([]);
      }
    }

    const setCount = (lane: number, n: number): void => {
      countText[lane].textContent = t('label.memoryWrites', 'memory writes: {n}', { n });
    };

    const setCaption = (value: string): void => {
      const size = px(fontSizes.md);
      const lines = wrap(value, W - PAD * 2, size);
      captionLine[0].textContent = lines[0] ?? '';
      captionLine[1].textContent = lines[1] ?? '';
    };

    /** 새 줄이 칸에 내려앉는다. */
    const putTag = async (lane: number, slot: number, line: number): Promise<void> => {
      const tag = el('g', {});
      tag.appendChild(
        el('rect', {
          x: -TAG_W / 2,
          y: 0,
          width: TAG_W,
          height: TAG_H,
          rx: 5,
          fill: tint(line),
          stroke: palette.border,
        }),
      );
      tag.appendChild(
        label(`L${line}`, {
          x: 0,
          y: 13,
          fill: palette.stateInk,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        }),
      );
      place(tag, slotMid(lane, slot), TAG_Y - 12);
      flow.appendChild(tag);
      tagOf[lane][slot] = tag;
      await glide(tag, slotMid(lane, slot), TAG_Y, TAG_MS);
    };

    const dropTag = (lane: number, slot: number): void => {
      tagOf[lane][slot]?.remove();
      tagOf[lane][slot] = null;
    };

    const clearMarks = (lane: number, slot: number): void => {
      for (const dot of dotsOf[lane][slot]) dot.remove();
      dotsOf[lane][slot] = [];
    };

    /** 고침 하나가 차례표에서 떨어져 줄 위에 앉는다. */
    const sendMark = async (lane: number, index: number, slot: number): Promise<void> => {
      const k = dotsOf[lane][slot].length;
      const dot = el('circle', { cx: 0, cy: 0, r: DOT_R, fill: palette.itemActive });
      place(dot, chipX(index) + chipW / 2, CHIP_Y + CHIP_H / 2);
      flow.appendChild(dot);
      dotsOf[lane][slot].push(dot);
      await glide(dot, dotX(lane, slot, k), DOT_ROW_Y, MARK_MS);
    };

    const buildToken = (line: number, marks: number): SVGGElement => {
      const token = el('g', {});
      token.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: tokenW,
          height: TOKEN_H,
          rx: 6,
          fill: tint(line),
          stroke: palette.border,
        }),
      );
      token.appendChild(
        label(`L${line}`, {
          x: tokenW / 2,
          y: 13,
          fill: palette.stateInk,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        }),
      );
      const shown = Math.max(1, Math.min(marks, 4));
      for (let i = 0; i < shown; i += 1) {
        token.appendChild(
          el('circle', {
            cx: tokenW / 2 + (i - (shown - 1) / 2) * TOKEN_DOT_GAP,
            cy: 21,
            r: 2.6,
            fill: palette.itemActive,
          }),
        );
      }
      return token;
    };

    /** 모인 것이 상자 하나에 실려 아래층으로 내려간다. */
    const descend = async (lane: number, slot: number, line: number, marks: number): Promise<void> => {
      const k = stacked[lane];
      stacked[lane] = k + 1;
      const token = buildToken(line, marks);
      place(token, slotMid(lane, slot) - tokenW / 2, DOT_ROW_Y - TOKEN_H / 2);
      flow.appendChild(token);
      await glide(token, tokenX(lane, k), TOKEN_Y, DROP_MS);
    };

    const step = async (view: WriteBackStepView): Promise<void> => {
      if (destroyed) return;
      await glide(cursor, chipX(view.index), CURSOR_Y, CURSOR_MS);
      if (destroyed) return;

      if (view.evictLine >= 0) {
        const jobs: Promise<void>[] = [];
        if (view.evictMarks > 0) {
          // 오른쪽 — 쌓아 둔 표시가 상자 하나가 되어 한꺼번에 내려간다.
          clearMarks(BACK, view.evictSlot);
          jobs.push(descend(BACK, view.evictSlot, view.evictLine, view.evictMarks));
        }
        // 왼쪽 — 내려보낼 것이 없다. 줄이 자리만 비운다.
        clearMarks(THROUGH, view.evictSlot);
        dropTag(THROUGH, view.evictSlot);
        dropTag(BACK, view.evictSlot);
        await (jobs.length > 0 ? Promise.all(jobs) : wait(TAG_MS));
        if (destroyed) return;
        setCount(BACK, view.backTotal);
      }

      if (!view.hit) {
        await Promise.all([
          putTag(THROUGH, view.slot, view.line),
          putTag(BACK, view.slot, view.line),
        ]);
        if (destroyed) return;
      }

      // 같은 고침 하나가 두 쪽에 똑같이 떨어진다.
      await Promise.all([
        sendMark(THROUGH, view.index, view.slot),
        sendMark(BACK, view.index, view.slot),
      ]);
      if (destroyed) return;

      // 왼쪽은 거기서 멈추지 않는다 — 곧장 아래층까지 간다.
      clearMarks(THROUGH, view.slot);
      await descend(THROUGH, view.slot, view.line, 1);
      setCount(THROUGH, view.throughTotal);
    };

    /** 끝에 남은 고쳐진 줄들. 줄은 캐시에 그대로 있고 표시만 걷힌다. */
    const flush = async (view: WriteBackFlushView): Promise<void> => {
      if (destroyed) return;
      await Promise.all(
        view.lines.map(async (line, i) => {
          await wait(i * FLUSH_STAGGER_MS);
          if (destroyed) return;
          const slot = view.slots[i];
          clearMarks(BACK, slot);
          await descend(BACK, slot, line, view.marks[i]);
        }),
      );
      if (destroyed) return;
      setCount(BACK, view.backTotal);
    };

    const finish = (view: WriteBackDoneView): void => {
      setCount(THROUGH, view.throughTotal);
      setCount(BACK, view.backTotal);
      for (const lane of [THROUGH, BACK]) {
        barRect[lane].setAttribute('stroke', palette.text);
        barRect[lane].setAttribute('stroke-width', '1.6');
        countText[lane].setAttribute('fill', palette.text);
      }
    };

    const rewind = (): void => {
      while (flow.firstChild !== null) flow.removeChild(flow.firstChild);
      for (const lane of [THROUGH, BACK]) {
        for (let slot = 0; slot < scene.slotCount; slot += 1) {
          tagOf[lane][slot] = null;
          dotsOf[lane][slot] = [];
        }
        stacked[lane] = 0;
        setCount(lane, 0);
        barRect[lane].setAttribute('stroke', palette.border);
        barRect[lane].setAttribute('stroke-width', '1');
        countText[lane].setAttribute('fill', palette.textMuted);
      }
      place(cursor, chipX(0), CURSOR_Y);
      setCaption('');
    };

    return {
      step,
      flush,
      finish,
      rewind,
      setCaption,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 projector 의 await 가 영영 돌아오지
        // 않아 unmount 된 뒤에도 알고리즘이 통째로 붙들린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
