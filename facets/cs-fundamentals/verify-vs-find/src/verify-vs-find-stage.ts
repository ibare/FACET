/**
 * verify-vs-find 의 그림. 장면(Scene) 하나를 받아 그 걸음의 화면을 통째로 세운다.
 *
 * ── 형태가 어디서 나왔는가
 * 질문의 동사는 **갈린다** 이고, 갈리는 것은 "들여다본 후보의 수" 다. 그래서
 * 화면의 두 줄은 **같은 크기의 칸**으로 후보를 그린다 — 확인 줄에 한 칸,
 * 찾기 줄에 예순네 칸. 칸 크기가 같으므로 두 자(尺)가 감싼 넓이가 곧 값의
 * 차이가 된다. 축척을 누르지 않고 곧이곧대로 그릴 수 있는 크기를 고른 결과다.
 *
 * 칸마다 여섯 자리의 점을 찍는다. 점 하나가 수 하나이고, 찍힌 자리가 곧 그
 * 후보가 고른 조합이다 — 예순네 칸이 "모든 조합" 이라는 것이 그 무늬로 보인다.
 *
 * ── 두 칠이 부딪히지 않게 축을 가른다
 *   · **채움 = 값의 형편** — 이 후보가 답인가 (accent) 아닌가 (bgSubtle)
 *   · **테두리와 점 잉크 = 짚음의 표식** — 들여다보았나 (진한 잉크) 아직인가 (옅은 잉크)
 *   · **자(尺) = 그 줄이 지금까지 들여다본 범위** — 훑을수록 자란다. 끝까지 남는다
 *   · **횃불 = 지금 들여다보는 묶음** — 그 걸음에만 선다. 매듭지으면 꺼진다
 *
 * 답이 드러나도 "훑었다" 는 사실이 지워지지 않고, 훑기가 끝나도 "여기가 지금" 이
 * 옛 자리에 눌어붙지 않는다.
 *
 * ── 운동
 *   · 원본 수가 왼쪽 바깥에서 미끄러져 들어와 서고, 목표가 위에서 내려앉는다
 *   · 건네받은 후보의 수들이 원본에서 복제되어 내려오고, 서로 붙으면서 합으로
 *     뭉친다. 뭉친 합은 목표 바로 아래 자리까지 가서 선다
 *   · 훑기는 **시계 하나**다 — 자가 늘어나는 것 · 칸이 뒤집히는 것 · 옆의 수가
 *     오르는 것이 한 뜻이라 한 `tween` 에 함께 얹는다
 *   · 답을 만난 칸은 판에서 위로 날아올라 선반에서 펼쳐진다
 *   · 매듭지으면 두 자가 한 번 굵어졌다 돌아온다 — 나란히 선 둘이 한눈에 든다
 *
 * 캔버스 가로는 러너가 `PIECE_CANVAS_W` 로 준다. 세로는 그림이 정하므로 여기
 * 상수로 둔다 (S-piece · S-view).
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

import { expandCandidate } from './algorithm.js';
import {
  candidateCount,
  findSeen,
  verifySeen,
  type VerifyVsFindScene,
  type VerifyVsFindSceneStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 360;

/** 판이 쓸 수 있는 세로. 칸 크기는 여기서 역산한다. */
const FIELD_MAX_H = 132;
const TILE_MAX = 30;
const TILE_GAP = 4;
const FIELD_COLS_MAX = 16;
const SIDE_MIN = 16;

const CHIP_H = 34;
const CHIP_MAX_W = 56;
const CHIP_GAP = 10;
const SOURCE_ROW_W = 380;
const PLATE_W = 64;

const SOURCE_Y = 16;
const VERIFY_LABEL_Y = 76;
const VERIFY_Y = 86;
const FIND_LABEL_Y = 142;
const SHELF_Y = 152;
const SHELF_H = 30;
const SHELF_GAP = 15;
const SHELF_MAX_W = 180;
const FIELD_Y = 196;
const CAPTION_Y = 346;

const DOT_COLS = 3;

/** 자는 자취에 바싹 붙고, 횃불은 그 바깥에 선다 — 둘이 겹쳐 읽히지 않게. */
const GAUGE_PAD = 3;
const TORCH_PAD = 8;
const GAUGE_STROKE = 2;

const POSE_MS = 420;
const DROP_MS = 300;
const MERGE_MS = 240;
const REACH_MS = 280;
const SWEEP_MS = 420;
const LIFT_MS = 380;
const SETTLE_MS = 460;

type Box = { x: number; y: number; w: number; h: number };

/**
 * 자리 셈의 결과. 바탕(수의 개수)만 있으면 정해진다.
 *
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 재면 순회 순서가 곧
 * 숨은 상태가 된다.
 */
type Layout = {
  n: number;
  candidates: number;
  cols: number;
  rows: number;
  tile: number;
  pitch: number;
  fieldW: number;
  fieldH: number;
  originX: number;
  chipW: number;
  plateX: number;
  dotRows: number;
};

function layoutOf(n: number): Layout {
  const candidates = n > 0 ? 2 ** n : 0;
  const cols = Math.max(1, Math.min(FIELD_COLS_MAX, candidates));
  const rows = Math.max(1, Math.ceil(candidates / cols));
  const tile = Math.max(
    6,
    Math.min(
      TILE_MAX,
      Math.floor((W - SIDE_MIN * 2 - TILE_GAP * (cols - 1)) / cols),
      Math.floor((FIELD_MAX_H - TILE_GAP * (rows - 1)) / rows),
    ),
  );
  const pitch = tile + TILE_GAP;
  const fieldW = cols * pitch - TILE_GAP;
  const fieldH = rows * pitch - TILE_GAP;
  const chipW = Math.min(
    CHIP_MAX_W,
    Math.max(24, Math.floor((SOURCE_ROW_W - CHIP_GAP * Math.max(0, n - 1)) / Math.max(1, n))),
  );
  const originX = Math.round((W - fieldW) / 2);
  return {
    n,
    candidates,
    cols,
    rows,
    tile,
    pitch,
    fieldW,
    fieldH,
    originX,
    chipW,
    plateX: originX + fieldW - PLATE_W,
    dotRows: Math.max(1, Math.ceil(n / DOT_COLS)),
  };
}

/** 칸 하나의 손잡이. 짚음의 표식이 테두리와 점에, 값의 형편이 채움에 실린다. */
type TileRef = { rect: SVGElement; dots: SVGElement[] };

type ChipRef = { g: SVGElement; rect: SVGElement; label: SVGElement };

/** 한 번의 정적 그리기가 내놓는 손잡이들. 운동이 이것을 쥐고 흐른다. */
type Refs = {
  layout: Layout;
  sourceChips: SVGElement[];
  targetPlate: SVGElement | null;
  targetLabel: SVGElement | null;
  verifyTile: SVGElement | null;
  verifyGauge: SVGElement | null;
  verifyCount: SVGElement | null;
  verifyCheck: SVGElement | null;
  sumChip: ChipRef | null;
  tiles: TileRef[];
  findGauge: SVGElement | null;
  findCount: SVGElement | null;
  plates: ChipRef[];
  transient: SVGElement;
};

export const verifyVsFindStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const c = getColors(params.theme);
    // 문안을 만드는 것이 이제 그리는 쪽의 일이다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

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
     * 정적 그리기가 칸과 딱지를 매번 새로 짓지만, 운동이 쥔 것은 **그때의 손잡이**
     * 다. 되짚기나 `destroy` 가 가운데 끼어들면 이미 떨어져 나간 노드를 붙들고
     * 있게 되므로, 깨어난 운동은 자기 세대를 확인하고 아니면 손대지 않는다.
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
          draw(ease(raw));
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

    /** 여럿이 조금씩 늦게 출발하게 한다. */
    function stagger(p: number, i: number, count: number): number {
      const span = 1 / (count + 2);
      const from = i * span;
      return Math.max(0, Math.min(1, (p - from) / (1 - from)));
    }

    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    // ── 그리기 도구 ──────────────────────────────────────────────────
    function put(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    const root = put(canvas, 'g', {});

    // ── 자리 셈 ─────────────────────────────────────────────────────
    const tileX = (L: Layout, i: number): number => L.originX + (i % L.cols) * L.pitch;
    const tileY = (L: Layout, i: number): number => FIELD_Y + Math.floor(i / L.cols) * L.pitch;
    const chipX = (L: Layout, i: number): number => L.originX + i * (L.chipW + CHIP_GAP);
    const slotX = (L: Layout, i: number): number =>
      L.originX + L.tile + 46 + i * (L.chipW + CHIP_GAP);
    const sumY = (L: Layout): number => VERIFY_Y + L.tile / 2 - CHIP_H / 2;

    /** 선반 딱지의 폭. 지금 선반에 앉은 답의 수에서 낸다 — 앞으로 몇이 더 나올지는 모른다. */
    const plateW = (count: number, L: Layout): number =>
      Math.min(
        SHELF_MAX_W,
        Math.floor((L.fieldW - SHELF_GAP * Math.max(0, count - 1)) / Math.max(1, count)),
      );

    function blockBox(L: Layout, from: number, to: number): Box {
      const firstRow = Math.floor(from / L.cols);
      const lastRow = Math.floor(Math.max(from, to - 1) / L.cols);
      if (firstRow === lastRow) {
        return { x: tileX(L, from), y: tileY(L, from), w: (to - from) * L.pitch - TILE_GAP, h: L.tile };
      }
      return {
        x: L.originX,
        y: FIELD_Y + firstRow * L.pitch,
        w: L.fieldW,
        h: (lastRow - firstRow + 1) * L.pitch - TILE_GAP,
      };
    }

    /**
     * 자취 `[0, count)` 를 감싸는 자의 테두리.
     *
     * 줄이 딱 떨어지면 네모, 아니면 오른쪽 아래가 한 단 들어간 여섯 점짜리 꼴이
     * 된다. `count` 가 소수여도 이어지므로 자가 자라는 운동에 그대로 쓴다 —
     * 네모로 뭉뚱그리면 "여기까지 봤다" 가 실제보다 넓게 보여 화면이 거짓말을 한다.
     */
    function gaugePoints(L: Layout, count: number): string {
      const seen = Math.max(0, Math.min(L.candidates, count));
      const fullRows = Math.floor(seen / L.cols);
      const rem = seen - fullRows * L.cols;
      const x0 = L.originX - GAUGE_PAD;
      const xR = L.originX + L.fieldW + GAUGE_PAD;
      const xP = L.originX + rem * L.pitch - TILE_GAP + GAUGE_PAD;
      const yTop = FIELD_Y - GAUGE_PAD;
      const yMid = FIELD_Y + fullRows * L.pitch - TILE_GAP + GAUGE_PAD;
      const yBot = FIELD_Y + (fullRows + 1) * L.pitch - TILE_GAP + GAUGE_PAD;
      if (rem <= 0) return `${x0},${yTop} ${xR},${yTop} ${xR},${yMid} ${x0},${yMid}`;
      if (fullRows <= 0) return `${x0},${yTop} ${xP},${yTop} ${xP},${yBot} ${x0},${yBot}`;
      return `${x0},${yTop} ${xR},${yTop} ${xR},${yMid} ${xP},${yMid} ${xP},${yBot} ${x0},${yBot}`;
    }

    /** 자 옆의 수가 서는 자리 — 자가 자라는 앞머리를 따라간다. */
    function gaugeCountAt(L: Layout, count: number): { x: number; y: number } {
      const seen = Math.max(0, Math.min(L.candidates, count));
      const fullRows = Math.floor(seen / L.cols);
      const rem = seen - fullRows * L.cols;
      const leadRow = rem > 0 ? fullRows : Math.max(0, fullRows - 1);
      const leadRight =
        rem > 0 ? L.originX + rem * L.pitch - TILE_GAP : L.originX + L.fieldW;
      return {
        x: Math.min(W - 30, leadRight + 10),
        y: FIELD_Y + leadRow * L.pitch + L.tile / 2 + 4,
      };
    }

    function dotsFor(
      parent: Element,
      L: Layout,
      mask: number,
      x: number,
      y: number,
      size: number,
      ink: string,
    ): SVGElement[] {
      const out: SVGElement[] = [];
      const dx = size / (DOT_COLS + 1);
      const dy = size / (L.dotRows + 1);
      const r = Math.max(1.4, size / 13);
      for (let i = 0; i < L.n; i += 1) {
        if ((mask & (1 << i)) === 0) continue;
        out.push(
          put(parent, 'circle', {
            cx: x + dx * ((i % DOT_COLS) + 1),
            cy: y + dy * (Math.floor(i / DOT_COLS) + 1),
            r,
            fill: ink,
          }),
        );
      }
      return out;
    }

    /**
     * 후보 칸 하나.
     *
     * `looked` 는 짚음의 표식(테두리 · 점 잉크), `answer` 는 값의 형편(채움)이다.
     * 두 물음이 각자 제 축에 있으므로 답으로 드러난 칸도 "훑었다" 를 함께 말한다.
     */
    function tileAt(
      parent: Element,
      L: Layout,
      mask: number,
      x: number,
      y: number,
      looked: boolean,
      answer: boolean,
    ): TileRef {
      const rect = put(parent, 'rect', {
        x,
        y,
        width: L.tile,
        height: L.tile,
        rx: 4,
        fill: answer ? c.accent : c.bgSubtle,
        stroke: looked ? c.text : c.border,
        'stroke-width': looked ? 1.5 : 1,
      });
      // 타일이 테마를 따라 뒤집으면 잉크도 뒤집고, 고정이면 고정한다 (design-tokens).
      const ink = looked ? (answer ? c.stateInk : c.text) : c.textMuted;
      return { rect, dots: dotsFor(parent, L, mask, x, y, L.tile, ink) };
    }

    function chip(
      parent: Element,
      x: number,
      y: number,
      w: number,
      text: string,
      tone: 'plain' | 'match',
    ): ChipRef {
      const g = put(parent, 'g', {});
      const rect = put(g, 'rect', {
        x,
        y,
        width: w,
        height: CHIP_H,
        rx: 6,
        fill: tone === 'match' ? c.accent : c.itemDefault,
        stroke: tone === 'match' ? c.accent : c.border,
        'stroke-width': 1,
      });
      const label = put(
        g,
        'text',
        {
          x: x + w / 2,
          y: y + CHIP_H / 2 + 5,
          'text-anchor': 'middle',
          fill: tone === 'match' ? c.stateInk : c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        },
        text,
      );
      return { g, rect, label };
    }

    function label(parent: Element, x: number, y: number, text: string, anchor?: string): SVGElement {
      return put(
        parent,
        'text',
        {
          x,
          y,
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          ...(anchor === undefined ? {} : { 'text-anchor': anchor }),
        },
        text,
      );
    }

    function gaugeCount(parent: Element, x: number, y: number, n: number): SVGElement {
      return put(
        parent,
        'text',
        {
          x,
          y,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        },
        String(n),
      );
    }

    function torchAround(parent: Element, box: Box): SVGElement {
      return put(parent, 'rect', {
        x: box.x - TORCH_PAD,
        y: box.y - TORCH_PAD,
        width: box.w + TORCH_PAD * 2,
        height: box.h + TORCH_PAD * 2,
        rx: 6,
        fill: 'none',
        stroke: c.itemComparing,
        'stroke-width': GAUGE_STROKE,
      });
    }

    // ── 캡션 ────────────────────────────────────────────────────────
    /** 수는 장면의 자취에서 꺼낸다 — 캡션과 자 옆의 수가 한 출처여야 한다. */
    function captionText(scene: VerifyVsFindScene): string {
      const kind = scene.caption?.kind;
      if (kind === undefined) return '';
      switch (kind) {
        case 'setup':
          return t('caption.setup', '{count} numbers, and a target of {target}.', {
            count: scene.values.length,
            target: scene.target,
          });
        case 'verify': {
          const sum = scene.given === null ? 0 : expandCandidate(scene.values, scene.given).sum;
          return t(
            'caption.verify',
            'Someone hands you one candidate. Add it up: {sum}. One look and it is done.',
            { sum },
          );
        }
        case 'sweep':
          return t(
            'caption.sweep',
            'Nobody hands you anything, so every candidate gets a look. Looked at: {seen} of {total}.',
            { seen: findSeen(scene), total: candidateCount(scene) },
          );
        case 'hit':
          return t('caption.hit', 'A match turns up in this batch. Looked at: {seen} of {total}.', {
            seen: findSeen(scene),
            total: candidateCount(scene),
          });
        case 'done':
          return t('caption.done', 'Checking looked at {verifySeen}. Finding had to look at all {findSeen}.', {
            verifySeen: verifySeen(scene),
            findSeen: findSeen(scene),
          });
      }
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────
    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않고 늘 통째로 짓는다 —
     * 그래서 되돌릴 명령이 필요 없고, 어느 걸음에서 오든 결과가 같다 (S-scene).
     */
    function drawStatic(scene: VerifyVsFindScene): Refs {
      root.textContent = '';
      const L = layoutOf(scene.values.length);
      const step = scene.step;

      const fieldLayer = put(root, 'g', {});
      const shelfLayer = put(root, 'g', {});
      const sourceLayer = put(root, 'g', {});
      const verifyLayer = put(root, 'g', {});
      const gaugeLayer = put(root, 'g', {});
      const torchLayer = put(root, 'g', {});
      // 그 걸음의 운동에만 사는 것들이 여기 산다. 정적 그리기는 비운 채로 둔다.
      const transient = put(root, 'g', {});

      const refs: Refs = {
        layout: L,
        sourceChips: [],
        targetPlate: null,
        targetLabel: null,
        verifyTile: null,
        verifyGauge: null,
        verifyCount: null,
        verifyCheck: null,
        sumChip: null,
        tiles: [],
        findGauge: null,
        findCount: null,
        plates: [],
        transient,
      };

      // ── 판. 후보의 자리는 처음부터 거기 있다 — 들여다보기 전에도 후보는 존재한다.
      const answers = new Set(scene.found);
      for (let i = 0; i < L.candidates; i += 1) {
        refs.tiles.push(
          tileAt(fieldLayer, L, i, tileX(L, i), tileY(L, i), i < scene.swept, answers.has(i)),
        );
      }

      // ── 줄 이름.
      label(root, L.originX, VERIFY_LABEL_Y, t('label.verify', 'Checking'));
      label(root, L.originX, FIND_LABEL_Y, t('label.find', 'Finding'));

      // ── 수와 목표.
      if (scene.posed) {
        refs.sourceChips = scene.values.map(
          (value, i) => chip(sourceLayer, chipX(L, i), SOURCE_Y, L.chipW, String(value), 'plain').g,
        );
        refs.targetLabel = label(
          sourceLayer,
          L.plateX - 12,
          SOURCE_Y + CHIP_H / 2 + 4,
          t('label.target', 'Target'),
          'end',
        );
        refs.targetPlate = chip(
          sourceLayer,
          L.plateX,
          SOURCE_Y,
          PLATE_W,
          String(scene.target),
          'plain',
        ).g;
      }

      // ── 확인 줄. 건네받은 후보 하나와, 그 하나를 감싼 자.
      if (scene.given !== null) {
        const given = expandCandidate(scene.values, scene.given);
        const ok = given.sum === scene.target;
        const tileGroup = put(verifyLayer, 'g', {});
        refs.verifyTile = tileGroup;
        tileAt(tileGroup, L, scene.given, L.originX, VERIFY_Y, true, ok);

        refs.sumChip = chip(
          verifyLayer,
          L.plateX,
          sumY(L),
          PLATE_W,
          String(given.sum),
          ok ? 'match' : 'plain',
        );
        if (ok) {
          refs.verifyCheck = put(verifyLayer, 'path', {
            d: `M ${L.plateX - 30} ${VERIFY_Y + L.tile / 2} l 6 7 l 12 -15`,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          });
        }

        // 확인 줄의 자 — 찾기 줄의 자와 같은 도구, 같은 눈금이다.
        refs.verifyGauge = put(gaugeLayer, 'rect', {
          x: L.originX - GAUGE_PAD,
          y: VERIFY_Y - GAUGE_PAD,
          width: L.tile + GAUGE_PAD * 2,
          height: L.tile + GAUGE_PAD * 2,
          rx: 5,
          fill: 'none',
          stroke: c.text,
          'stroke-width': GAUGE_STROKE,
        });
        refs.verifyCount = gaugeCount(
          gaugeLayer,
          L.originX + L.tile + 12,
          VERIFY_Y + L.tile / 2 + 4,
          verifySeen(scene),
        );
      }

      // ── 찾기 줄의 자. 훑은 자취를 감싸며 자란다.
      if (scene.swept > 0) {
        refs.findGauge = put(gaugeLayer, 'polygon', {
          points: gaugePoints(L, scene.swept),
          fill: 'none',
          stroke: c.text,
          'stroke-width': GAUGE_STROKE,
          'stroke-linejoin': 'round',
        });
        const at = gaugeCountAt(L, scene.swept);
        refs.findCount = gaugeCount(gaugeLayer, at.x, at.y, findSeen(scene));
      }

      // ── 선반. 드러난 답이 펼쳐진다.
      const pw = plateW(scene.found.length, L);
      refs.plates = scene.found.map((mask, k) => {
        const g = put(shelfLayer, 'g', {
          transform: `translate(${L.originX + k * (pw + SHELF_GAP)}, ${SHELF_Y})`,
        });
        const expanded = expandCandidate(scene.values, mask);
        const rect = put(g, 'rect', {
          x: 0,
          y: 0,
          width: pw,
          height: SHELF_H,
          rx: 5,
          fill: c.accent,
          stroke: c.accent,
          'stroke-width': 1,
        });
        const text = put(
          g,
          'text',
          {
            x: pw / 2,
            y: SHELF_H / 2 + 5,
            'text-anchor': 'middle',
            fill: c.stateInk,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          `${expanded.picked.join(' + ')} = ${expanded.sum}`,
        );
        return { g, rect, label: text };
      });

      // ── 횃불. 지금 들여다보는 묶음에만 선다. 매듭지으면 꺼진다.
      if (step?.kind === 'verify') {
        torchAround(torchLayer, { x: L.originX, y: VERIFY_Y, w: L.tile, h: L.tile });
      } else if (step?.kind === 'sweep' && step.to > step.from) {
        torchAround(torchLayer, blockBox(L, step.from, step.to));
      }

      label(root, L.originX, CAPTION_Y, captionText(scene));
      return refs;
    }

    // ── 걸음의 운동 ─────────────────────────────────────────────────
    /** 수가 왼쪽 바깥에서 미끄러져 들어와 서고, 목표가 위에서 내려앉는다. */
    function flowPose(refs: Refs, my: number): Promise<void> {
      const travel = refs.layout.originX + refs.layout.chipW + 40;
      const count = refs.sourceChips.length;
      return tween(POSE_MS, my, (e) => {
        refs.sourceChips.forEach((g, i) => {
          const q = stagger(e, i, count);
          g.setAttribute('transform', `translate(${(q - 1) * travel}, 0)`);
        });
        refs.targetPlate?.setAttribute('transform', `translate(0, ${(e - 1) * 24})`);
        refs.targetLabel?.setAttribute('opacity', String(e));
      });
    }

    /**
     * 건네받은 후보 하나. 원본에서 복제된 수가 내려와 서로 붙으면서 합으로 뭉치고,
     * 뭉친 합이 목표 바로 아래로 가서 선다.
     *
     * 세 마디가 서로 다른 뜻이라 차례로 잇는다. 출발 그림은 전부 장면에서 나온다 —
     * 어느 수를 골랐는지가 후보 번호에 있고, 중간 합은 `expandCandidate` 가 편다.
     */
    async function flowVerify(scene: VerifyVsFindScene, refs: Refs, my: number): Promise<void> {
      const L = refs.layout;
      const runner = refs.sumChip;
      if (scene.given === null || !runner) return;
      const given = expandCandidate(scene.values, scene.given);
      const src: number[] = [];
      for (let i = 0; i < L.n; i += 1) if ((scene.given & (1 << i)) !== 0) src.push(i);
      const k = given.picked.length;
      if (k === 0) return;

      // 아직 오지 않은 것들을 뒤로 물린다. 정적 그리기가 이미 끝 자리에 세워 두었다.
      refs.verifyTile?.setAttribute('opacity', '0');
      refs.verifyGauge?.setAttribute('opacity', '0');
      refs.verifyCount?.setAttribute('opacity', '0');
      refs.verifyCheck?.setAttribute('opacity', '0');

      const homeX = chipX(L, src[0] ?? 0);
      const dropX = slotX(L, 0) - L.plateX;
      const backX = homeX - L.plateX;
      const backY = SOURCE_Y - sumY(L);

      // 뒤따르는 복제본은 이 걸음에만 사는 것들이라 임시 레이어에 짓는다.
      const others = given.picked.slice(1).map((value, j) =>
        chip(
          refs.transient,
          chipX(L, src[j + 1] ?? j + 1),
          SOURCE_Y,
          L.chipW,
          String(value),
          'plain',
        ),
      );

      // 1) 복제본이 슬롯으로 내려온다.
      runner.label.textContent = String(given.picked[0] ?? given.sum);
      await tween(DROP_MS, my, (e) => {
        const q0 = stagger(e, 0, k);
        runner.g.setAttribute(
          'transform',
          `translate(${lerp(backX, dropX, q0)}, ${lerp(backY, 0, q0)})`,
        );
        others.forEach((o, j) => {
          const q = stagger(e, j + 1, k);
          const from = chipX(L, src[j + 1] ?? j + 1);
          o.g.setAttribute(
            'transform',
            `translate(${lerp(0, slotX(L, j + 1) - from, q)}, ${lerp(0, sumY(L) - SOURCE_Y, q)})`,
          );
        });
        refs.verifyTile?.setAttribute('opacity', String(Math.min(1, e * 1.6)));
      });
      if (!alive(my)) return;

      // 2) 오른쪽 것이 왼쪽으로 붙고, 붙을 때마다 합으로 바뀐다.
      for (let j = 0; j < others.length; j += 1) {
        const moving = others[j];
        if (!moving) break;
        const from = chipX(L, src[j + 1] ?? j + 1);
        const base = slotX(L, j + 1) - from;
        const gap = slotX(L, j + 1) - slotX(L, 0);
        await tween(MERGE_MS, my, (e) => {
          moving.g.setAttribute(
            'transform',
            `translate(${base - gap * e}, ${sumY(L) - SOURCE_Y})`,
          );
          moving.g.setAttribute('opacity', String(1 - e * 0.7));
          runner.g.setAttribute('transform', `translate(${dropX}, 0)`);
        });
        if (!alive(my)) return;
        moving.g.remove();
        runner.label.textContent = String(given.partials[j + 1] ?? given.sum);
      }

      // 3) 뭉친 합이 목표 바로 아래로 가서 서고, 자와 표식이 함께 든다.
      await tween(REACH_MS, my, (e) => {
        runner.g.setAttribute('transform', `translate(${lerp(dropX, 0, e)}, 0)`);
        const inked = String(Math.min(1, Math.max(0, e * 1.8 - 0.8)));
        refs.verifyGauge?.setAttribute('opacity', inked);
        refs.verifyCount?.setAttribute('opacity', inked);
        refs.verifyCheck?.setAttribute('opacity', inked);
      });
    }

    /**
     * 훑기. **시계 하나**다.
     *
     * 자가 늘어나는 것 · 칸이 차례로 뒤집히는 것 · 옆의 수가 오르는 것이 한 뜻
     * (이만큼 더 들여다봤다) 이므로 한 `tween` 에 함께 얹는다. 시계를 둘로 나누면
     * 나란함이 우연히 맞는 꼴이 된다.
     */
    async function flowSweep(
      scene: VerifyVsFindScene,
      step: Extract<VerifyVsFindSceneStep, { kind: 'sweep' }>,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const width = Math.max(1, step.to - step.from);
      const answers = new Set(scene.found);

      await tween(SWEEP_MS, my, (e) => {
        const seen = lerp(step.from, step.to, e);
        if (refs.findGauge) {
          refs.findGauge.setAttribute('points', gaugePoints(L, seen));
          // 아직 아무것도 안 본 자리에서는 자를 숨기지 말고 짓지 않은 것처럼 둔다.
          refs.findGauge.setAttribute(
            'opacity',
            String(Math.min(1, ((seen - step.from + 0.01) * 3) / width)),
          );
        }
        if (refs.findCount) {
          const at = gaugeCountAt(L, seen);
          refs.findCount.setAttribute('x', String(at.x));
          refs.findCount.setAttribute('y', String(at.y));
          refs.findCount.textContent = String(Math.round(seen));
        }
        for (let i = step.from; i < step.to; i += 1) {
          const ref = refs.tiles[i];
          if (!ref) continue;
          const looked = stagger(e, i - step.from, width) > 0.5;
          ref.rect.setAttribute('stroke', looked ? c.text : c.border);
          ref.rect.setAttribute('stroke-width', looked ? '1.5' : '1');
          const answer = answers.has(i);
          ref.rect.setAttribute('fill', looked && answer ? c.accent : c.bgSubtle);
          const ink = looked ? (answer ? c.stateInk : c.text) : c.textMuted;
          for (const d of ref.dots) d.setAttribute('fill', ink);
        }
      });
      if (!alive(my)) return;

      // 답이 선반으로 오르는 것은 다른 뜻의 운동이라 훑기가 끝난 뒤에 함께 돈다.
      if (step.found.length === 0) return;
      const base = scene.found.length - step.found.length;
      await Promise.all(step.found.map((mask, j) => liftPlate(scene, refs, base + j, mask, my)));
    }

    /** 답을 만난 칸이 판에서 위로 날아올라 선반에서 펼쳐진다. */
    function liftPlate(
      scene: VerifyVsFindScene,
      refs: Refs,
      slot: number,
      mask: number,
      my: number,
    ): Promise<void> {
      const L = refs.layout;
      const plate = refs.plates[slot];
      if (!plate) return Promise.resolve();
      const pw = plateW(scene.found.length, L);
      const startX = tileX(L, mask);
      const startY = tileY(L, mask);
      const endX = L.originX + slot * (pw + SHELF_GAP);
      return tween(LIFT_MS, my, (e) => {
        const w = lerp(L.tile, pw, e);
        const h = lerp(L.tile, SHELF_H, e);
        plate.g.setAttribute(
          'transform',
          `translate(${lerp(startX, endX, e)}, ${lerp(startY, SHELF_Y, e)})`,
        );
        plate.rect.setAttribute('width', String(w));
        plate.rect.setAttribute('height', String(h));
        plate.label.setAttribute('x', String(w / 2));
        plate.label.setAttribute('y', String(h / 2 + 5));
        plate.label.setAttribute('opacity', String(Math.max(0, e * 2 - 1)));
      });
    }

    /**
     * 매듭. 두 자가 한 번 굵어졌다 돌아온다.
     *
     * 진폭이 양 끝에서 0 이므로 멎은 화면은 어느 걸음에서 오든 같다 — 상시로 도는
     * 떨림을 두면 되짚기가 구조적으로 설 수 없다.
     */
    function flowSettle(refs: Refs, my: number): Promise<void> {
      const gauges = [refs.verifyGauge, refs.findGauge].filter((g): g is SVGElement => g !== null);
      const counts = [refs.verifyCount, refs.findCount].filter((g): g is SVGElement => g !== null);
      if (gauges.length === 0) return Promise.resolve();
      return tween(SETTLE_MS, my, (e) => {
        const amp = Math.sin(Math.PI * e);
        for (const g of gauges) g.setAttribute('stroke-width', String(GAUGE_STROKE + 1.6 * amp));
        for (const n of counts) n.setAttribute('font-size', String(fontSizes.sm + 3 * amp));
      });
    }

    async function render(
      next: VerifyVsFindScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: VerifyVsFindScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'pose':
          await flowPose(refs, my);
          break;
        case 'verify':
          await flowVerify(next, refs, my);
          break;
        case 'sweep':
          await flowSweep(next, step, refs, my);
          break;
        case 'settle':
          await flowSettle(refs, my);
          break;
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
