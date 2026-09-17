/**
 * three-edit-choices-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다
 * (S-scene).
 *
 * ── 그림
 *
 * 왼쪽은 칸 넷짜리 창이다. 왼쪽 위(대각) · 위 · 왼쪽 세 이웃과, 정해질 칸.
 * 오른쪽은 비용 사다리다. 갈래마다 레인이 있고 가로줄이 값의 눈금이다.
 *
 *   - 낱말 위의 표시자가 지금 만나는 두 글자로 미끄러진다.
 *   - 이웃 셋에서 값이 떠나 제 레인으로 날아가고, 비용을 더한 뒤 그 높이로
 *     내려앉는다. **낮을수록 싸다** — 이 그림의 유일한 규약이다.
 *   - 바닥에서 선이 올라와 가장 낮은 것에 닿아 멈춘다.
 *   - 이긴 값의 **복제본**이 칸으로 올라가고, 진 것은 제자리에서 물러난다.
 *
 * ── "셋 중" 이 마지막 화면에 남는다
 *
 * 옛 화면은 `settle` 에서 진 칩 둘을 아래로 떨어뜨려 지우고 이긴 칩은 칸으로 옮겼다.
 * 겨룸이 끝나면 후보가 하나도 남지 않아 **셋 중 가장 싼 것** 이라는 이 조각의 주장이
 * 화면에서 사라졌다 (프로토콜 4 절 함정 7 · 29). 이제 칩 셋이 제 높이에 그대로 서고,
 * 두 축을 갈라 두어 이긴 쪽과 진 쪽이 한 화면에 함께 선다.
 *
 * - **채움 = 값의 형편** — 겨루는 중(`itemDefault`) / 이겼다(`itemPivot`) /
 *   물러났다(`bgSubtle` + 조금 작아짐).
 * - **테두리 = 견줌의 표식** — 한 번 견주어진 칩은 셋 다 `itemComparing` 테를 두르고
 *   끝까지 둔다. 진 칩에도 남으므로 "이것도 겨루었다" 가 지워지지 않는다.
 *
 * 이긴 값이 칩째 옮겨 가지 않는 것이 요점이다. 칩이 제자리를 떠나면 **가장 낮았다**
 * 는 증거가 함께 사라진다. 비기는 칸에서 둘이 같은 높이에 나란히 서는 것도 이제
 * 정지 화면에 남는다 — 옛 화면은 이긴 칩 둘을 같은 칸으로 겹쳐 보냈다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 사다리 눈금은 `let levels` 에, 이웃 셋의 값은 `let neighbour` 에, 이긴 갈래는
 * `let won` 에, 표시자의 자리는 `let rowAt`/`colAt` 에 — 그리고 **그 둘이 미끄러짐의
 * 출발값이었다** (화면의 거울, 함정 28). 칩의 자리는 `Chip.x`/`Chip.y` 라는 또 하나의
 * 거울이었고, 칸 넷의 값은 `textContent` 에만, 두 글자가 같은가는 표시자의 `opacity`
 * 에만, 가장 싼 값은 바닥선의 `y1` 에만 있었다. 이제 `scene.ts` 가 전부 말하므로
 * **정적 그리기가 그것을 통째로 세운다.**
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 칩의 글자 · 배지의 `+n` · 바닥선의 높이 · 캡션의 수가 한 화면에 함께 선다. 전부
 * `scene.ts` 의 `bestOf` · `winnersOf` · `costOf` 를 지난다. 특히 배지는 옛 화면이
 * 지움·넣음의 `+1` 을 **리터럴로 박아 두고** 대각선의 몫만 payload 로 받았는데,
 * 이제 셋 다 `costOf` 가 이웃 값과의 차로 잰다.
 *
 * 세로는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않는다
 * (S-view). 문안은 `params.t` 로 만든다 (C10).
 */

import {
  PIECE_CANVAS_W,
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
  EDIT_BRANCHES,
  bestOf,
  cellAt,
  charsAt,
  costOf,
  currentIndex,
  markAt,
  visitAt,
  winnersOf,
  type EditBranch,
  type EditCell,
  type ThreeEditChoicesScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;
const PAD = 24;

/** 낱말 두 줄 — 어느 표의 칸을 보고 있는지 대는 자리. */
const GLYPH_W = 15;
const WORD_ROW_Y = 34;
const WORD_COL_Y = 58;

/** 칸 넷짜리 창. */
const CELL = 58;
const CELL_GAP = 8;
const BLOCK_X = 50;
const BLOCK_Y = 84;

/** 비용 사다리. 가로는 남는 폭을 버리지 않고 캔버스 오른끝까지 쓴다. */
const LADDER_X0 = 232;
const LADDER_X1 = W - PAD;
const LADDER_TOP = 58;
const LADDER_BOTTOM = 196;
const LANE_W = (LADDER_X1 - LADDER_X0) / 3;
const LANE_ENTRY_Y = 30;
const LANE_LABEL_Y = 218;
const CAPTION_Y = 248;

const CHIP_W = 46;
const CHIP_H = 26;
const BADGE_W = 26;
const BADGE_H = 18;

/** 물러난 칩이 줄어드는 만큼. 높이는 건드리지 않는다 — 높이가 곧 값이다. */
const LOSER_SCALE = 0.84;

/** 한 프레임. 타이머로 민다 — 예약한 것을 모두 집합에 담아 destroy 에서 거둔다. */
const FRAME_MS = 16;

/** 값이 이웃 칸을 떠나 레인 어귀에 닿는 시간. */
const FLY_MS = 300;
/** 비용을 더한 값이 제 높이로 내려앉는 시간. */
const SINK_MS = 230;
/** 갈래 사이의 시차. 셋이 한 뜻이라 시계는 하나고 출발만 어긋난다. */
const STAGGER_MS = 110;
/** 내놓기 걸음 전체. 마지막 갈래가 다 내려앉는 데 걸리는 시간이다. */
const OFFER_MS = STAGGER_MS * 2 + FLY_MS + SINK_MS;
/** 표시자가 두 글자로 미끄러지는 시간. */
const MARK_MS = 280;
/** 바닥선이 올라와 가장 낮은 것에 닿는 시간. */
const RISE_MS = 380;
/** 이긴 값의 복제본이 칸으로 올라가는 시간. */
const CARRY_MS = 460;
/** 정해진 칸이 한 번 떠올랐다 내려앉는 시간. */
const BOB_MS = 300;

const LANE_INDEX: Record<EditBranch, number> = { delete: 0, insert: 1, diag: 2 };

type Pt = { x: number; y: number };

/**
 * 정적 그리기가 세워 둔 칩 하나.
 *
 * 좌표는 여기서만 산다 — 장면은 갈래와 값만 안다. `home` · `entry` · `seat` 는
 * **셈으로 얻은 자리**라 화면을 되읽지 않는다 (S-scene · 함정 28).
 */
type ChipParts = {
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  badge: SVGGElement;
  badgeBox: SVGRectElement;
  badgeText: SVGTextElement;
  /** 그 갈래가 떠나 온 이웃 칸의 한가운데. */
  home: Pt;
  /** 레인 어귀 — 여기서 제 비용을 더한다. */
  entry: Pt;
  /** 값만큼 내려앉아 멎는 자리. */
  seat: Pt;
  /** 이웃이 내던 값. 날아가는 동안 칩에 적혀 있다. */
  was: number;
  /** 비용을 더한 뒤의 값. */
  now: number;
};

/** 정적 그리기가 내주는 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  /** 정해질 칸을 담은 켜. `done` 의 떠오름이 이것을 민다. */
  targetGroup: SVGGElement;
  /** 갈래마다의 칩. 아직 내놓기 전이면 비어 있다. */
  chips: Map<EditBranch, ChipParts>;
  /** 바닥에서 올라온 선. 아직 안 견주었으면 `null`. */
  bar: SVGLineElement | null;
  /** 바닥선이 멎는 높이. */
  barY: number;
  /** 지금 칸의 표시자 둘. 아직 아무 칸도 안 열었으면 `null`. */
  rowMark: SVGRectElement | null;
  colMark: SVGRectElement | null;
  /** 레인 이름표. 이긴 갈래의 것이 진해진다. */
  laneLabel: Record<EditBranch, SVGTextElement>;
  /** 정해질 칸의 상자와 값 글자. `settle` 이 마지막에 굳힌다. */
  targetBox: SVGRectElement;
  targetValue: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const easeOut = (p: number): number => 1 - (1 - p) ** 2;
const f2 = (n: number): string => n.toFixed(2);

export const threeEditChoicesStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ThreeEditChoicesScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 함수가 `await` 뒤에 마무리 그리기를 하므로, 그 사이에 되짚기가 끼어들면
     * 옛 장면이 **이미 새로 선 화면**을 덮는다. `isInstant` 는 빗장이 아니다 —
     * 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 시계. 프레임을 타이머로 민다.
     *
     * `resolve` 를 `finish` 로 빼내 `waiters` 에 담는다 — 취소된 타이머는 콜백이 아예
     * 안 불리므로 `destroy` 가 여기를 깨우지 않으면 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) return finish();
          const raw = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          apply(raw);
          if (raw >= 1) return finish();
          const next = setTimeout(() => {
            timers.delete(next);
            tick();
          }, FRAME_MS);
          timers.add(next);
        };
        apply(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    function text(
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? c.text,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    const cellX = (col: number): number => BLOCK_X + col * (CELL + CELL_GAP);
    const cellY = (row: number): number => BLOCK_Y + row * (CELL + CELL_GAP);
    const centerX = (col: number): number => cellX(col) + CELL / 2;
    const centerY = (row: number): number => cellY(row) + CELL / 2;
    const laneX = (b: EditBranch): number => LADDER_X0 + LANE_W * (LANE_INDEX[b] + 0.5);
    const markX = (index: number): number => PAD + index * GLYPH_W;

    /** 값의 높이. **낮을수록 싸다** — 이 그림의 유일한 규약이다. */
    const levelY = (levels: number, v: number): number =>
      LADDER_BOTTOM - (v / Math.max(1, levels)) * (LADDER_BOTTOM - LADDER_TOP);

    /** 그 갈래의 값이 떠나 오는 이웃 칸의 한가운데. */
    const homeOf = (b: EditBranch): Pt =>
      b === 'delete'
        ? { x: centerX(1), y: centerY(0) }
        : b === 'insert'
          ? { x: centerX(0), y: centerY(1) }
          : { x: centerX(0), y: centerY(0) };

    // ── 켜 (뒤에서 앞으로). 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const root = el('g');
    svg.appendChild(root);
    const gLanes = el('g');
    const gGrid = el('g');
    const gWords = el('g');
    const gBlock = el('g');
    const gFloor = el('g');
    const gChips = el('g');
    const gCarry = el('g');
    const gCaption = el('g');
    const layers = [gLanes, gGrid, gWords, gBlock, gFloor, gChips, gCarry, gCaption];
    for (const layer of layers) root.appendChild(layer);

    // ── 칠 ────────────────────────────────────────────────────────────────

    /**
     * 칩의 두 축을 칠한다.
     *
     * `weighShown` 이 거짓이면 아직 견주기 전의 테두리로 그린다 — 바닥선이 올라오는
     * 동안만 쓰는 갈래다. 정적 그리기는 늘 `cell.weighed` 를 그대로 넘긴다.
     */
    function paintChip(
      parts: ChipParts,
      cell: EditCell,
      branch: EditBranch,
      weighShown: boolean,
    ): void {
      const won = winnersOf(cell).includes(branch);

      // 채움 = 값의 형편.
      if (cell.settled && won) {
        parts.box.setAttribute('fill', c.itemPivot);
        parts.label.setAttribute('fill', c.stateInk);
      } else if (cell.settled) {
        parts.box.setAttribute('fill', c.bgSubtle);
        parts.label.setAttribute('fill', c.textMuted);
      } else {
        parts.box.setAttribute('fill', c.itemDefault);
        parts.label.setAttribute('fill', c.text);
      }

      // 테두리 = 견줌의 표식. 진 칩에도 남는다.
      parts.box.setAttribute('stroke', weighShown ? c.itemComparing : c.text);
      parts.box.setAttribute('stroke-width', weighShown ? '2.5' : '1.5');
    }

    /** 이름표는 이긴 갈래의 것만 진해진다. 견줌의 결과라 `weighShown` 을 따른다. */
    function paintLaneLabel(
      label: SVGTextElement,
      cell: EditCell | null,
      branch: EditBranch,
      weighShown: boolean,
    ): void {
      const won = cell !== null && weighShown && winnersOf(cell).includes(branch);
      label.setAttribute('fill', won ? c.text : c.textMuted);
    }

    /** 칩을 그 자리에 놓는다. 물러난 칩은 조금 작다 — 높이는 그대로다. */
    function placeChip(parts: ChipParts, at: Pt, scale: number): void {
      parts.g.setAttribute(
        'transform',
        `translate(${f2(at.x)} ${f2(at.y)}) scale(${scale.toFixed(3)})`,
      );
    }

    /** 칩에 적히는 값과 배지. 날아가는 동안은 이웃이 내던 값이 적혀 있다. */
    function markChip(parts: ChipParts, added: boolean): void {
      parts.label.textContent = String(added ? parts.now : parts.was);
      parts.badge.setAttribute('opacity', added ? '1' : '0');
    }

    // ── 문안 ──────────────────────────────────────────────────────────────

    /**
     * 그 걸음이 무엇을 말하나. `step` 의 갈래와 1 대 1 이라 장면에 따로 담지 않는다.
     *
     * 수는 전부 장면에서 꺼낸다 — 캡션과 그림이 한 출처다 (C10).
     */
    function captionOf(scene: ThreeEditChoicesScene): string {
      const step = scene.step;
      if (step === null) return '';
      if (step.kind === 'done') {
        return t('caption.done', 'Every cell in the table is decided by this contest.');
      }

      const index = currentIndex(scene);
      if (index === null) return '';
      const cell = cellAt(scene, index);
      const visit = visitAt(scene, index);
      const chars = charsAt(scene, index);
      if (cell === null || visit === null || chars === null) return '';

      switch (step.kind) {
        case 'open':
          return t('caption.open', 'Cell ({i},{j}) — the two letters that meet here: {a} and {b}.', {
            i: visit.i,
            j: visit.j,
            a: chars.rowChar,
            b: chars.colChar,
          });
        case 'offer':
          // 갈림은 대각선이 더한 값이다 — 배지의 수와 같은 함수를 지난다.
          return costOf(cell, 'diag') === 0
            ? t('caption.offerFree', 'The two letters are the same, so the diagonal adds nothing.')
            : t('caption.offer', 'Each neighbour hands over its value plus its own cost.');
        case 'weigh': {
          const best = bestOf(cell) ?? 0;
          return winnersOf(cell).length > 1
            ? t(
                'caption.weighTie',
                'Two offers are level at {v} — either path gives the same answer.',
                { v: best },
              )
            : t('caption.weigh', 'The cheapest offer settles at {v}.', { v: best });
        }
        case 'settle':
          return t('caption.settle', 'The winner moves in. Cell ({i},{j}) holds {v}.', {
            i: visit.i,
            j: visit.j,
            v: bestOf(cell) ?? 0,
          });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 층을 통째로 비우고 다시 짓는다. 되돌릴 목록을 손으로 관리하지 않으므로 보간이
     * 남긴 `opacity` 나 좌표 끝자리가 남을 자리가 없다.
     */
    function drawStatic(scene: ThreeEditChoicesScene): Drawn {
      rewind();

      const index = currentIndex(scene);
      const cell = index === null ? null : cellAt(scene, index);
      const chars = index === null ? null : charsAt(scene, index);
      const visit = index === null ? null : visitAt(scene, index);

      // ── 레인. 겨룸터는 겨룸보다 먼저 있다.
      const laneLabel = {} as Record<EditBranch, SVGTextElement>;
      for (const b of EDIT_BRANCHES) {
        gLanes.appendChild(
          el('rect', {
            x: LADDER_X0 + LANE_W * LANE_INDEX[b] + 3,
            y: LANE_ENTRY_Y,
            width: LANE_W - 6,
            height: LADDER_BOTTOM - LANE_ENTRY_Y,
            rx: 8,
            fill: c.bgSubtle,
          }),
        );
        const name =
          b === 'delete'
            ? t('label.delete', 'delete')
            : b === 'insert'
              ? t('label.insert', 'insert')
              : // 두 글자가 같으면 바꿀 것이 없다. 그때만 이름이 갈린다.
                chars?.same === true
                ? t('label.keep', 'keep')
                : t('label.replace', 'replace');
        const label = text(laneX(b), LANE_LABEL_Y, name, { fill: c.textMuted });
        paintLaneLabel(label, cell, b, cell?.weighed === true);
        laneLabel[b] = label;
        gLanes.appendChild(label);
      }
      gLanes.appendChild(
        el('line', {
          x1: LADDER_X0,
          y1: LADDER_BOTTOM,
          x2: LADDER_X1,
          y2: LADDER_BOTTOM,
          stroke: c.text,
          'stroke-width': 1.5,
        }),
      );

      // ── 사다리 눈금. 아직 칸을 열지 않았으면 **짓지 않는다** (함정 17).
      if (scene.levels > 0) {
        for (let v = 0; v <= scene.levels; v += 1) {
          const y = levelY(scene.levels, v);
          gGrid.appendChild(
            el('line', {
              x1: LADDER_X0,
              y1: y,
              x2: LADDER_X1,
              y2: y,
              stroke: c.border,
              'stroke-width': 1,
            }),
          );
          gGrid.appendChild(
            text(LADDER_X0 - 9, y + 4, String(v), {
              size: fontSizes.xs,
              family: fonts.mono,
              fill: c.textMuted,
              anchor: 'end',
            }),
          );
        }
      }

      // ── 낱말 두 줄과 표시자.
      let rowMark: SVGRectElement | null = null;
      let colMark: SVGRectElement | null = null;
      if (index !== null) {
        const at = markAt(scene, index);
        rowMark = el('rect', {
          x: markX(at.row),
          y: WORD_ROW_Y - 15,
          width: GLYPH_W - 2,
          height: 20,
          rx: 4,
          fill: c.accent,
        });
        colMark = el('rect', {
          x: markX(at.col),
          y: WORD_COL_Y - 15,
          width: GLYPH_W - 2,
          height: 20,
          rx: 4,
          fill: c.accent,
        });
        gWords.appendChild(rowMark);
        gWords.appendChild(colMark);
      }
      const here = index === null ? { row: -1, col: -1 } : markAt(scene, index);
      for (let k = 0; k < scene.source.length; k += 1) {
        gWords.appendChild(
          text(PAD + k * GLYPH_W + (GLYPH_W - 2) / 2, WORD_ROW_Y, scene.source[k], {
            family: fonts.mono,
            size: fontSizes.md,
            fill: k === here.row ? c.stateInk : c.textMuted,
          }),
        );
      }
      for (let k = 0; k < scene.target.length; k += 1) {
        gWords.appendChild(
          text(PAD + k * GLYPH_W + (GLYPH_W - 2) / 2, WORD_COL_Y, scene.target[k], {
            family: fonts.mono,
            size: fontSizes.md,
            fill: k === here.col ? c.stateInk : c.textMuted,
          }),
        );
      }

      // ── 칸 넷짜리 창.
      const slotValue = (col: number, row: number, value: string, ink: string): SVGTextElement =>
        text(centerX(col), centerY(row) + 8, value, {
          size: fontSizes.xl,
          weight: '600',
          fill: ink,
        });
      const slotTag = (col: number, row: number, tag: string): SVGTextElement =>
        text(cellX(col) + CELL / 2, cellY(row) + 16, tag, {
          size: fontSizes.xs,
          family: fonts.mono,
          fill: c.textMuted,
        });

      const neighbourSlots: Array<{ col: number; row: number; branch: EditBranch }> = [
        { col: 0, row: 0, branch: 'diag' },
        { col: 1, row: 0, branch: 'delete' },
        { col: 0, row: 1, branch: 'insert' },
      ];
      for (const s of neighbourSlots) {
        gBlock.appendChild(
          el('rect', {
            x: cellX(s.col),
            y: cellY(s.row),
            width: CELL,
            height: CELL,
            rx: 8,
            fill: c.itemDefault,
            stroke: c.border,
            'stroke-width': 1.5,
          }),
        );
        const tag =
          visit === null
            ? ''
            : s.branch === 'diag'
              ? `(${visit.i - 1},${visit.j - 1})`
              : s.branch === 'delete'
                ? `(${visit.i - 1},${visit.j})`
                : `(${visit.i},${visit.j - 1})`;
        gBlock.appendChild(slotTag(s.col, s.row, tag));
        gBlock.appendChild(
          slotValue(s.col, s.row, cell === null ? '' : String(cell.neighbours[s.branch]), c.text),
        );
      }

      const targetGroup = el('g', { transform: 'translate(0 0)' });
      const settledValue = cell !== null && cell.settled ? bestOf(cell) : null;
      const targetBox = el('rect', {
        x: cellX(1),
        y: cellY(1),
        width: CELL,
        height: CELL,
        rx: 8,
        fill: settledValue === null ? c.bg : c.itemSorted,
        stroke: settledValue === null ? c.border : c.itemSorted,
        'stroke-width': 1.5,
      });
      if (settledValue === null) targetBox.setAttribute('stroke-dasharray', '5 4');
      const targetValue = slotValue(
        1,
        1,
        settledValue === null ? '' : String(settledValue),
        settledValue === null ? c.text : c.textInverse,
      );
      targetGroup.appendChild(targetBox);
      targetGroup.appendChild(slotTag(1, 1, visit === null ? '' : `(${visit.i},${visit.j})`));
      targetGroup.appendChild(targetValue);
      gBlock.appendChild(targetGroup);

      // ── 만나는 두 글자. 같으면 둘 다 물든다 — 대각선이 공짜로 오는 까닭이다.
      if (chars !== null) {
        const sameNow = chars.same;
        if (sameNow) {
          gBlock.appendChild(
            el('rect', {
              x: BLOCK_X - 26,
              y: centerY(1) - 12,
              width: 22,
              height: 24,
              rx: 6,
              fill: c.accent,
            }),
          );
          gBlock.appendChild(
            el('rect', {
              x: centerX(1) - 11,
              y: BLOCK_Y - 28,
              width: 22,
              height: 24,
              rx: 6,
              fill: c.accent,
            }),
          );
        }
        gBlock.appendChild(
          text(BLOCK_X - 15, centerY(1) + 5, chars.rowChar, {
            family: fonts.mono,
            size: fontSizes.lg,
            weight: '600',
            fill: sameNow ? c.stateInk : c.text,
          }),
        );
        gBlock.appendChild(
          text(centerX(1), BLOCK_Y - 11, chars.colChar, {
            family: fonts.mono,
            size: fontSizes.lg,
            weight: '600',
            fill: sameNow ? c.stateInk : c.text,
          }),
        );
      }

      // ── 바닥에서 올라온 선. 아직 안 견주었으면 짓지 않는다.
      let bar: SVGLineElement | null = null;
      let barY = LADDER_BOTTOM;
      if (cell !== null && cell.weighed) {
        barY = levelY(scene.levels, bestOf(cell) ?? 0);
        bar = el('line', {
          x1: LADDER_X0,
          y1: barY,
          x2: LADDER_X1,
          y2: barY,
          stroke: c.risingMarker,
          'stroke-width': 2.5,
        });
        gFloor.appendChild(bar);
      }

      // ── 칩 셋. 내놓기 전이면 짓지 않는다.
      const chips = new Map<EditBranch, ChipParts>();
      if (cell !== null && cell.offers !== null) {
        const winners = winnersOf(cell);
        for (const b of EDIT_BRANCHES) {
          const offer = cell.offers[b];
          const g = el('g');
          const box = el('rect', {
            x: -CHIP_W / 2,
            y: -CHIP_H / 2,
            width: CHIP_W,
            height: CHIP_H,
            rx: 7,
          });
          const label = text(0, 6, String(offer), { size: fontSizes.lg, weight: '600' });
          const cost = costOf(cell, b) ?? 0;
          const free = cost === 0;
          const badge = el('g');
          const badgeBox = el('rect', {
            x: CHIP_W / 2 + 5,
            y: -BADGE_H / 2,
            width: BADGE_W,
            height: BADGE_H,
            rx: 5,
            fill: free ? c.accent : c.bgSubtle,
            stroke: free ? c.accent : c.border,
          });
          const badgeText = text(CHIP_W / 2 + 5 + BADGE_W / 2, 4, `+${cost}`, {
            size: fontSizes.xs,
            family: fonts.mono,
            fill: free ? c.stateInk : c.textMuted,
          });
          badge.appendChild(badgeBox);
          badge.appendChild(badgeText);
          g.appendChild(box);
          g.appendChild(label);
          g.appendChild(badge);
          gChips.appendChild(g);

          const parts: ChipParts = {
            g,
            box,
            label,
            badge,
            badgeBox,
            badgeText,
            home: homeOf(b),
            entry: { x: laneX(b), y: LANE_ENTRY_Y + CHIP_H / 2 + 6 },
            seat: { x: laneX(b), y: levelY(scene.levels, offer) },
            was: cell.neighbours[b],
            now: offer,
          };
          paintChip(parts, cell, b, cell.weighed);
          markChip(parts, true);
          placeChip(
            parts,
            parts.seat,
            cell.settled && !winners.includes(b) ? LOSER_SCALE : 1,
          );
          chips.set(b, parts);
        }
      }

      // ── 캡션.
      gCaption.appendChild(
        text(W / 2, CAPTION_Y, captionOf(scene), { size: fontSizes.md, fill: c.text }),
      );

      return {
        targetGroup,
        chips,
        bar,
        barY,
        rowMark,
        colMark,
        laneLabel,
        targetBox,
        targetValue,
      };
    }

    // ── 운동. 정적 그리기가 끝 자리를 세웠으므로 아직 못 온 만큼을 뒤로 물린다 ──

    /** 표시자가 앞 칸의 자리에서 지금 칸의 두 글자로 미끄러진다. */
    function flowOpen(
      scene: ThreeEditChoicesScene,
      drawn: Drawn,
      index: number,
      mine: number,
    ): Promise<void> {
      const rowMark = drawn.rowMark;
      const colMark = drawn.colMark;
      if (rowMark === null || colMark === null) return Promise.resolve();
      // 출발 자리는 **앞 칸의 방문**이다. 화면의 지금 자리를 되읽지 않는다 (함정 28).
      const from = index === 0 ? { row: 0, col: 0 } : markAt(scene, index - 1);
      const to = markAt(scene, index);
      return tween(MARK_MS, mine, (p) => {
        const e = ease(p);
        rowMark.setAttribute('x', f2(lerp(markX(from.row), markX(to.row), e)));
        colMark.setAttribute('x', f2(lerp(markX(from.col), markX(to.col), e)));
      });
    }

    /**
     * 이웃 셋이 값을 들고 제 레인으로 날아가 비용을 더하고 내려앉는다.
     *
     * 셋이 한 뜻으로 묶인 운동이라 **시계를 하나만 쓴다** — 갈래마다 출발만 어긋난다
     * (프로토콜 3-4). 시계가 셋이면 그중 하나를 `void` 로 흘릴 여지가 생긴다.
     */
    function flowOffer(drawn: Drawn, mine: number): Promise<void> {
      const order = EDIT_BRANCHES.map((b, k) => ({ parts: drawn.chips.get(b), delay: k * STAGGER_MS }));
      return tween(OFFER_MS, mine, (p) => {
        const clock = OFFER_MS * p;
        for (const item of order) {
          const parts = item.parts;
          if (parts === undefined) continue;
          const e = clock - item.delay;
          if (e <= 0) {
            placeChip(parts, parts.home, 1);
            markChip(parts, false);
          } else if (e < FLY_MS) {
            const q = ease(e / FLY_MS);
            placeChip(
              parts,
              {
                x: lerp(parts.home.x, parts.entry.x, q),
                y: lerp(parts.home.y, parts.entry.y, q),
              },
              1,
            );
            markChip(parts, false);
          } else {
            const q = ease(clamp01((e - FLY_MS) / SINK_MS));
            placeChip(
              parts,
              { x: parts.entry.x, y: lerp(parts.entry.y, parts.seat.y, q) },
              1,
            );
            markChip(parts, true);
          }
        }
      });
    }

    /**
     * 바닥에서 선이 올라와 가장 낮은 것에 닿아 멈춘다.
     *
     * 닿기 전까지는 아직 견주기 전의 테두리로 그린다 — 선이 멎는 순간 마무리
     * 그리기가 이긴 쪽을 드러낸다.
     */
    function flowWeigh(drawn: Drawn, cell: EditCell, mine: number): Promise<void> {
      const bar = drawn.bar;
      if (bar === null) return Promise.resolve();
      for (const b of EDIT_BRANCHES) {
        const parts = drawn.chips.get(b);
        if (parts !== undefined) paintChip(parts, cell, b, false);
        paintLaneLabel(drawn.laneLabel[b], cell, b, false);
      }
      const goal = drawn.barY;
      return tween(RISE_MS, mine, (p) => {
        const y = f2(lerp(LADDER_BOTTOM, goal, easeOut(p)));
        bar.setAttribute('y1', y);
        bar.setAttribute('y2', y);
      });
    }

    /**
     * 이긴 값의 **복제본**이 칸으로 올라가고, 진 것은 제자리에서 물러난다.
     *
     * 칩째 옮기면 "가장 낮았다" 는 증거가 함께 사라지므로 복제본을 보낸다. 진 칩은
     * 세로로 움직이지 않는다 — 높이가 곧 값이라 아래로 빠지면 "더 싸졌다" 가 된다.
     */
    function flowSettle(drawn: Drawn, cell: EditCell, mine: number): Promise<void> {
      const winners = winnersOf(cell);
      const value = bestOf(cell);
      if (value === null) return Promise.resolve();
      const goal: Pt = { x: centerX(1), y: centerY(1) };

      // 칸은 아직 정해지지 않은 모습으로 되돌린다. 복제본이 닿는 순간 굳는다.
      drawn.targetBox.setAttribute('fill', c.bg);
      drawn.targetBox.setAttribute('stroke', c.border);
      drawn.targetBox.setAttribute('stroke-dasharray', '5 4');
      drawn.targetValue.textContent = '';

      const carriers: Array<{ g: SVGGElement; from: Pt }> = [];
      for (const b of winners) {
        const parts = drawn.chips.get(b);
        if (parts === undefined) continue;
        const g = el('g');
        g.appendChild(
          el('rect', {
            x: -CHIP_W / 2,
            y: -CHIP_H / 2,
            width: CHIP_W,
            height: CHIP_H,
            rx: 7,
            fill: c.itemPivot,
            stroke: c.itemComparing,
            'stroke-width': 2.5,
          }),
        );
        g.appendChild(
          text(0, 6, String(value), { size: fontSizes.lg, weight: '600', fill: c.stateInk }),
        );
        gCarry.appendChild(g);
        carriers.push({ g, from: parts.seat });
      }

      const losers = EDIT_BRANCHES.filter((b) => !winners.includes(b))
        .map((b) => drawn.chips.get(b))
        .filter((parts): parts is ChipParts => parts !== undefined);

      return tween(CARRY_MS, mine, (p) => {
        const e = ease(p);
        for (const carrier of carriers) {
          const shrink = clamp01((e - 0.72) / 0.28);
          carrier.g.setAttribute(
            'transform',
            `translate(${f2(lerp(carrier.from.x, goal.x, e))} ${f2(
              lerp(carrier.from.y, goal.y, e),
            )}) scale(${lerp(1, 0.2, shrink).toFixed(3)})`,
          );
          carrier.g.setAttribute('opacity', (1 - shrink).toFixed(3));
        }
        // 물러남은 더 일찍 끝난다. 제자리에서 줄어들 뿐 높이는 그대로다.
        const back = ease(clamp01(p / 0.65));
        for (const parts of losers) placeChip(parts, parts.seat, lerp(1, LOSER_SCALE, back));
      });
    }

    /** 정해진 칸이 한 번 떠올랐다 내려앉는다. */
    function flowDone(drawn: Drawn, mine: number): Promise<void> {
      const group = drawn.targetGroup;
      return tween(BOB_MS, mine, (p) => {
        const lift = Math.sin(p * Math.PI) * 7;
        group.setAttribute('transform', `translate(0 ${f2(-lift)})`);
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: ThreeEditChoicesScene,
      _prev: ThreeEditChoicesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;
      const index = currentIndex(next);
      const cell = index === null ? null : cellAt(next, index);

      switch (step.kind) {
        case 'open':
          if (index !== null) await flowOpen(next, drawn, index, mine);
          break;
        case 'offer':
          await flowOffer(drawn, mine);
          break;
        case 'weigh':
          if (cell !== null) await flowWeigh(drawn, cell, mine);
          break;
        case 'settle':
          if (cell !== null) await flowSettle(drawn, cell, mine);
          break;
        case 'done':
          await flowDone(drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 운반체가 노드째 사라진다. 되돌릴 목록을 손으로
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
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 타이머는 콜백을 아예 부르지 않으므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
