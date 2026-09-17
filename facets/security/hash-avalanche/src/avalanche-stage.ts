/**
 * avalanche-stage View — 해시 눈사태 효과 단일 캔버스.
 *
 * 화면에는 언제나 견줄 두 항이 함께 있다:
 *   - 위: 두 입력과 그 비트 (한 글자 = 한 행 = 8비트)
 *   - 아래: 각 입력의 해시 비트 (16×16 = 256비트)
 *   - 각 층 아래에 "다른 비트 / 전체 비트"
 *
 * 차이만 그린 격자 하나를 두지 않는 이유:
 *   차이는 두 항이 있어야 성립한다. 결과만 칠하면 무엇과 무엇의 차이인지가
 *   화면에서 사라지고, "5비트가 다르다" 같은 수치도 근거를 잃는다. 대신 두 항을
 *   나란히 놓고 다른 자리만 동시에 물들여, 비교를 사람 눈이 아니라 화면이 한다.
 *
 * 입력도 비트로 펼치는 이유:
 *   입력을 글자로만 두면 출력의 비트 차이와 견줄 수가 없다. 같은 형식이어야
 *   12.5% → 51.2% 라는 증폭이 한 화면에서 읽힌다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`revealInputs()` · `markInputDiff()` …) 를 두지 않는다.
 * 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터 다시
 * 밟는 수밖에 없었다. 대신 `render(next, prev)` 하나가 **그 장면의 화면 전체**를
 * 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다.
 *
 * 아직 내놓지 않은 층은 숨기지 않고 **짓지 않는다.** 숨겨 두면 "보이지 않는 것"
 * 이 화면에 남아 되짚은 화면과 곧바로 세운 화면이 글자에서 갈린다.
 *
 * ## CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 `style.transition` 을 걸어 두고 값을 바꾸는 짜임이라 세 곳이 그것을
 * 지났다. 되짚기는 `animate:false` 로 오는데 CSS transition 은 그 뒤에도 화면을
 * 저 혼자 흘러가게 하므로, 되짚어 세운 화면이 나중에 저절로 바뀐다
 * (S-scene MUST NOT). 전부 `tween` 보간으로 옮겼다. 벽시계는 `setTimeout` 으로
 * 재고 rAF 를 쓰지 않는다 — 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 이 조각은 칸이 많아 **한 뜻의 운동이 수백 요소에 걸린다.** 그래도 시계를 나누지
 * 않는다 — 한 `tween` 안에서 행마다 `delay` 만 어긋나게 둔다. 그래야 "한 줄씩
 * 번지는 눈사태" 가 우연이 아니게 되고, `render` 의 Promise 도 격자 둘이 다 물든
 * 뒤에 구조적으로 풀린다.
 *
 * `render` 는 `Promise` 를 돌려준다. 옛 `render` 는 `void` 라 러너가 `await` 해도
 * 기다릴 것이 없었고, 곧 걸음 계약이 서 있지 않았다 (S-scene MUST).
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 다른 비트 — palette.accent (변화 강조)
 *   - 켜진 비트(1) — palette.textMuted
 *   - 꺼진 비트(0) — palette.bgSubtle
 *   - 캡션 — palette.text
 */

import type {
  CanvasView,
  SceneRenderer,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W, makeTranslator } from '@ffacet/core/runtime';
import type { AvalancheScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ──────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 392;

// ── 두 컬럼 (좌: 원본, 우: 한 글자 바뀐 것) ─────────────────────────────
const COL_A_CX = 160;
const COL_B_CX = 460;

// ── 입력 격자: 한 글자 = 한 행 = 8비트 ──────────────────────────────────
const IN_COLS = 8;
const IN_CELL = 11;
const IN_PITCH = IN_CELL + 1;
const IN_W = IN_COLS * IN_PITCH - 1;
const IN_Y = 68;

// ── 출력 격자: 256비트 = 16×16 ──────────────────────────────────────────
const OUT_COLS = 16;
const OUT_CELL = 8;
const OUT_PITCH = OUT_CELL + 1;
const OUT_W = OUT_COLS * OUT_PITCH - 1;
const OUT_Y = 188;

// ── 세로 배치 ───────────────────────────────────────────────────────────
const CAPTION_EVENT_Y = 34;
const INPUT_LABEL_Y = 58;
const IN_COUNT_Y = 148;
const ARROW_Y = 172;
const OUT_COUNT_Y = 356;

// ── 박자 ────────────────────────────────────────────────────────────────
/** 격자가 행마다 물드는 시차. 한 줄씩 번지는 것이 눈사태의 운동이다. */
const PAINT_ROW_MS = 40;
/** 한 층이 나타나는 데 드는 시간 (ms). */
const FADE_MS = 220;
/** 한 칸이 물드는 데 드는 시간 (ms). */
const CELL_MS = 160;
/** 보간 한 프레임. rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * 보간이 끝나면 속성을 **지운다**.
 *
 * `setAttribute(…, '1')` 로 되돌리면 흘려 세운 화면에만 그 속성이 남아 곧바로
 * 세운 화면과 글자 하나가 어긋난다.
 */
function fade(node: Element, e: number): void {
  if (e >= 1) node.removeAttribute('opacity');
  else node.setAttribute('opacity', String(round3(e)));
}

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 두 색 사이. 끝에서는 목표 글자를 그대로 돌려준다 — 섞은 값과 글자가 다르다. */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

/**
 * 물드는 칸 하나.
 *
 * 정적 그리기가 이미 끝 색으로 세워 두었으므로, 운동은 아직 오지 않은 만큼을 뒤로
 * 물리는 꼴이 된다. `row` 가 그 칸의 시차를 정한다.
 */
type DiffCell = {
  node: SVGRectElement;
  row: number;
  /** 물들기 전의 채움 — 본래 비트 색. */
  from: string;
  /** 물든 뒤의 채움. */
  to: string;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  /** 입력 층 — 라벨 둘 · 격자 둘 · 글자 딱지. 함께 나타난다. */
  inputs: SVGElement[];
  inputDiff: DiffCell[];
  inCount: SVGTextElement | null;
  /** 출력 층 — 화살표 · 격자 둘. */
  outputs: SVGElement[];
  outputDiff: DiffCell[];
  outCount: SVGTextElement | null;
  caption: SVGTextElement | null;
};

export const avalancheStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<AvalancheScene> {
    const palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const BIT_ON = palette.textMuted;
    const BIT_OFF = palette.bgSubtle;
    const BIT_DIFF = palette.accent;

    const svg = params.canvas;
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    /** 걸음마다 통째로 다시 세우는 층. 정적 그리기가 비우고 채운다. */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 나 다음 걸음이 그 가운데 오면
     * 남은 프레임이 이미 갈아 끼운 화면에 쓰므로, 프레임마다 자기 번호가 아직
     * 유효한지 보고 물러난다 (S-scene 세대 빗장).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * `resolve` 를 `waiters` 에 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던
     * 약속이 함께 풀린다 — 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이
     * 영영 안 풀린다 (S-piece).
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

    function text(
      x: number,
      y: number,
      opts: { anchor?: string; fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight === undefined ? {} : { 'font-weight': opts.weight }),
      });
    }

    /**
     * 한 격자를 그 장면의 자리로 세운다.
     *
     * 물들일 자리를 고르는 잣대는 `marked` 하나다. 참이면 다른 자리를 강조색으로,
     * 거짓이면 본래 비트 색으로 — **덮는 것이 아니라 통째로 세운다.** 그래서
     * 어느 장면에서 어느 장면으로 가든 한 길이다.
     *
     * 다른 자리에 같은 색을 칠하면 안 된다 — 다른 자리의 *위치* 는 양쪽이 같으므로,
     * 위치만 칠하면 두 격자가 똑같아져 차이가 사라진다. 다른 자리는 정의상 한쪽이
     * 1이고 다른 쪽이 0이라, 1 은 채우고 0 은 테두리만 남기면 두 격자가 서로 반전된
     * 무늬가 되어 같은 강조색을 쓰면서도 어느 쪽이 켜졌는지가 보인다.
     */
    function makeGrid(
      bits: boolean[],
      flipped: boolean[],
      marked: boolean,
      cx: number,
      y: number,
      cols: number,
      cell: number,
      pitch: number,
      width: number,
    ): { group: SVGGElement; diff: DiffCell[] } {
      const group = el('g');
      const left = Math.round(cx - width / 2);
      const diff: DiffCell[] = [];
      bits.forEach((on, i) => {
        const isDiff = marked && flipped[i] === true;
        const from = on ? BIT_ON : BIT_OFF;
        const to = on ? BIT_DIFF : BIT_OFF;
        const rect = el('rect', {
          x: left + (i % cols) * pitch,
          y: y + Math.floor(i / cols) * pitch,
          width: cell,
          height: cell,
          rx: 1,
          fill: isDiff ? to : from,
          stroke: isDiff ? BIT_DIFF : 'none',
          'stroke-width': 1.2,
        });
        group.appendChild(rect);
        if (isDiff) diff.push({ node: rect, row: Math.floor(i / cols), from, to });
      });
      return { group, diff };
    }

    /** 입력 격자 왼쪽에 글자를 적어 "한 글자 = 한 행" 을 드러낸다. */
    function drawCharLabels(into: SVGGElement, value: string, cx: number): void {
      const left = Math.round(cx - IN_W / 2);
      [...value].forEach((ch, row) => {
        const t = text(left - 8, IN_Y + row * IN_PITCH + IN_CELL - 1, {
          anchor: 'end',
          fill: palette.textMuted,
          family: fonts.mono,
          size: fontSizes.xs,
        });
        t.textContent = ch;
        into.appendChild(t);
      });
    }

    const bitDiffLabel = (flipped: number, total: number): string =>
      tr('label.bitDiff', '{flipped} / {total} bits differ', {
        flipped: String(flipped),
        total: String(total),
      });

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 지난 장면을 보고 무엇이 달라졌는지 따지지 않는다 — 늘 전부 세운다. 그래야
     * 어느 걸음에서 오든 결과가 같고, 되돌릴 명령을 따로 둘 필요가 없다.
     */
    function drawStatic(scene: AvalancheScene): Drawn {
      root.textContent = '';
      const drawn: Drawn = {
        inputs: [],
        inputDiff: [],
        inCount: null,
        outputs: [],
        outputDiff: [],
        outCount: null,
        caption: null,
      };

      const shown = scene.phase >= 1;
      const markedIn = scene.phase >= 2;
      const outShown = scene.phase >= 3;
      const markedOut = scene.phase >= 4;

      if (markedOut) {
        const node = text(W / 2, CAPTION_EVENT_Y, { fill: BIT_DIFF, weight: '600' });
        node.textContent = tr(
          'caption.result',
          'Only {inputFlipped} of {inputTotal} input bits differ, but {outputFlipped} of {outputTotal} output bits do.',
          {
            inputFlipped: String(scene.inputFlippedBits),
            inputTotal: String(scene.inputTotalBits),
            outputFlipped: String(scene.outputFlippedBits),
            outputTotal: String(scene.outputTotalBits),
          },
        );
        root.appendChild(node);
        drawn.caption = node;
      }

      if (shown) {
        const labelA = text(COL_A_CX, INPUT_LABEL_Y, { family: fonts.mono, size: fontSizes.md });
        labelA.textContent = scene.inputA;
        const labelB = text(COL_B_CX, INPUT_LABEL_Y, { family: fonts.mono, size: fontSizes.md });
        labelB.textContent = scene.inputB;
        root.append(labelA, labelB);
        drawn.inputs.push(labelA, labelB);

        const gridA = makeGrid(
          scene.inputBitsA, scene.inputFlipped, markedIn,
          COL_A_CX, IN_Y, IN_COLS, IN_CELL, IN_PITCH, IN_W,
        );
        const gridB = makeGrid(
          scene.inputBitsB, scene.inputFlipped, markedIn,
          COL_B_CX, IN_Y, IN_COLS, IN_CELL, IN_PITCH, IN_W,
        );
        root.append(gridA.group, gridB.group);
        drawn.inputs.push(gridA.group, gridB.group);
        drawn.inputDiff.push(...gridA.diff, ...gridB.diff);

        const chars = el('g');
        drawCharLabels(chars, scene.inputA, COL_A_CX);
        drawCharLabels(chars, scene.inputB, COL_B_CX);
        root.appendChild(chars);
        drawn.inputs.push(chars);
      }

      if (markedIn) {
        const node = text(W / 2, IN_COUNT_Y, { family: fonts.mono, weight: '600' });
        node.textContent = bitDiffLabel(scene.inputFlippedBits, scene.inputTotalBits);
        root.appendChild(node);
        drawn.inCount = node;
      }

      if (outShown) {
        const arrow = text(W / 2, ARROW_Y, { fill: palette.textMuted, size: fontSizes.xs });
        arrow.textContent = tr('label.through', '↓  {algorithm}  ↓', {
          algorithm: scene.algorithmLabel,
        });
        root.appendChild(arrow);
        drawn.outputs.push(arrow);

        const gridA = makeGrid(
          scene.outputBitsA, scene.outputFlipped, markedOut,
          COL_A_CX, OUT_Y, OUT_COLS, OUT_CELL, OUT_PITCH, OUT_W,
        );
        const gridB = makeGrid(
          scene.outputBitsB, scene.outputFlipped, markedOut,
          COL_B_CX, OUT_Y, OUT_COLS, OUT_CELL, OUT_PITCH, OUT_W,
        );
        root.append(gridA.group, gridB.group);
        drawn.outputs.push(gridA.group, gridB.group);
        drawn.outputDiff.push(...gridA.diff, ...gridB.diff);
      }

      if (markedOut) {
        const node = text(W / 2, OUT_COUNT_Y, {
          family: fonts.mono,
          size: fontSizes.lg,
          weight: '600',
        });
        node.textContent = bitDiffLabel(scene.outputFlippedBits, scene.outputTotalBits);
        root.appendChild(node);
        drawn.outCount = node;
      }

      return drawn;
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────

    /** 한 층이 통째로 나타난다. 시계 하나가 그 층 전부를 쥔다. */
    function flowLayer(nodes: readonly SVGElement[], mine: number): Promise<void> {
      if (nodes.length === 0) return Promise.resolve();
      return tween(FADE_MS, mine, (p) => {
        const e = easeOut(p);
        for (const node of nodes) fade(node, e);
      });
    }

    /**
     * 다른 자리가 한 줄씩 물든다.
     *
     * 격자 둘 수백 칸이 함께 움직이지만 시계는 하나다 — 행마다 시차만 어긋나게
     * 둔다. `Promise.all` 로 가르면 "한 줄씩 번진다" 가 우연이 되고 걸음의 끝도
     * 흐려진다.
     *
     * 채움은 두 색을 직접 섞고(`mixColor`), 테두리는 정적 그리기가 끝 색으로
     * 세워 둔 것의 `stroke-opacity` 만 올린다 — `'none'` 은 섞을 수 있는 색이
     * 아니기 때문이다.
     */
    function flowMark(
      cells: readonly DiffCell[],
      tail: readonly (SVGTextElement | null)[],
      mine: number,
    ): Promise<void> {
      const lastRow = cells.reduce((most, c) => Math.max(most, c.row), 0);
      const total = lastRow * PAINT_ROW_MS + CELL_MS;
      return tween(total, mine, (p) => {
        const done = p >= 1;
        const now = p * total;
        for (const c of cells) {
          const e = done ? 1 : easeOut(clamp01((now - c.row * PAINT_ROW_MS) / CELL_MS));
          c.node.setAttribute('fill', mixColor(c.from, c.to, e));
          if (e >= 1) c.node.removeAttribute('stroke-opacity');
          else c.node.setAttribute('stroke-opacity', String(round3(e)));
        }
        // 셈한 말은 물드는 것과 한 뜻이다 — 같은 시계 위에서 함께 온다.
        const e = done ? 1 : easeOut(clamp01(now / FADE_MS));
        for (const node of tail) if (node !== null) fade(node, e);
      });
    }

    async function render(
      next: AvalancheScene,
      _prev: AvalancheScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      switch (next.phase) {
        case 1:
          await flowLayer(drawn.inputs, mine);
          break;
        case 2:
          await flowMark(drawn.inputDiff, [drawn.inCount], mine);
          break;
        case 3:
          await flowLayer(drawn.outputs, mine);
          break;
        case 4:
          await flowMark(drawn.outputDiff, [drawn.outCount, drawn.caption], mine);
          break;
        // 0 — 아직 아무것도 내놓지 않았거나 되감긴 자리. 흐를 것이 없다.
        default:
          return;
      }

      if (!alive(mine)) return;
      // 흐르며 남은 속성과 보간의 끝자리가 통째로 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
