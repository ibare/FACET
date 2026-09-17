/**
 * several-hashes-one-value stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 형태가 어디서 나왔나 (질문의 동사 — **갈라진다, 하나에서 셋으로**)
 *
 * 화면은 **한 점에서 셋이 떠나는 순간**을 중심에 둔다. 값은 왼쪽 줄에 앉아 그대로
 * 남고(원본은 자리에 남는다), 줄 끝의 한 점에 갈래 셋이 겹쳐 있다가 서로 다른 호를
 * 그리며 아래 비트 배열의 서로 다른 칸으로 날아간다. 갈래가 지나간 호는 옅게 남으므로,
 * 두 값의 호가 한 칸에 모이는 것이 그림으로 보인다.
 *
 * 칸의 색은 그 칸을 켠 값의 색이다. 두 값이 한 칸을 함께 쓰면 칸이 반씩 나뉘어 두
 * 색을 같이 지니고, **테두리에 강조가 남는다** — 겹침을 말로 설명하지 않아도 되는
 * 자리.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 켠 값의 명부는 `Cell.owners` 배열에, 그 줄이 이미 갈라졌나는 `detail` 의 문자열
 * 안에, 갈래가 지나간 호는 `gArcs` 의 자식 목록에 있었다. 이제 `rows` 하나가 전부를
 * 말하고 **정적 그리기가 그것을 통째로 세운다** — 되짚어 그 걸음에 가도 물든 칸과
 * 호와 나눠 쓴 표식이 그대로 남는다.
 *
 * ── 이행이 고친 것 — 나눠 썼다는 표식이 마지막 화면에 남는다
 *
 * 옛 화면에서 "이미 1 이던 칸" 은 260ms 씩 두 번 두드리는 테로만 말했고 그 테는
 * 지워졌다. 남는 것은 반씩 나뉜 칠뿐이라 색이 가까운 두 값에서는 읽히지 않았다.
 * 지금은 `ownersOf(slot).length > 1` 이 그대로 테두리 강조가 되어, 다 끝난 화면에서도
 * 어느 칸을 나눠 썼는지 보인다 — **채움은 값의 형편, 테두리는 겹침의 표식**으로
 * 갈라 두었으므로 둘이 부딪히지 않는다.
 *
 * ── 화면에 뜨는 수는 모두 자취에서 나온다
 *
 * 캡션의 `{on}` 은 `litCountOf` 가 센 것이고 그것이 곧 물든 칸의 수다. `{k}` 와
 * `{slots}` 는 그 줄의 `slots` 그 자체다. payload 의 `onCount` · `total` · `shared`
 * 는 장면이 이미 버렸으므로 여기 올 길이 없다 (`scene.ts` 의 "수는 한 출처에서만").
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 칸은 이미 켜져 있다. 갈라지는 걸음은 **아직 못 온 갈래의
 * 몫을 칠에서 물려** 두었다가 닿을 때 얹는다. 갈래 셋은 한 뜻으로 묶인 운동이므로
 * **시계를 나누지 않고** 한 시계 안에서 어긋난 출발을 준다 (S-scene). 운동이 끝나면
 * 장면을 통째로 다시 세워 보간이 남긴 좌표 끝자리와 `opacity` 를 노드째 지운다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * 화면의 `h1` · `h2` · `→` 는 도형에 새겨진 수식 표기라 번역하지 않는다 (C10).
 * 문장인 캡션은 `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  currentRow,
  litCountOf,
  ownersOf,
  type HashStep,
  type SeveralHashesOneValueScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 캡션 한 줄 + 값 세 줄 + 비트 배열 한 줄. 마운트 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 268;

const CAPTION_X = 20;
const CAPTION_Y = 22;

const ROW_X = 20;
const ROW_W = 312;
const ROW_H = 36;
const ROW_GAP = 12;
const ROW_TOP = 42;

const PLATE_X = 28;
const PLATE_W = 74;
const PLATE_H = 24;

/** 갈래가 떠나는 점 — 줄의 오른쪽 끝. */
const ORIGIN_X = ROW_X + ROW_W - 14;
const ORIGIN_R = 4;

const ARRAY_TOP = 200;
const CELL_H = 40;
/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 44;
const SIDE_MIN = 26;
const INDEX_BASELINE = ARRAY_TOP + CELL_H + 14;

const BRANCH_R = 12;
/** 갈래가 칸에 닿는 높이 — 칸 윗변 바로 위. */
const LAND_LIFT = 3;

const ROW_MS = 340;
const FLY_MS = 640;
const FLY_STAGGER_MS = 90;
const LAND_MS = 160;
const SHARE_PULSE_MS = 260;
const SWEEP_MS = 700;

/** 도형에 새겨진 수식 표기 — 문안이 아니다 (C10). */
const H1_MARK = 'h1';
const H2_MARK = 'h2';
const ARROW_MARK = '→';
const DOT_MARK = ' · ';

type Pt = { x: number; y: number };

/** 정적 그리기가 셈한 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece). */
type Geom = {
  bitCount: number;
  cellW: number;
  originX: number;
  /** 줄 하나의 가운데 세로. */
  rowCenterY: (row: number) => number;
  /** 줄이 화면 밖에서 기다리는 거리. */
  offstage: number;
};

/** 칸 하나의 손잡이. 칠도 테두리도 `owners` 에서 파생되므로 함께 쥐어 둔다. */
type DrawnCell = {
  g: SVGGElement;
  fills: SVGGElement;
  frame: SVGRectElement;
  value: SVGTextElement;
  x: number;
  cx: number;
};

/** 줄 하나의 손잡이. `detail` 은 갈라지기 전엔 바탕 해시, 뒤엔 켠 자리를 말한다. */
type DrawnRow = { g: SVGGElement; detail: SVGTextElement };

/** 갈래 하나의 호. 갈라지는 걸음이 자기 차례에 드러낸다. */
type DrawnArc = { node: SVGPathElement; slot: number; from: Pt; c1: Pt; c2: Pt; to: Pt };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  cells: DrawnCell[];
  rows: DrawnRow[];
  /** 마지막 줄의 갈래 호들. 앞 줄의 호는 이미 다 드러나 있어 쥘 일이 없다. */
  lastArcs: DrawnArc[];
  /**
   * 줄 번호 → 색. **색판 규칙이 도는 자리를 하나로 둔다** — 걸음 함수가 씨앗을
   * 따로 뿌리면 두 군데서 셈하는 꼴이 되고, 씨앗이 갈리면 hue 간격이 통째로
   * 달라진다 (프로토콜 4 절).
   */
  tone: (row: number) => string;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 세 제어점 짜리 곡선 위의 한 점. SVG 기하 API 없이 직접 셈한다. */
function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/** 그 줄의 `detail` 이 말할 것. 갈라지기 전은 바탕 해시, 뒤는 켠 자리다. */
function detailMark(h1: number, h2: number, slots: readonly number[] | null): string {
  if (slots === null) return `${H1_MARK} ${h1}${DOT_MARK}${H2_MARK} ${h2}`;
  return `${ARROW_MARK} ${slots.join(DOT_MARK)}`;
}

export const severalHashesOneValueStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SeveralHashesOneValueScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 러너가 붙여 둔 캔버스가 통째로
    // 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 층. 갈래의 자취는 줄 뒤에 깔린다. 호가 아래 줄을 가리지 않게.
    const gArcs = el('g', {});
    const gArray = el('g', {});
    const gRows = el('g', {});
    const gFlying = el('g', {});
    const gCaption = el('g', {});
    svg.append(gArcs, gArray, gRows, gFlying, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 갈라지는 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은
     * 프레임이 **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    function label(
      content: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle',
      family: string,
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': family,
        'font-size': size,
        fill,
      });
      node.textContent = content;
      return node;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────
    //
    // **자리를 먼저 한 번에 셈하고 그 다음에 그린다.** 그리면서 이웃의 지금 좌표를
    // 재면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).

    function geomOf(scene: SeveralHashesOneValueScene): Geom {
      const bitCount = scene.bitCount;
      const cellW =
        bitCount > 0 ? Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / bitCount)) : 0;
      return {
        bitCount,
        cellW,
        originX: Math.round((PIECE_CANVAS_W - bitCount * cellW) / 2),
        rowCenterY: (row: number): number => ROW_TOP + row * (ROW_H + ROW_GAP) + ROW_H / 2,
        offstage: ROW_X + ROW_W + 24,
      };
    }

    /**
     * 갈래 하나가 그리는 호.
     *
     * 갈래마다 다른 곡률을 준다 — 세 호가 떠나는 순간에 벌어져 보이도록. 곡률의
     * 근거는 갈래의 차례(`branch`)뿐이고 좌표는 전부 여기서 역산한다.
     */
    function arcOf(geom: Geom, row: number, slot: number, branch: number): Omit<DrawnArc, 'node'> {
      const from: Pt = { x: ORIGIN_X, y: geom.rowCenterY(row) };
      const cx = geom.originX + slot * geom.cellW + geom.cellW / 2;
      const to: Pt = { x: cx, y: ARRAY_TOP - LAND_LIFT };
      return {
        slot,
        from,
        to,
        c1: { x: from.x + (to.x - from.x) * 0.3, y: from.y + 6 + branch * 16 },
        c2: { x: to.x + (from.x - to.x) * 0.1, y: to.y - 58 - branch * 8 },
      };
    }

    // ── 칠 ────────────────────────────────────────────────────────────────

    /**
     * 그 칸을 `owners` 가 켰다고 칠한다.
     *
     * **채움은 값의 형편** — 누가 켰나를 색으로, 둘이면 반씩 나눠. **테두리는 겹침의
     * 표식** — 둘 이상이면 강조가 남는다 (프로토콜 4 절의 갈래).
     */
    function paintCell(
      cell: DrawnCell,
      owners: readonly number[],
      cellW: number,
      tone: (row: number) => string,
    ): void {
      cell.fills.textContent = '';
      const share = owners.length > 0 ? cellW / owners.length : 0;
      owners.forEach((owner, i) => {
        cell.fills.appendChild(
          el('rect', {
            x: cell.x + i * share,
            y: ARRAY_TOP,
            width: share,
            height: CELL_H,
            fill: tone(owner),
          }),
        );
      });
      const on = owners.length > 0;
      const shared = owners.length > 1;
      cell.value.textContent = on ? '1' : '0';
      cell.value.setAttribute('fill', on ? colors.stateInk : colors.textMuted);
      cell.frame.setAttribute('stroke', shared ? colors.accent : colors.border);
      cell.frame.setAttribute('stroke-width', shared ? '2' : '1');
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 값도 갈래 수도 켜진 칸 수도 자취에서 꺼낸다 — 캡션이 제 수를 따로 들고 있으면
     * 화면의 칸과 갈릴 자리가 생긴다.
     */
    function captionFor(scene: SeveralHashesOneValueScene): string {
      const cap = scene.caption;
      if (cap === null) return '';
      const row = currentRow(scene);

      switch (cap.kind) {
        case 'key':
          return t('caption.key', 'Inserting {key}. Two base hashes set the slots.', {
            key: row?.key ?? '',
          });
        case 'split': {
          const slots = row?.slots ?? [];
          return t('caption.split', 'One value splits. Branches: {k}. Slots lit: {slots}.', {
            k: slots.length,
            slots: slots.join(DOT_MARK),
          });
        }
        case 'shared':
          return t('caption.shared', 'Slot already at 1: {slot}. It stays 1.', { slot: cap.slot });
        case 'done':
          // 켜진 칸의 수는 자취에서 세고, 배열 길이는 선언이 정한다.
          return t('caption.done', 'Bits on: {on} of {total}.', {
            on: litCountOf(scene),
            total: scene.bitCount,
          });
        case 'rewind':
          return t('caption.rewind', 'Back to an empty array.');
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gArcs, gArray, gRows, gFlying, gCaption]) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: SeveralHashesOneValueScene): Drawn {
      rewind();

      const geom = geomOf(scene);
      const { cellW, originX } = geom;
      /*
       * 색판의 씨앗은 **선언이 정한 값의 수**다. "지금까지 들어온 줄 수" 로 씨를
       * 뿌리면 줄이 하나 더 들어올 때마다 hue 간격이 통째로 갈려 이미 칠한 칸의
       * 색이 바뀐다 (프로토콜 4 절).
       */
      const tones = categorical(Math.max(scene.keys.length, 1), 'vivid');
      const tone = (row: number): string => tones[row % tones.length] ?? colors.itemActive;

      // ── 비트 배열. 켠 줄이 없는 칸은 0 이다.
      const cells: DrawnCell[] = [];
      for (let i = 0; i < geom.bitCount; i += 1) {
        const x = originX + i * cellW;
        const cx = x + cellW / 2;
        const g = el('g', {});
        const fills = el('g', {});
        const frame = el('rect', {
          x,
          y: ARRAY_TOP,
          width: cellW,
          height: CELL_H,
          rx: 4,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        });
        const value = label(
          '0',
          cx,
          ARRAY_TOP + CELL_H / 2 + 5,
          fontSizes.sm,
          colors.textMuted,
          'middle',
          fonts.mono,
        );
        const index = label(
          String(i),
          cx,
          INDEX_BASELINE,
          fontSizes.xs,
          colors.textMuted,
          'middle',
          fonts.mono,
        );
        g.append(fills, frame, value, index);
        gArray.appendChild(g);
        const cell: DrawnCell = { g, fills, frame, value, x, cx };
        // 켠 명부는 자취에서 센다. **남는 칠이라 정적 그리기에 넣는다** — 빠뜨리면
        // 되짚었을 때 "무엇이 켜졌나" 가 화면에서 사라진다 (S-scene).
        paintCell(cell, ownersOf(scene.rows, i), cellW, tone);
        cells.push(cell);
      }

      /*
       * 갈래가 지나간 호. **이 조각의 주장이 눈으로 보이는 자리**다 — 두 값의 호가
       * 한 칸에 모이는 것이 겹침의 증거이므로 남는 자취로 그린다.
       */
      const lastRow = scene.rows.length - 1;
      const lastArcs: DrawnArc[] = [];
      for (let row = 0; row < scene.rows.length; row += 1) {
        const slots = scene.rows[row]?.slots;
        if (!slots) continue;
        slots.forEach((slot, branch) => {
          const arc = arcOf(geom, row, slot, branch);
          const node = el('path', {
            d: `M ${arc.from.x} ${arc.from.y} C ${arc.c1.x} ${arc.c1.y}, ${arc.c2.x} ${arc.c2.y}, ${arc.to.x} ${arc.to.y}`,
            fill: 'none',
            stroke: tone(row),
            'stroke-width': 1.5,
            'stroke-opacity': 0.35,
          });
          gArcs.appendChild(node);
          if (row === lastRow) lastArcs.push({ node, ...arc });
        });
      }

      // ── 값의 줄. 들어온 것만 선다. 원본은 자리에 남는다.
      const rows: DrawnRow[] = [];
      for (let row = 0; row < scene.rows.length; row += 1) {
        const entry = scene.rows[row];
        if (entry === undefined) continue;
        const y = geom.rowCenterY(row);
        const g = el('g', {});
        g.append(
          el('rect', {
            x: ROW_X,
            y: ROW_TOP + row * (ROW_H + ROW_GAP),
            width: ROW_W,
            height: ROW_H,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
          el('rect', {
            x: PLATE_X,
            y: y - PLATE_H / 2,
            width: PLATE_W,
            height: PLATE_H,
            rx: 4,
            fill: tone(row),
          }),
          label(
            entry.key,
            PLATE_X + PLATE_W / 2,
            y + 4,
            fontSizes.sm,
            colors.stateInk,
            'middle',
            fonts.mono,
          ),
          el('circle', { cx: ORIGIN_X, cy: y, r: ORIGIN_R, fill: tone(row) }),
        );
        const detail = label(
          detailMark(entry.h1, entry.h2, entry.slots),
          PLATE_X + PLATE_W + 12,
          y + 4,
          fontSizes.xs,
          colors.textMuted,
          'start',
          fonts.mono,
        );
        g.appendChild(detail);
        gRows.appendChild(g);
        rows.push({ g, detail });
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      gCaption.appendChild(
        label(
          captionFor(scene),
          CAPTION_X,
          CAPTION_Y,
          fontSizes.md,
          colors.text,
          'start',
          fonts.body,
        ),
      );

      return { geom, cells, rows, lastArcs, tone };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면이 말한다 — `prev` 를 들추지
    // 않는다 (S-scene).

    /** 줄이 왼쪽에서 미끄러져 들어온다. 값이 자기 자리에 앉는 꼴이다. */
    function flowEnter(drawn: Drawn, mine: number): Promise<void> {
      const row = drawn.rows[drawn.rows.length - 1];
      if (row === undefined) return Promise.resolve();
      const offstage = drawn.geom.offstage;
      return tween(ROW_MS, mine, (p) => {
        row.g.setAttribute('transform', `translate(${-(1 - ease(p)) * offstage},0)`);
      });
    }

    /**
     * 한 점에 겹쳐 있던 갈래가 갈라져 각자 칸으로 날아간다.
     *
     * 갈래 셋은 **한 뜻으로 묶인 운동**이라 시계를 나누지 않는다. 한 시계 안에서
     * 갈래마다 출발을 어긋내 주면 떠나는 순간의 벌어짐이 한 화면에서 보이고,
     * `render` 의 Promise 가 셋 다 선 뒤에 구조적으로 풀린다 (S-scene).
     */
    async function flowSplit(
      scene: SeveralHashesOneValueScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const entry = currentRow(scene);
      const slots = entry?.slots;
      const at = scene.rows.length - 1;
      if (entry === null || !slots || slots.length === 0) return;

      const { geom, cells, lastArcs, tone } = drawn;

      // 갈라지는 동안 줄은 바탕 해시 둘을 그대로 보인다 — 그 둘이 자리를 정했다는
      // 말과 갈래가 날아가는 그림이 한 화면에 있게. 끝나면 정적 그리기가 켠 자리로
      // 갈아 끼운다.
      const detail = drawn.rows[at]?.detail;
      if (detail !== undefined) detail.textContent = detailMark(entry.h1, entry.h2, null);

      /** 갈래가 닿기 전의 칠 — 이 줄을 뺀 명부. 아직 못 온 몫을 물려 둔다. */
      const before = slots.map((slot) => ownersOf(scene.rows, slot).filter((o) => o !== at));
      const after = slots.map((slot) => ownersOf(scene.rows, slot));

      const fliers = slots.map((slot, branch) => {
        // 호의 기하는 정적 그리기와 같은 함수에서 낸다. 손잡이만 거기서 받아 온다.
        const arc = arcOf(geom, at, slot, branch);
        const node = lastArcs[branch]?.node ?? null;
        const flier = el('g', { transform: `translate(${arc.from.x},${arc.from.y})` });
        flier.append(
          el('circle', {
            cx: 0,
            cy: 0,
            r: BRANCH_R,
            fill: tone(at),
            stroke: colors.bg,
            'stroke-width': 1.5,
          }),
          label(String(slot), 0, 4, fontSizes.xs, colors.stateInk, 'middle', fonts.mono),
        );
        gFlying.appendChild(flier);
        return { flier, arc, node };
      });

      const total = FLY_STAGGER_MS * (slots.length - 1) + FLY_MS + LAND_MS;

      await tween(total, mine, (p) => {
        const ms = p * total;
        fliers.forEach(({ flier, arc, node }, branch) => {
          const started = branch * FLY_STAGGER_MS;
          const fly = clamp01((ms - started) / FLY_MS);
          const land = clamp01((ms - started - FLY_MS) / LAND_MS);

          // 호는 그 갈래가 떠난 뒤에 보인다. 정적 그리기가 끝에서 속성을 노드째
          // 지우므로 되돌릴 목록을 손으로 관리하지 않는다.
          node?.setAttribute('opacity', ms >= started ? '1' : '0');

          if (land <= 0) {
            const to = cubicAt(arc.from, arc.c1, arc.c2, arc.to, ease(fly));
            flier.setAttribute('transform', `translate(${to.x},${to.y})`);
          } else {
            // 갈래가 칸 속으로 접힌다. 끝에서는 보간값이 아니라 목표값을 쓴다.
            const e = ease(land);
            flier.setAttribute(
              'transform',
              `translate(${arc.to.x},${arc.to.y + e * 12}) scale(${1 - e})`,
            );
          }

          const cell = cells[arc.slot];
          if (cell === undefined) return;
          paintCell(cell, fly >= 1 ? (after[branch] ?? []) : (before[branch] ?? []), geom.cellW, tone);
        });
      });

      for (const { flier } of fliers) flier.remove();
    }

    /**
     * 이미 1 이던 칸을 두드린다.
     *
     * 테가 두 번 부풀었다 사라진다 — 두 값이 같은 칸에 닿았다는 **순간**의 말이다.
     * 남는 말(나눠 썼다)은 정적 그리기의 테두리 강조가 이미 세워 두었다.
     */
    async function flowShare(drawn: Drawn, slot: number, mine: number): Promise<void> {
      const cell = drawn.cells[slot];
      if (cell === undefined) return;
      const cellW = drawn.geom.cellW;
      const ring = el('rect', {
        x: cell.x,
        y: ARRAY_TOP,
        width: cellW,
        height: CELL_H,
        rx: 4,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
      });
      gFlying.appendChild(ring);

      // 두 번의 부풂을 **한 시계**로 돌린다. 마디마다 await 를 두면 그 틈으로
      // 되짚기가 끼어들 자리가 늘어난다 (S-scene).
      const total = SHARE_PULSE_MS * 2;
      await tween(total, mine, (p) => {
        const ms = p * total;
        const q = clamp01(ms < SHARE_PULSE_MS ? ms / SHARE_PULSE_MS : (ms - SHARE_PULSE_MS) / SHARE_PULSE_MS);
        const grow = q * 12;
        ring.setAttribute('x', String(cell.x - grow));
        ring.setAttribute('y', String(ARRAY_TOP - grow));
        ring.setAttribute('width', String(cellW + grow * 2));
        ring.setAttribute('height', String(CELL_H + grow * 2));
        ring.setAttribute('stroke-opacity', String(1 - q));
      });
      ring.remove();
    }

    /** 켜진 칸을 왼쪽부터 훑는다. 지나가며 켜진 칸만 들썩인다 — 그것이 결론의 셈이다. */
    async function flowSweep(
      scene: SeveralHashesOneValueScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const { geom, cells } = drawn;
      const span = geom.bitCount * geom.cellW;
      /** 들썩일 칸 — 캡션의 `{on}` 과 같은 셈에서 나온다. */
      const lit = cells.map((_, i) => ownersOf(scene.rows, i).length > 0);
      const line = el('line', {
        x1: geom.originX,
        y1: ARRAY_TOP - 12,
        x2: geom.originX,
        y2: ARRAY_TOP + CELL_H + 12,
        stroke: colors.accent,
        'stroke-width': 2,
      });
      gFlying.appendChild(line);

      await tween(SWEEP_MS, mine, (p) => {
        const x = geom.originX + p * span;
        line.setAttribute('x1', String(x));
        line.setAttribute('x2', String(x));
        cells.forEach((cell, i) => {
          const away = Math.abs(cell.cx - x);
          const lift = lit[i] === true && away < geom.cellW ? (1 - away / geom.cellW) * 7 : 0;
          cell.g.setAttribute('transform', `translate(0,${-lift})`);
        });
      });
      line.remove();
    }

    function flowFor(
      step: HashStep,
      scene: SeveralHashesOneValueScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'enter':
          return flowEnter(drawn, mine);
        case 'split':
          return flowSplit(scene, drawn, mine);
        case 'share':
          return flowShare(drawn, step.slot, mine);
        case 'sweep':
          return flowSweep(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SeveralHashesOneValueScene,
      _prev: SeveralHashesOneValueScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
