/**
 * write-back-vs-through-stage — 장면(Scene) 하나를 받아 그 걸음의 화면을 통째로
 * 세운다. 앞 화면과 견주지 않으므로 되돌릴 명령이 없고, 어느 걸음에서 오든
 * 결과가 같다 (S-scene).
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
 * 두 lane 은 **서로 다른 자리**에 끝까지 나란히 선다. 한쪽을 보이고 다음에 다른
 * 쪽을 보이며 앞의 것을 지우면 견줄 짝이 사라지는데, 이 조각은 이름부터가
 * 견줌이라 그것이 곧 조각을 없애는 일이 된다.
 *
 * ── 네 축을 각각 제 자리에 둔다 (한 칠에 두 뜻을 싣지 않는다)
 *
 *   · **채움 = 값이 무엇인가** — 줄 번호마다 다른 색. 칸의 딱지도, 아래층의
 *     상자도 같은 색을 쓴다. 같은 줄이라는 것이 색으로 이어진다
 *   · **점 = 쌓인 고침 수** — write-back 쪽 칸에만 앉는다. 이 점이 곧 dirty 다
 *   · **테두리 링 = 이번 걸음에 쓴 칸** — 지나가는 어휘. 딱지 바깥에 accent 로
 *     선다. 채움에 얹으면 "무슨 줄인가" 를 덮는다
 *   · **아래층 상자의 채움 유무 = 내려갔나 아직인가** — 채운 상자는 이미
 *     내려간 것, **테두리만 있는 상자는 아직 갚지 않은 빚**이다
 *
 * 마지막 축이 이 이행에서 새로 선 것이다. 옛 화면은 "모아 두는 동안 아래층이
 * 낡아 있다" 를 어디에서도 말하지 않아, `flush` 의 "공짜는 없다" 가 갚을 빚이
 * 보이지 않는 채로 나왔다. write-through 쪽에는 빈 상자가 한 번도 서지 않는다.
 *
 * ── 결론은 상자를 센 것이다
 *
 * `memory writes: n` 은 그 lane 의 **채운 상자를 센 수**다. 옛 화면은 발신이
 * 실어 온 `throughTotal` · `backTotal` 을 글자로 찍고 있어, 조각의 결론과 그림이
 * 다른 출처였다. 매듭지어지는 걸음에서는 상자를 감싸는 **자**가 자라 두 수가
 * 길이로도 견줘진다.
 *
 * 캔버스 가로는 러너가 `PIECE_CANVAS_W` 로 준다. 세로는 그림이 정하므로 장면을
 * 받을 때마다 `viewBox` 를 다시 세운다 (S-piece · S-view).
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

import {
  loadCapacity,
  pendingLoads,
  throughLoads,
  type WriteBackLoad,
  type WriteBackSceneCaption,
  type WriteBackVsThroughScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다 — 차례표 · 두 lane · 자 · 캡션 두 줄. */
const H = 308;

const PAD = 18;
const LANE_GAP = 16;
const LANE_W = Math.floor((W - PAD * 2 - LANE_GAP) / 2);
const LANE_X = [PAD, PAD + LANE_W + LANE_GAP] as const;

const THROUGH = 0;
const BACK = 1;
const LANES = [THROUGH, BACK] as const;

const CHIP_Y = 12;
const CHIP_H = 26;
const CHIP_MAX_W = 40;
const CHIP_GAP = 6;
/** 아직 치르지 않은 고침. 자취(치렀다)와 지금(막대)을 흐림으로 가르지 않는다. */
const CHIP_AHEAD_OPACITY = 0.38;
const CURSOR_Y = 42;
const CURSOR_H = 3;

const LANE_TOP = 56;
const LANE_BOTTOM = 262;
const TITLE_Y = 74;
const CACHE_LABEL_Y = 92;
const SLOT_Y = 98;
const SLOT_H = 44;
const SLOT_GAP = 10;
const TAG_W = 36;
const TAG_H = 18;
const TAG_Y = SLOT_Y + 6;
/** 딱지가 내려앉기 전에 서 있는 자리 — 운동은 여기서 출발한다. */
const TAG_RISE = 12;
const DOT_ROW_Y = SLOT_Y + 32;
const DOT_GAP = 10;
const DOT_R = 3.6;
const DOT_MAX = 4;
/** 이번 걸음에 쓴 칸을 두르는 링. 딱지 바깥에 선다. */
const RING_PAD = 3;
const RING_STROKE = 2.5;

const MEM_LABEL_Y = 196;
const BAR_Y = 202;
const BAR_H = 42;
const TOKEN_Y = BAR_Y + 7;
const TOKEN_H = 28;
const TOKEN_GAP = 5;
const TOKEN_MAX_W = 34;
const TOKEN_DOT_GAP = 7;

/** 상자를 감싸는 자. 매듭지어질 때만 선다. */
const RULE_Y = 252;
const RULE_TICK = 4;

const CAPTION_Y = [280, 298] as const;

const CURSOR_MS = 140;
const TAG_MS = 190;
const MARK_MS = 230;
const DROP_MS = 320;
const FLUSH_STAGGER_MS = 90;
const SETTLE_MS = 260;

/**
 * lane 이름은 그 분야에서 원어 그대로 쓰는 말이라 표식이다 — 키를 만들지 않는다
 * (C10 의 판정 2). 한국어 글도 write-back / write-through 로 적는다.
 */
const LANE_NAME = ['write-through', 'write-back'] as const;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function place(node: SVGGraphicsElement, x: number, y: number): void {
  node.setAttribute('transform', `translate(${x} ${y})`);
}

const px = (token: string): number => Number.parseFloat(token);

/** 한글·가나처럼 한 글자가 한 칸을 다 쓰는 글자. */
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-｠]/;

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

/**
 * 자리 셈의 결과. 바탕(칸 수 · 고침 차례의 길이)만 있으면 정해진다.
 *
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 재면 순회 순서가 곧
 * 숨은 상태가 된다. 이름을 `Layout` 으로 둔 것은 이 파일에서 `Scene` 이 장면을
 * 뜻하기 때문이다.
 */
type Layout = {
  chipW: number;
  chipX: (index: number) => number;
  slotW: number;
  slotMid: (lane: number, slot: number) => number;
  tokenW: number;
  tokenX: (lane: number, k: number) => number;
};

function layoutOf(scene: WriteBackVsThroughScene): Layout {
  const chipCount = Math.max(1, scene.writes.length);
  const chipW = Math.min(
    CHIP_MAX_W,
    Math.floor((W - PAD * 2 - CHIP_GAP * (chipCount - 1)) / chipCount),
  );
  const streamX = Math.round((W - (chipCount * chipW + CHIP_GAP * (chipCount - 1))) / 2);

  const slotCount = Math.max(1, scene.slotCount);
  const slotW = Math.floor((LANE_W - 20 - SLOT_GAP * (slotCount - 1)) / slotCount);

  // 두 lane 이 **같은 폭**의 상자를 쓴다 — 폭이 갈리면 "같은 짐을 몇 번에 나눠
  // 날랐나" 가 길이로 견줘지지 않는다. 그래서 상한은 양쪽 다 고침 차례의 길이다.
  const cap = loadCapacity(scene);
  const tokenW = Math.min(TOKEN_MAX_W, Math.floor((LANE_W - 20 - TOKEN_GAP * (cap - 1)) / cap));

  return {
    chipW,
    chipX: (index) => streamX + index * (chipW + CHIP_GAP),
    slotW,
    slotMid: (lane, slot) => LANE_X[lane] + 10 + slot * (slotW + SLOT_GAP) + slotW / 2,
    tokenW,
    tokenX: (lane, k) => LANE_X[lane] + 10 + k * (tokenW + TOKEN_GAP),
  };
}

/** 정적 그리기가 내주는 손잡이. 운동이 만질 것만 담는다. */
type Refs = {
  layout: Layout;
  /** 지금 치르는 고침을 가리키는 막대. 아직 하나도 안 치렀으면 null. */
  cursor: SVGGElement | null;
  /** [lane][slot] 의 줄 딱지. 빈 칸이면 null. */
  tags: (SVGGElement | null)[][];
  /** write-back 쪽 칸에 앉은 점. [slot] 마다 쌓인 차례대로. */
  marks: SVGCircleElement[][];
  /** [lane][k] 의 채운 상자 — 이미 내려간 것. */
  loads: SVGGElement[][];
  /** 아래층 띠. 매듭지어질 때 자가 그 안에서 자란다. */
  rules: SVGGElement[];
  /** 운동에만 사는 것들이 사는 층. 정적 그리기는 이 층을 비운 채로 둔다. */
  transient: SVGGElement;
};

export const writeBackVsThroughStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },

  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);

    // ── 시간 ─────────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const clock = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 매번 새로 짓지만 운동이 쥔 것은 **그때의 손잡이**다.
     * `destroy` 가 운동 도중에 오면 이미 떨어져 나간 노드를 붙들고 있게 되므로,
     * 깨어난 운동은 자기 세대를 확인하고 아니면 화면에 손대지 않는다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(run: () => void): void {
      if (hasRaf) {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          run();
        });
        frames.add(id);
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        run();
      }, 16);
      timers.add(id);
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
    const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

    /**
     * 한 시계로 흐른다.
     *
     * 한 걸음에 여럿이 함께 움직이면 옮길 것을 이 한 시계에 모은다 — 시계를 둘로
     * 나누면 나란함이 우연히 맞는 꼴이 되고, 하나를 `void` 로 흘릴 여지가 생긴다.
     */
    function tween(ms: number, my: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(my) || ms <= 0) {
          resolve();
          return;
        }
        const started = clock();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(my)) {
            finish();
            return;
          }
          const raw = Math.min(1, (clock() - started) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          nextFrame(tick);
        };
        // 첫 프레임을 동기로 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
        // 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        draw(0);
        nextFrame(tick);
      });
    }

    // ── 그리기 도구 ──────────────────────────────────────────────────
    function put<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Attrs,
    ): SVGElementTagNameMap[K] {
      const node = el(tag, attrs);
      parent.appendChild(node);
      return node;
    }

    function text(parent: Element, value: string, attrs: Attrs): SVGTextElement {
      const node = put(parent, 'text', { 'font-family': fonts.body, ...attrs });
      node.textContent = value;
      return node;
    }

    const root = put(canvas, 'g', {});

    // ── 문안 ────────────────────────────────────────────────────────
    /**
     * 캡션 문안. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10).
     *
     * 매듭 문안의 세 수는 전부 **장면이 센 것**이다 — 화면의 상자와 같은 자료를
     * 쓴다. 옛 화면은 발신이 실어 온 수를 찍고 있었다.
     */
    function captionText(
      scene: WriteBackVsThroughScene,
      caption: WriteBackSceneCaption,
    ): string {
      switch (caption.kind) {
        case 'start':
          return t(
            'caption.start',
            'The same write lands in both. One sends it down now; the other only marks the line.',
          );
        case 'again':
          return t(
            'caption.again',
            'The same line is written again: another trip down on the left, another mark on the right.',
          );
        case 'evict':
          return t(
            'caption.evict',
            'The line is pushed out, so the marks it gathered go down together — one trip.',
          );
        case 'load':
          return t(
            'caption.load',
            'A new line takes an empty slot. The left still sends every write down.',
          );
        case 'flush':
          return t(
            'caption.flush',
            'The marked lines left in the cache still have to go down. Nothing is free.',
          );
        case 'done':
          return t(
            'caption.done',
            'Same {writes} writes on both sides. Trips to memory: {through} against {back}.',
            {
              writes: scene.done,
              through: throughLoads(scene).length,
              back: scene.back.length,
            },
          );
      }
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────
    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않고 늘 통째로 짓는다 —
     * 그래서 되돌릴 명령이 필요 없고, 어느 걸음에서 오든 결과가 같다 (S-scene).
     */
    function drawStatic(scene: WriteBackVsThroughScene): Refs {
      root.textContent = '';
      // `init()` 이 없으므로 캔버스 세로도 매번 여기서 정한다.
      canvas.setAttribute('viewBox', `0 0 ${W} ${H}`);

      const L = layoutOf(scene);
      const lineTint = categorical(Math.max(1, scene.lineCount), 'pastel');
      const tint = (line: number): string =>
        lineTint[Math.min(Math.max(line, 0), lineTint.length - 1)];

      const frame = put(root, 'g', {});
      const transient = put(root, 'g', {});

      const refs: Refs = {
        layout: L,
        cursor: null,
        tags: [[], []],
        marks: [],
        loads: [[], []],
        rules: [],
        transient,
      };

      // ── 고치는 차례. 이미 치른 것과 아직 남은 것을 흐림으로 가른다.
      text(frame, t('label.writeOrder', 'writes, in order'), {
        x: PAD,
        y: CHIP_Y + 18,
        fill: palette.textMuted,
        'font-size': fontSizes.xs,
      });

      scene.writes.forEach((line, index) => {
        const chip = put(frame, 'g', {});
        if (index >= scene.done) chip.setAttribute('opacity', String(CHIP_AHEAD_OPACITY));
        put(chip, 'rect', {
          x: L.chipX(index),
          y: CHIP_Y,
          width: L.chipW,
          height: CHIP_H,
          rx: 6,
          fill: tint(line),
          stroke: palette.border,
        });
        text(chip, `L${line}`, {
          x: L.chipX(index) + L.chipW / 2,
          y: CHIP_Y + 18,
          fill: palette.stateInk,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        });
      });

      // 아직 하나도 치르지 않았으면 가리킬 것이 없다 — 숨기지 말고 짓지 않는다.
      if (scene.done > 0) {
        const cursor = put(frame, 'g', {});
        put(cursor, 'rect', {
          x: 0,
          y: 0,
          width: L.chipW,
          height: CURSOR_H,
          rx: 1.5,
          fill: palette.accent,
        });
        place(cursor, L.chipX(scene.done - 1), CURSOR_Y);
        refs.cursor = cursor;
      }

      // ── 두 lane. 서로 다른 자리에 끝까지 나란히 선다.
      const ringSlot = scene.step?.kind === 'write' ? scene.step.slot : -1;

      for (const lane of LANES) {
        put(frame, 'rect', {
          x: LANE_X[lane],
          y: LANE_TOP,
          width: LANE_W,
          height: LANE_BOTTOM - LANE_TOP,
          rx: 10,
          fill: 'none',
          stroke: palette.border,
        });
        text(frame, LANE_NAME[lane], {
          x: LANE_X[lane] + 10,
          y: TITLE_Y,
          fill: palette.text,
          'font-size': fontSizes.md,
        });
        // `cache` · `memory` 는 소문자 도식 라벨 한 단어라 표식이다 — 상수로 두고
        // 키를 만들지 않는다 (C10 의 판정 1·2와 경계 판정). 아래 `label.memoryWrites`
        // 처럼 값이 끼어들어 문장이 되는 것만 키다.
        text(frame, 'cache', {
          x: LANE_X[lane] + 10,
          y: CACHE_LABEL_Y,
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
        });
        // `2 × 16 B` 는 수식 표기라 표식이다 — 키를 만들지 않는다 (C10 의 판정 3).
        text(frame, `${scene.slotCount} × ${scene.lineBytes} B`, {
          x: LANE_X[lane] + LANE_W - 10,
          y: CACHE_LABEL_Y,
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });

        // ── 캐시 칸.
        for (let slot = 0; slot < scene.slotCount; slot += 1) {
          const cell = scene.cells[slot] ?? null;
          put(frame, 'rect', {
            x: L.slotMid(lane, slot) - L.slotW / 2,
            y: SLOT_Y,
            width: L.slotW,
            height: SLOT_H,
            rx: 8,
            fill: palette.bgSubtle,
            stroke: palette.border,
            // 빈 칸은 파선, 든 칸은 실선 — 자리가 잡혔나를 테두리가 말한다.
            ...(cell === null ? { 'stroke-dasharray': '3 3' } : {}),
          });

          if (cell !== null) {
            const tag = put(frame, 'g', {});
            put(tag, 'rect', {
              x: -TAG_W / 2,
              y: 0,
              width: TAG_W,
              height: TAG_H,
              rx: 5,
              fill: tint(cell.line),
              stroke: palette.border,
            });
            text(tag, `L${cell.line}`, {
              x: 0,
              y: 13,
              fill: palette.stateInk,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
            });
            place(tag, L.slotMid(lane, slot), TAG_Y);
            refs.tags[lane][slot] = tag;
          } else {
            refs.tags[lane][slot] = null;
          }

          // 이번 걸음에 쓴 칸. 딱지 **바깥**에 선다 — 채움에 얹으면 무슨 줄인가를 덮는다.
          if (slot === ringSlot) {
            put(frame, 'rect', {
              x: L.slotMid(lane, slot) - L.slotW / 2 - RING_PAD,
              y: SLOT_Y - RING_PAD,
              width: L.slotW + RING_PAD * 2,
              height: SLOT_H + RING_PAD * 2,
              rx: 10,
              fill: 'none',
              stroke: palette.accent,
              'stroke-width': RING_STROKE,
            });
          }
        }

        // ── 쌓인 고침 표시. write-back 쪽에만 앉는다 — 그것이 두 정책의 갈림이다.
        if (lane === BACK) {
          for (let slot = 0; slot < scene.slotCount; slot += 1) {
            const cell = scene.cells[slot] ?? null;
            const row: SVGCircleElement[] = [];
            const shown = cell === null ? 0 : Math.min(cell.marks, DOT_MAX);
            for (let i = 0; i < shown; i += 1) {
              row.push(
                put(frame, 'circle', {
                  cx: L.slotMid(lane, slot) + (i - (shown - 1) / 2) * DOT_GAP,
                  cy: DOT_ROW_Y,
                  r: DOT_R,
                  fill: palette.itemActive,
                }),
              );
            }
            refs.marks[slot] = row;
          }
        }

        // ── 아래층.
        text(frame, 'memory', {
          x: LANE_X[lane] + 10,
          y: MEM_LABEL_Y,
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
        });

        const landed = lane === THROUGH ? throughLoads(scene) : scene.back;
        text(frame, t('label.memoryWrites', 'memory writes: {n}', { n: landed.length }), {
          x: LANE_X[lane] + LANE_W - 10,
          y: MEM_LABEL_Y,
          fill: scene.settled ? palette.text : palette.textMuted,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });

        put(frame, 'rect', {
          x: LANE_X[lane],
          y: BAR_Y,
          width: LANE_W,
          height: BAR_H,
          rx: 8,
          fill: palette.bg,
          stroke: scene.settled ? palette.text : palette.border,
          'stroke-width': scene.settled ? 1.8 : 1,
        });

        landed.forEach((load, k) => {
          refs.loads[lane][k] = drawLoad(frame, L, tint, load, L.tokenX(lane, k), TOKEN_Y, true);
        });

        // 아직 갚지 않은 빚. write-through 쪽에는 한 번도 서지 않는다.
        if (lane === BACK) {
          pendingLoads(scene).forEach((load, i) => {
            drawLoad(frame, L, tint, load, L.tokenX(lane, landed.length + i), TOKEN_Y, false);
          });
        }

        // ── 자. 매듭지어질 때만 선다 — 아직 없는 것은 숨기지 말고 짓지 않는다.
        if (scene.settled && landed.length > 0) {
          const rule = put(frame, 'g', {});
          drawRule(rule, L, lane, landed.length, 1);
          refs.rules[lane] = rule;
        }
      }

      // ── 캡션.
      const size = px(fontSizes.md);
      const said = scene.caption === null ? '' : captionText(scene, scene.caption);
      const wrapped = wrap(said, W - PAD * 2, size);
      CAPTION_Y.forEach((y, i) => {
        text(frame, wrapped[i] ?? '', {
          x: W / 2,
          y,
          fill: palette.text,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
        });
      });

      return refs;
    }

    /**
     * 아래층의 짐 하나.
     *
     * `landed` 가 참이면 채운 상자 — 이미 내려갔다. 거짓이면 테두리만 있는 상자 —
     * 아직 갚지 않은 빚이다. 어휘가 갈려 있어 둘이 한 줄에 서도 섞이지 않는다.
     */
    function drawLoad(
      parent: Element,
      L: Layout,
      tint: (line: number) => string,
      load: WriteBackLoad,
      x: number,
      y: number,
      landed: boolean,
    ): SVGGElement {
      const box = put(parent, 'g', {});
      put(box, 'rect', {
        x: 0,
        y: 0,
        width: L.tokenW,
        height: TOKEN_H,
        rx: 6,
        fill: landed ? tint(load.line) : 'none',
        stroke: landed ? palette.border : tint(load.line),
        ...(landed ? {} : { 'stroke-dasharray': '3 3' }),
      });
      text(box, `L${load.line}`, {
        x: L.tokenW / 2,
        y: 13,
        fill: landed ? palette.stateInk : palette.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      const shown = Math.max(1, Math.min(load.marks, DOT_MAX));
      for (let i = 0; i < shown; i += 1) {
        put(box, 'circle', {
          cx: L.tokenW / 2 + (i - (shown - 1) / 2) * TOKEN_DOT_GAP,
          cy: 21,
          r: 2.6,
          fill: landed ? palette.itemActive : 'none',
          stroke: landed ? 'none' : palette.itemActive,
        });
      }
      place(box, x, y);
      return box;
    }

    /**
     * 채운 상자를 감싸는 자. `grown` 이 0→1 이면 왼쪽부터 자란다.
     *
     * 두 lane 의 자가 나란히 서면 "같은 짐을 몇 번에 나눠 날랐나" 가 수가 아니라
     * 길이로 견줘진다.
     */
    function drawRule(parent: SVGGElement, L: Layout, lane: number, n: number, grown: number): void {
      parent.textContent = '';
      const x0 = L.tokenX(lane, 0);
      const full = n * L.tokenW + (n - 1) * TOKEN_GAP;
      const span = Math.max(0, full * grown);
      put(parent, 'line', {
        x1: x0,
        y1: RULE_Y,
        x2: x0 + span,
        y2: RULE_Y,
        stroke: palette.text,
        'stroke-width': 1.4,
      });
      put(parent, 'line', {
        x1: x0,
        y1: RULE_Y - RULE_TICK,
        x2: x0,
        y2: RULE_Y + RULE_TICK,
        stroke: palette.text,
        'stroke-width': 1.4,
      });
      // 오른쪽 끝 눈금은 자가 다 자란 뒤에 선다 — 길이 0 짜리 선을 미리 두면
      // 나눌 자리를 광고하는 꼴이 된다.
      if (span > 0) {
        put(parent, 'line', {
          x1: x0 + span,
          y1: RULE_Y - RULE_TICK,
          x2: x0 + span,
          y2: RULE_Y + RULE_TICK,
          stroke: palette.text,
          'stroke-width': 1.4,
        });
      }
    }

    // ── 걸음의 운동 ─────────────────────────────────────────────────
    /** 막대가 앞 고침에서 이번 고침으로 옮겨 간다. */
    function flowCursor(scene: WriteBackVsThroughScene, refs: Refs, my: number): Promise<void> {
      const cursor = refs.cursor;
      if (!cursor || scene.done < 2) return Promise.resolve();
      const L = refs.layout;
      const from = L.chipX(scene.done - 2);
      const to = L.chipX(scene.done - 1);
      return tween(CURSOR_MS, my, (raw) => {
        place(cursor, lerp(from, to, ease(raw)), CURSOR_Y);
      });
    }

    /**
     * 쫓겨나는 줄이 모아 둔 표시를 상자 하나에 싣고 아래층으로 내려간다.
     *
     * 상자는 정적 그리기가 이미 끝 자리에 세워 두었으므로, 운동은 **아직 못 온
     * 만큼을 칸 쪽으로 물리는** 꼴이 된다.
     */
    function flowEvict(
      scene: WriteBackVsThroughScene,
      slot: number,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const k = scene.back.length - 1;
      const box = refs.loads[BACK][k];
      if (!box) return Promise.resolve();

      // 새 줄은 아직 오지 않았다. 딱지와 점을 숨겨 두고 다음 국면에서 세운다.
      for (const lane of LANES) refs.tags[lane][slot]?.setAttribute('opacity', '0');
      for (const dot of refs.marks[slot] ?? []) dot.setAttribute('opacity', '0');

      const fromX = L.slotMid(BACK, slot) - L.tokenW / 2;
      const fromY = DOT_ROW_Y - TOKEN_H / 2;
      const toX = L.tokenX(BACK, k);
      return tween(DROP_MS, my, (raw) => {
        const e = ease(raw);
        place(box, lerp(fromX, toX, e), lerp(fromY, TOKEN_Y, e));
      });
    }

    /** 새 줄이 두 lane 의 칸에 나란히 내려앉는다. 한 뜻이라 한 시계에 얹는다. */
    function flowLoad(slot: number, refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const arriving: { tag: SVGGElement; lane: number }[] = [];
      for (const lane of LANES) {
        const tag = refs.tags[lane][slot];
        if (tag) arriving.push({ tag, lane });
      }
      if (arriving.length === 0) return Promise.resolve();
      // 점은 아직 오지 않았다 — 표시는 다음 국면에서 떨어진다.
      for (const dot of refs.marks[slot] ?? []) dot.setAttribute('opacity', '0');

      return tween(TAG_MS, my, (raw) => {
        const e = ease(raw);
        for (const { tag, lane } of arriving) {
          place(tag, L.slotMid(lane, slot), lerp(TAG_Y - TAG_RISE, TAG_Y, e));
          tag.setAttribute('opacity', String(e));
        }
      });
    }

    /**
     * 같은 고침 하나가 두 쪽에 똑같이 떨어진다.
     *
     * write-through 쪽 점은 정지 화면에 남지 않으므로(그 정책은 표시를 쌓지 않는다)
     * 운동에만 사는 층에 짓는다. 그 층은 다음 정적 그리기가 통째로 걷는다.
     */
    function flowMark(
      scene: WriteBackVsThroughScene,
      slot: number,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const fromX = L.chipX(scene.done - 1) + L.chipW / 2;
      const fromY = CHIP_Y + CHIP_H / 2;

      const row = refs.marks[slot] ?? [];
      const back = row[row.length - 1] ?? null;
      // 방금 앉은 점이 설 자리. 화면에서 되읽지 않고 정적 그리기와 **같은 식**으로
      // 셈한다 — 되짚어 세운 직후에 화면을 되읽으면 옛 자리에서 출발한다.
      const backX = L.slotMid(BACK, slot) + ((row.length - 1) / 2) * DOT_GAP;
      const through = put(refs.transient, 'circle', {
        cx: 0,
        cy: 0,
        r: DOT_R,
        fill: palette.itemActive,
      });

      // write-through 쪽 칸에는 점이 하나뿐이다 — 쌓이지 않으니 늘 한가운데다.
      const throughX = L.slotMid(THROUGH, slot);

      return tween(MARK_MS, my, (raw) => {
        const e = ease(raw);
        place(through, lerp(fromX, throughX, e), lerp(fromY, DOT_ROW_Y, e));
        if (back !== null) {
          back.setAttribute('opacity', '1');
          back.setAttribute('cx', String(lerp(fromX, backX, e)));
          back.setAttribute('cy', String(lerp(fromY, DOT_ROW_Y, e)));
        }
      });
    }

    /** write-through 는 거기서 멈추지 않는다 — 점이 곧장 상자가 되어 아래층까지 간다. */
    function flowThroughDrop(
      scene: WriteBackVsThroughScene,
      slot: number,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const k = scene.done - 1;
      const box = refs.loads[THROUGH][k];
      if (!box) return Promise.resolve();
      // 점이 상자가 된다 — 점과 상자가 한 프레임에 함께 보이지 않게 먼저 거둔다.
      refs.transient.textContent = '';

      const fromX = L.slotMid(THROUGH, slot) - L.tokenW / 2;
      const fromY = DOT_ROW_Y - TOKEN_H / 2;
      const toX = L.tokenX(THROUGH, k);
      return tween(DROP_MS, my, (raw) => {
        const e = ease(raw);
        place(box, lerp(fromX, toX, e), lerp(fromY, TOKEN_Y, e));
      });
    }

    /**
     * 끝에 남은 고쳐진 줄들이 갚아진다.
     *
     * 여럿이 함께 내려가지만 **시계는 하나**다 — 차례를 두는 것은 시계를 나누는
     * 것이 아니라 한 시계 안에서 출발을 미루는 것이다.
     */
    function flowFlush(
      scene: WriteBackVsThroughScene,
      from: number[],
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const n = from.length;
      if (n === 0) return Promise.resolve();
      const base = scene.back.length - n;

      const boxes = from.map((slot, i) => ({ slot, box: refs.loads[BACK][base + i] ?? null }));
      // 점은 상자에 실려 떠났다 — 출발 자리에 남은 점을 잠깐 세워 두었다 걷는다.
      const ghosts = from.map((slot, i) => {
        const load = scene.back[base + i];
        const shown = Math.max(1, Math.min(load.marks, DOT_MAX));
        const g = put(refs.transient, 'g', {});
        for (let d = 0; d < shown; d += 1) {
          put(g, 'circle', {
            cx: L.slotMid(BACK, slot) + (d - (shown - 1) / 2) * DOT_GAP,
            cy: DOT_ROW_Y,
            r: DOT_R,
            fill: palette.itemActive,
          });
        }
        return g;
      });

      const total = DROP_MS + FLUSH_STAGGER_MS * (n - 1);
      return tween(total, my, (raw) => {
        const now = raw * total;
        boxes.forEach(({ slot, box }, i) => {
          const e = ease(clamp01((now - i * FLUSH_STAGGER_MS) / DROP_MS));
          ghosts[i].setAttribute('opacity', String(1 - e));
          if (!box) return;
          const fromX = L.slotMid(BACK, slot) - L.tokenW / 2;
          const fromY = DOT_ROW_Y - TOKEN_H / 2;
          place(box, lerp(fromX, L.tokenX(BACK, base + i), e), lerp(fromY, TOKEN_Y, e));
        });
      });
    }

    /** 자가 자라 두 lane 의 짐을 각각 감싼다. 얇은 걸음에 "잰다" 는 동사를 얹는다. */
    function flowSettle(
      scene: WriteBackVsThroughScene,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const spans = LANES.map((lane) => ({
        lane,
        rule: refs.rules[lane] ?? null,
        n: lane === THROUGH ? throughLoads(scene).length : scene.back.length,
      }));
      if (spans.every((s) => s.rule === null)) return Promise.resolve();

      return tween(SETTLE_MS, my, (raw) => {
        const e = ease(raw);
        for (const s of spans) {
          if (s.rule === null) continue;
          drawRule(s.rule, L, s.lane, s.n, e);
        }
      });
    }

    async function render(
      next: WriteBackVsThroughScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: WriteBackVsThroughScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (step !== null) {
        switch (step.kind) {
          case 'write': {
            await flowCursor(next, refs, my);
            if (!alive(my)) return;
            if (step.evicted) {
              await flowEvict(next, step.slot, refs, my);
              if (!alive(my)) return;
            }
            if (step.loaded) {
              await flowLoad(step.slot, refs, my);
              if (!alive(my)) return;
            }
            await flowMark(next, step.slot, refs, my);
            if (!alive(my)) return;
            await flowThroughDrop(next, step.slot, refs, my);
            break;
          }
          case 'flush':
            await flowFlush(next, step.from, refs, my);
            break;
          case 'settle':
            await flowSettle(next, refs, my);
            break;
        }
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간의 끝자리를 통째로 지운다. 속성을 하나씩 거두면
      // 반드시 하나를 빠뜨린다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (hasRaf) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지
        // 않으므로, 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
