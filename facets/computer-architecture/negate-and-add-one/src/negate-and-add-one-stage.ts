/**
 * negate-and-add-one stage — 자리표가 줄로 쌓이고, 자리올림이 번지다 멎는다.
 *
 * 네 줄이 위에서 아래로 놓이고 **앞 줄을 고치지 않는다.**
 *
 *   원본    뒤집기 전의 자리표.
 *   뒤집음  모든 자리가 반대가 된 줄. 원본에서 떨어져 나와 돌며 내려앉는다.
 *   +1      거기에 1 을 더한 줄. 이것이 2의 보수다.
 *   합       원본을 도로 더한 결과. 여덟 자리가 모두 0 이 되는 것이 결론의 근거다.
 *
 * 옛 화면은 자리표 **하나**를 제자리에서 고쳤다. 뒤집는 순간 원본이 덮이고, 검산에서
 * 기억 줄의 글자가 합으로 덮이고, 마지막에 그 줄이 납작해져 사라졌다 — 다 끝난
 * 화면에 **조각의 결론(원래 수와 더해서 0 이 된다)이 남아 있지 않았다.** 줄로 쌓으면
 * 그 되돌림이 통째로 없어진다 (S-scene).
 *
 * ── 채움과 테두리
 *
 * **채움은 비트의 값** — 1 이면 차고 0 이면 빈다. **테두리는 자리올림이 훑고 지나간
 * 표식**이다. 둘이 다른 축이라 "0 인데 자리올림이 지나갔다"(1 에서 넘어간 자리)가 한
 * 칸에 함께 선다. 자리올림이 지나온 길은 줄 아래의 점선으로도 남아, `+1` 의 토막난
 * 길과 검산의 폭을 가로지르는 길이 한 화면에서 견주어진다 — 그것이 이 조각의 볼거리다.
 *
 * ── 걸음마다 부르는 메서드를 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 줄은
 * 이미 끝 모습으로 서 있고, 운동은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다.
 * 그 출발 그림은 전부 장면에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * 가로는 러너가 정하고(`PIECE_CANVAS_W`) 세로만 여기서 갖는다. 칸 폭은 캔버스에서
 * 역산하며 상수는 상한으로만 둔다 (S-piece).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  rowOf,
  signedReading,
  stepOf,
  unsignedReading,
  type NegateAndAddOneScene,
  type NegateCaption,
  type NegateRow,
  type NegateRowKind,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

// ── 가로. 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
/** 왼쪽 여백 — 줄의 이름표와 덧셈의 묶음표가 앉는다. */
const LEFT_GUTTER = 92;
/** 오른쪽 여백 — 자리올림이 들어오는 자리. */
const RIGHT_GUTTER = 34;
const CELL_MAX_W = 56;
const CELL_GAP = 6;
const LABEL_X = 18;

// ── 세로는 그림이 정한다. 마운트한 뒤로 바꾸지 않는다 (S-view).
const CAPTION_Y = 18;
const ROW_Y: Record<NegateRowKind, number> = { origin: 34, flipped: 78, result: 122, sum: 196 };
const ROW_H: Record<NegateRowKind, number> = { origin: 28, flipped: 28, result: 40, sum: 28 };
/** 자리올림이 지나는 길. 그 덧셈이 쓰는 줄 바로 아래다. */
const LANE_Y: Partial<Record<NegateRowKind, number>> = { result: 175, sum: 238 };
const RULE_Y = 188;
const READ_UNSIGNED_Y = 264;
const READ_SIGNED_Y = 284;
const CANVAS_H = 298;

const PELLET_R = 9;
/** 자리올림이 들어오는 자리는 자리표 오른쪽 끝에서 이만큼 떨어져 있다. */
const ENTRY_PAD = 20;
/** 폭 밖으로 빠져나간 자리올림이 서는 자리는 왼쪽 끝에서 이만큼 떨어져 있다. */
const EXIT_PAD = 46;

// ── 걸음의 운동.
const ENTER_ONE_MS = 220;
const ENTER_STAGGER = 40;
const ENTER_DROP = 22;
const FLIP_MS = 520;
const PELLET_RUN_MS = 260;
const PELLET_IN_MS = 180;
const FLIP_ONE_MS = 200;
const SWEEP_MS = 160;
const CHECK_ENTER_MS = 220;
const CHECK_COL_MS = 150;
const EXIT_MS = 280;
/**
 * 마지막 걸음은 읽는 약속이 하나 더 드러날 뿐이라 흐를 것이 없다 — 벽시계가 `stepMs`
 * 그대로면 앞뒤와 구별되지 않는다. `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로
 * 그 걸음에만 얇은 운동을 얹는다. 헤아리는 걸음이니 **헤아려지는 것**(합 줄의 0 들)이
 * 한 번 부풀었다 돌아온다 — 이미 서 있던 것이라 나타나는 꼴이 아니라 부푸는 꼴이 맞다.
 */
const TALLY_MS = 260;
const TALLY_SWELL = 0.16;

/** 자리올림이 훑고 지나간 칸의 테두리. 값의 채움과 부딪히지 않게 굵기까지 가른다. */
const STROKE_PLAIN = 1.5;
const STROKE_CARRIED = 3;

/** 알갱이와 `+1` 에 새겨진 글리프 — 수식 표기라 번역 대상이 아니다 (C10). */
const CARRY_GLYPH = '1';
const PLUS_ONE_GLYPH = '+1';
const PLUS_GLYPH = '+';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** 칸 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type CellEl = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement };
/** 자리올림 알갱이의 손잡이. 운동 중에만 산다. */
type PelletEl = { g: SVGGElement; circle: SVGCircleElement };

export const negateAndAddOneStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<NegateAndAddOneScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 러너가 붙여 준 캔버스를 떼면
    // 그림이 DOM 밖에서 그려진다 (S-view).
    svg.textContent = '';

    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${CANVAS_H}`);

    // ── 층. 한 번만 세우고 안에 담기는 것은 걸음마다 다시 짓는다.
    const markLayer = el('g');
    const cellLayer = el('g');
    const pelletLayer = el('g');
    const textLayer = el('g');
    svg.append(markLayer, cellLayer, pelletLayer, textLayer);

    // ── 기하. 칸 수가 자리를 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    //    그리기 전에 한 번에 셈해 둔다 — 그리면서 재면 순회 순서가 숨은 상태가 된다.
    let cellW = CELL_MAX_W;
    let originX = LEFT_GUTTER;
    let rightEdge = W - RIGHT_GUTTER;

    function layout(count: number): void {
      const n = Math.max(1, count);
      const span = W - LEFT_GUTTER - RIGHT_GUTTER;
      cellW = Math.min(CELL_MAX_W, Math.floor(span / n));
      originX = LEFT_GUTTER + Math.round((span - cellW * n) / 2);
      rightEdge = originX + cellW * n;
    }

    const centerX = (i: number): number => originX + i * cellW + cellW / 2;
    const entryX = (): number => rightEdge + ENTRY_PAD;
    const exitX = (): number => originX - EXIT_PAD;

    // ── 이번 장면이 세운 DOM 손잡이.
    let cellEls = new Map<NegateRowKind, CellEl[]>();
    let railEls = new Map<NegateRowKind, SVGLineElement>();
    let ghostEls = new Map<NegateRowKind, SVGGElement>();

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 줄과 표식을 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로 다시
    // 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미 새로 선
    // 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고, 걸음 함수는
    // `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 마디를 흐르게 한다. `draw` 는 **고르지 않은** 0→1 을 받는다 — 완급은 부르는
     * 쪽이 제 마디에 맞게 준다.
     *
     * 기다리던 promise 는 `destroy` 가 깨운다 — 취소된 프레임은 아예 불리지 않으므로
     * 그 길이 없으면 `await render` 가 영영 돌아오지 않는다 (S-piece).
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
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
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 칸 그리기 ────────────────────────────────────────────────────────────

    function makeCell(i: number, y: number, h: number, fontSize: string): CellEl {
      const g = el('g');
      const rect = el('rect', {
        x: centerX(i) - (cellW - CELL_GAP) / 2,
        y,
        width: cellW - CELL_GAP,
        height: h,
        rx: 6,
      });
      const label = el('text', {
        x: centerX(i),
        y: y + h / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSize,
      });
      g.append(rect, label);
      cellLayer.appendChild(g);
      return { g, rect, label };
    }

    /**
     * **채움은 비트의 값, 테두리는 자리올림이 지나간 표식.**
     *
     * 두 축이 서로를 덮지 않으므로 "0 인데 자리올림이 지나갔다" 가 한 칸에 선다 —
     * 2의 보수에서 뜻이 실린 자리가 정확히 거기다.
     */
    function paintCell(cell: CellEl, bit: number, carried: boolean): void {
      cell.rect.setAttribute('fill', bit === 1 ? c.primary : c.bg);
      cell.rect.setAttribute('stroke', carried ? c.accent : c.border);
      cell.rect.setAttribute('stroke-width', String(carried ? STROKE_CARRIED : STROKE_PLAIN));
      cell.label.setAttribute('fill', bit === 1 ? c.textInverse : c.text);
      // 자리표에 새겨진 글리프다 — 번역할 문안이 아니다 (C10).
      cell.label.textContent = String(bit === 1 ? 1 : 0);
    }

    /** 아직 아무 줄도 서지 않았을 때의 빈 자리표. 값이 내려앉을 자리를 말한다. */
    function drawGhostRow(count: number): void {
      for (let i = 0; i < count; i += 1) {
        cellLayer.appendChild(
          el('rect', {
            x: centerX(i) - (cellW - CELL_GAP) / 2,
            y: ROW_Y.origin,
            width: cellW - CELL_GAP,
            height: ROW_H.origin,
            rx: 6,
            fill: c.bg,
            stroke: c.ghostOutline,
            'stroke-width': STROKE_PLAIN,
            'stroke-dasharray': '4 4',
          }),
        );
      }
    }

    /** 줄의 이름표. `+1` 만 낱말이 아니라 수식이라 키를 만들지 않는다 (C10). */
    function labelOf(kind: NegateRowKind): { text: string; mono: boolean } {
      switch (kind) {
        case 'origin':
          return { text: t('label.original', 'original'), mono: false };
        case 'flipped':
          return { text: t('label.flipped', 'flipped'), mono: false };
        case 'result':
          return { text: PLUS_ONE_GLYPH, mono: true };
        case 'sum':
          return { text: t('label.sum', 'sum'), mono: false };
      }
    }

    function drawRow(row: NegateRow, count: number): void {
      const y = ROW_Y[row.kind];
      const h = ROW_H[row.kind];

      const mark = labelOf(row.kind);
      const label = el('text', {
        x: LABEL_X,
        y: y + h / 2 + 4,
        fill: c.textMuted,
        'font-family': mark.mono ? fonts.mono : fonts.body,
        'font-size': mark.mono ? fontSizes.md : fontSizes.sm,
      });
      label.textContent = mark.text;
      textLayer.appendChild(label);

      const carriedFrom = count - row.carrySteps;
      const cells: CellEl[] = [];
      for (let i = 0; i < count; i += 1) {
        const cell = makeCell(i, y, h, row.kind === 'result' ? fontSizes.lg : fontSizes.md);
        paintCell(cell, row.bits[i] ?? 0, row.carrySteps > 0 && i >= carriedFrom);
        cells.push(cell);
      }
      cellEls.set(row.kind, cells);

      // 자리올림이 지나온 길. 어디서 멎었나가 길이로 남는다.
      const lane = LANE_Y[row.kind];
      if (lane === undefined || row.carrySteps === 0) return;
      const stop = row.carryOut ? exitX() : centerX(carriedFrom);
      const rail = el('line', {
        x1: entryX(),
        y1: lane,
        x2: stop,
        y2: lane,
        stroke: c.accent,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-dasharray': '1 6',
      });
      markLayer.appendChild(rail);
      railEls.set(row.kind, rail);

      // 폭 안에 자리가 없어 빠져나간 자리올림. 밖에 선 채로 남는다.
      if (!row.carryOut) return;
      const ghost = makePellet(exitX(), lane);
      ghostEls.set(row.kind, ghost.g);
    }

    /** 덧셈의 두 항을 묶는 표. 무엇과 무엇을 더한 합인지 합 줄이 설 때 말한다. */
    function drawBrace(): void {
      const x = originX - 14;
      const top = ROW_Y.origin + ROW_H.origin / 2;
      const bottom = ROW_Y.result + ROW_H.result / 2;
      markLayer.appendChild(
        el('path', {
          d: `M ${x + 6} ${top} H ${x} V ${bottom} H ${x + 6}`,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.5,
        }),
      );
      const plus = el('text', {
        x: x - 7,
        y: (top + bottom) / 2 + 5,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      plus.textContent = PLUS_GLYPH;
      textLayer.appendChild(plus);
    }

    function drawRule(): void {
      markLayer.appendChild(
        el('line', {
          x1: originX - 6,
          y1: RULE_Y,
          x2: rightEdge + 6,
          y2: RULE_Y,
          stroke: c.textMuted,
          'stroke-width': 1.5,
        }),
      );
    }

    // ── 알갱이 ───────────────────────────────────────────────────────────────

    function makePellet(x: number, y: number): PelletEl {
      const g = el('g', { transform: `translate(${x} ${y})` });
      const circle = el('circle', { cx: 0, cy: 0, r: PELLET_R, fill: c.accent });
      const glyph = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        fill: c.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      glyph.textContent = CARRY_GLYPH;
      g.append(circle, glyph);
      pelletLayer.appendChild(g);
      return { g, circle };
    }

    function movePellet(pellet: PelletEl, x: number, y: number, r: number): void {
      pellet.g.setAttribute('transform', `translate(${x} ${y})`);
      pellet.circle.setAttribute('r', String(Math.max(0.5, r)));
    }

    /** 아직 지나지 않은 길은 그리지 않는다 — 어디서 멎을지 미리 광고하지 않는다. */
    function layRail(kind: NegateRowKind, x: number): void {
      railEls.get(kind)?.setAttribute('x2', String(x));
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────────

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      markLayer.replaceChildren();
      cellLayer.replaceChildren();
      pelletLayer.replaceChildren();
      textLayer.replaceChildren();
      cellEls = new Map();
      railEls = new Map();
      ghostEls = new Map();
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionText(cap: NegateCaption): string {
      switch (cap.kind) {
        case 'start':
          return t('caption.start', 'Here is +{v}, written in {w} bits.', {
            v: cap.value,
            w: cap.width,
          });
        case 'flip':
          return t('caption.flip', 'Every position turns to its opposite, all at once.');
        case 'addOne':
          return t('caption.addOne', 'Add 1. The carry lands on the last position and stops.');
        case 'verify':
          return t(
            'caption.verify',
            'Add the original back: the carry runs the whole width and leaves.',
          );
        case 'conclude':
          return t('caption.conclude', 'The sum is 0, so this pattern is the negative: {signed}.', {
            signed: cap.signed,
          });
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 남는 것(선 줄들 · 자리올림의 자취 · 빠져나간 알갱이 · 두 약속의 읽기)이 모두
     * 여기서 나야 되짚었을 때 남는다.
     */
    function drawStatic(s: NegateAndAddOneScene): void {
      layout(s.width);

      if (s.rows.length === 0) drawGhostRow(s.width);
      for (const row of s.rows) drawRow(row, s.width);

      if (rowOf(s, 'sum') !== undefined) {
        drawRule();
        drawBrace();
      }

      const cap = captionOf(s);
      if (cap !== null) {
        const caption = el('text', {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
        });
        caption.textContent = captionText(cap);
        textLayer.appendChild(caption);
      }

      // 같은 자리표를 두 약속으로 읽는다. 둘이 나란히 서야 "읽는 약속만 다르다" 가 보인다.
      const unsigned = unsignedReading(s);
      if (unsigned !== null) {
        const line = el('text', {
          x: W / 2,
          y: READ_UNSIGNED_Y,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        line.textContent = t('label.unsigned', 'unsigned: {n}', { n: unsigned });
        textLayer.appendChild(line);
      }
      const signed = signedReading(s);
      if (signed !== null) {
        const line = el('text', {
          x: W / 2,
          y: READ_SIGNED_Y,
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
        });
        line.textContent = t('label.signed', "two's complement: {n}", { n: signed });
        textLayer.appendChild(line);
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 모습을 세워 두었으므로, 흐르게 할 때만
    //    출발 그림으로 물려 놓고 시작한다. 출발 그림은 장면에서 셈한다 (S-scene).

    /** 원본이 내려앉는다 — 칸들이 왼쪽부터 차례로 제자리를 찾는다. */
    function lay(mine: number): Promise<void> {
      const cells = cellEls.get('origin');
      if (cells === undefined || cells.length === 0) return Promise.resolve();
      const total = ENTER_ONE_MS + (cells.length - 1) * ENTER_STAGGER;
      return animate(total, mine, (p) => {
        cells.forEach((cell, i) => {
          const local = clamp01((p * total - i * ENTER_STAGGER) / ENTER_ONE_MS);
          cell.g.setAttribute('transform', `translate(0 ${(1 - ease(local)) * ENTER_DROP})`);
        });
      });
    }

    /**
     * 뒤집음 — 원본에서 베껴진 줄이 세로축을 중심으로 돌며 아래로 내려앉는다.
     *
     * 한 뜻의 운동이라 시계를 나누지 않는다. 출발 그림(원본 자리에서 원본 값을 들고
     * 있는 줄)은 장면의 `origin` 줄에서 셈한다.
     */
    function flip(s: NegateAndAddOneScene, mine: number): Promise<void> {
      const cells = cellEls.get('flipped');
      const origin = rowOf(s, 'origin');
      const flipped = rowOf(s, 'flipped');
      if (cells === undefined || origin === undefined || flipped === undefined) {
        return Promise.resolve();
      }
      const rise = ROW_Y.origin - ROW_Y.flipped;
      cells.forEach((cell, i) => paintCell(cell, origin.bits[i] ?? 0, false));
      let swapped = false;
      return animate(FLIP_MS, mine, (p) => {
        const e = ease(p);
        const sx = Math.max(0.03, Math.abs(1 - 2 * p));
        const dy = rise * (1 - e);
        cells.forEach((cell, i) => {
          const cx = centerX(i);
          cell.g.setAttribute('transform', `translate(${cx} ${dy}) scale(${sx} 1) translate(${-cx} 0)`);
        });
        if (p >= 0.5 && !swapped) {
          swapped = true;
          cells.forEach((cell, i) => paintCell(cell, flipped.bits[i] ?? 0, false));
        }
      });
    }

    /**
     * 1 을 더한다 — 알갱이가 오른쪽에서 들어와 자리마다 스며들고, 받아 갈 것이 없는
     * 자리를 만나면 거기서 멎는다. 그 멎는 자리가 이 걸음의 주장이다.
     */
    async function carry(s: NegateAndAddOneScene, mine: number): Promise<void> {
      const cells = cellEls.get('result');
      const result = rowOf(s, 'result');
      if (cells === undefined || result === undefined) return;
      const n = cells.length;
      const lane = LANE_Y.result ?? 0;
      const before = rowOf(s, 'flipped')?.bits ?? result.bits;

      // 출발 그림 — 아직 뒤집은 줄을 그대로 베낀 상태다. 자리올림의 자취도 없다.
      cells.forEach((cell, i) => paintCell(cell, before[i] ?? 0, false));
      layRail('result', entryX());
      ghostEls.get('result')?.remove();

      const steps = Math.min(result.carrySteps, n);
      const pellet = makePellet(entryX(), lane);
      if (steps === 0) {
        pellet.g.remove();
        return;
      }

      await animate(PELLET_RUN_MS, mine, (p) => {
        const x = lerp(entryX(), centerX(n - 1), ease(p));
        movePellet(pellet, x, lane, PELLET_R);
        layRail('result', x);
      });
      if (!alive(mine)) return;

      const cellBottom = ROW_Y.result + ROW_H.result;
      for (let k = 0; k < steps; k += 1) {
        const i = n - 1 - k;
        const last = k === steps - 1;
        const cell = cells[i];
        if (cell === undefined) return;

        // 자리 안으로 올라가 스며든다.
        await animate(PELLET_IN_MS, mine, (p) => {
          const e = ease(p);
          movePellet(pellet, centerX(i), lerp(lane, cellBottom - 12, e), PELLET_R * (1 - 0.55 * e));
        });
        if (!alive(mine)) return;
        if (last && !result.carryOut) pellet.g.remove();

        // 그 자리가 돈다. 돌고 나면 자리올림이 지나간 표식이 남는다.
        let swapped = false;
        await animate(FLIP_ONE_MS, mine, (p) => {
          const cx = centerX(i);
          cell.g.setAttribute(
            'transform',
            `translate(${cx} 0) scale(${Math.max(0.03, Math.abs(1 - 2 * p))} 1) translate(${-cx} 0)`,
          );
          if (p >= 0.5 && !swapped) {
            swapped = true;
            paintCell(cell, result.bits[i] ?? 0, true);
          }
        });
        if (!alive(mine)) return;
        cell.g.removeAttribute('transform');

        if (last && !result.carryOut) return;

        // 자리올림이 살아 있다. 길로 내려와 왼쪽으로 옮겨 간다.
        const from = centerX(i);
        const to = last ? exitX() : centerX(i - 1);
        await animate(last ? EXIT_MS : SWEEP_MS, mine, (p) => {
          const down = ease(clamp01(p * 2));
          const along = ease(p);
          const x = lerp(from, to, along);
          movePellet(pellet, x, lerp(cellBottom - 12, lane, down), PELLET_R * (0.45 + 0.55 * down));
          layRail('result', x);
        });
        if (!alive(mine)) return;
        // 밖에 선 알갱이는 정적 그리기가 세운다 — 여기서는 거둔다.
        if (last) pellet.g.remove();
      }
    }

    /**
     * 검산 — 알갱이가 폭을 가로지르고, 지나간 자리마다 합의 한 자리가 선다.
     *
     * 한 자리에서 알갱이와 그 칸이 함께 움직이므로 시계를 나누지 않는다.
     */
    async function check(s: NegateAndAddOneScene, mine: number): Promise<void> {
      const cells = cellEls.get('sum');
      const sum = rowOf(s, 'sum');
      if (cells === undefined || sum === undefined) return;
      const n = cells.length;
      const lane = LANE_Y.sum ?? 0;
      const cy = ROW_Y.sum + ROW_H.sum / 2;

      // 출발 그림 — 합은 아직 한 자리도 서지 않았다.
      const shrink = (cell: CellEl, i: number, s0: number): void => {
        const cx = centerX(i);
        cell.g.setAttribute('transform', `translate(${cx} ${cy}) scale(${s0}) translate(${-cx} ${-cy})`);
      };
      cells.forEach((cell, i) => {
        paintCell(cell, sum.bits[i] ?? 0, false);
        shrink(cell, i, 0.01);
      });
      layRail('sum', entryX());
      ghostEls.get('sum')?.remove();

      const carriedFrom = n - Math.min(sum.carrySteps, n);
      const pellet = makePellet(entryX(), lane);

      await animate(CHECK_ENTER_MS, mine, (p) => {
        const x = lerp(entryX(), centerX(n - 1), ease(p));
        movePellet(pellet, x, lane, PELLET_R);
        layRail('sum', x);
      });
      if (!alive(mine)) return;

      for (let k = 0; k < n; k += 1) {
        const i = n - 1 - k;
        const cell = cells[i];
        if (cell === undefined) return;
        const carried = i >= carriedFrom;
        const moving = i > carriedFrom;
        const from = centerX(i);
        const to = moving ? centerX(i - 1) : from;

        await animate(CHECK_COL_MS, mine, (p) => {
          const e = ease(p);
          shrink(cell, i, 0.01 + 0.99 * e);
          if (!carried) return;
          if (moving) {
            const x = lerp(from, to, e);
            movePellet(pellet, x, lane, PELLET_R);
            layRail('sum', x);
            return;
          }
          // 여기서 멎는 자리올림이면 자리에서 사그라든다.
          if (!sum.carryOut) movePellet(pellet, from, lane, PELLET_R * (1 - e));
        });
        if (!alive(mine)) return;

        cell.g.removeAttribute('transform');
        paintCell(cell, sum.bits[i] ?? 0, carried);
        if (carried && !moving && !sum.carryOut) pellet.g.remove();
      }

      if (!sum.carryOut) return;

      // 폭 안에 자리가 없다. 자리올림만 왼쪽 밖으로 빠져나간다.
      await animate(EXIT_MS, mine, (p) => {
        const e = ease(p);
        const x = lerp(centerX(0), exitX(), e);
        movePellet(pellet, x, lane, PELLET_R);
        layRail('sum', x);
      });
      if (!alive(mine)) return;
      // 밖에 선 알갱이는 정적 그리기가 세운다 — 여기서는 거둔다.
      pellet.g.remove();
    }

    /** 헤아림 — 세어지는 것(합 줄의 0 들)이 한 번 부풀었다 돌아온다. */
    function tally(mine: number): Promise<void> {
      const cells = cellEls.get('sum');
      if (cells === undefined || cells.length === 0) return Promise.resolve();
      const cy = ROW_Y.sum + ROW_H.sum / 2;
      return animate(TALLY_MS, mine, (p) => {
        const scale = 1 + Math.sin(p * Math.PI) * TALLY_SWELL;
        cells.forEach((cell, i) => {
          const cx = centerX(i);
          cell.g.setAttribute(
            'transform',
            `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`,
          );
        });
      });
    }

    function flow(s: NegateAndAddOneScene, mine: number): Promise<void> {
      switch (stepOf(s)) {
        case 'lay':
          return lay(mine);
        case 'flip':
          return flip(s, mine);
        case 'carry':
          return carry(s, mine);
        case 'check':
          return check(s, mine);
        case 'tally':
          return tally(mine);
        case null:
          return Promise.resolve();
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌 임시
     * 속성(줄어든 `scale` · 토막난 길 · 날아다니던 알갱이)이 한꺼번에 사라져, 흐른
     * 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 장면에서 셈한다 (S-scene).
     */
    async function render(
      next: NegateAndAddOneScene,
      _prev: NegateAndAddOneScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
    }

    return {
      render,

      /** rAF 만 쓴다. 예약된 프레임을 거두고 기다리던 promise 를 깨운다 (S-piece). */
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        markLayer.remove();
        cellLayer.remove();
        pelletLayer.remove();
        textLayer.remove();
      },
    };
  },
};
