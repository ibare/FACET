/**
 * overlapping-subproblems-stage — 같은 이름이 자꾸 돋는 나무와, 그 이름들이
 * 쌓이는 선반.
 *
 * 화면은 둘로 나뉜다. 위는 재귀 호출 나무 — 걸음마다 가지 하나가 **부모 자리에서
 * 아래로 미끄러져 내려와** 자기 자리에 앉는다. 처음 만나는 항은 옅게, 이미 풀었던
 * 항을 또 푸는 것은 진하게 그리고, 몇 번째로 나타났는지가 그 자리 모서리에 숫자로
 * 남는다.
 *
 * 아래는 이름 선반 — 항 하나마다 자리가 하나뿐이다. 마디가 돋을 때마다 그 항의
 * 복제 조각이 나무에서 **떨어져 나와 선반으로 날아가 쌓인다.** 원본(마디)은 나무에
 * 남는다. 다 펼치고 나면 어느 더미가 높은지가 곧 어느 항을 몇 번 다시 풀었는지다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **나무도 더미도 장면에서 파생된다.** 몇 개가 돋았는지(`sproutsDone`) 하나로 선
 * 마디와 가지와 각 항의 등장 차례와 더미 높이가 전부 나온다. 명령형 stage 에서는
 * 그 답이 두 레이어의 자식 수와 선반 딱지의 `textContent` 에만 있었다.
 *
 * **가지는 마디에서 파생된다.** 부모 자리와 자식 자리가 있으면 가지가 있는 것이고,
 * 전위 순서라 부모는 언제나 먼저 서 있다. 그래서 되감아도 가지가 조용히 사라질
 * 자리가 없다.
 *
 * **캔버스 세로 말고는 mount 때 재는 것이 없다.** 층 간격도 조각 간격도 칸 폭도
 * 정적 그리기가 매번 `layoutOf` 로 다시 정한다 — 나무가 자라는 조각이라 한 번만
 * 재면 첫 그림이 엉뚱한 자리에 선다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 마디는 이미 끝 자리에 서 있고,
 * 걸음은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 정적으로 세운 직후라 그 사이에
 * 타이머도 프레임도 없어 페인트가 끼지 않는다.
 *
 * ── 문자
 *
 * 화면에 새기는 글자는 `f(3)` · `×5` · `= 5` 와 등장 차례 숫자뿐이다. 전부 수식
 * 표기라 표식으로 두고 키를 만들지 않는다 (C10 판정 3). 캡션 문안은 여기서
 * `params.t` 로 만들고 장면은 무엇을 말할지만 담는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  callsOf,
  lastSprout,
  sproutTally,
  sproutedCalls,
  summaryOf,
  tallestPile,
  termColumns,
  type OverlappingSubproblemsMark,
  type OverlappingSubproblemsScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 상수로 둔다 (S-piece). */
const H = 330;

/** 좌우 최소 여백. 잎 자리 폭은 이 값을 뺀 나머지를 나눠 갖는다. */
const SIDE = 22;

const TREE_TOP = 14;
/** 나무가 쓸 수 있는 아래 끝. */
const TREE_BOTTOM = 208;
/** 가장 높이 쌓인 더미의 꼭대기. */
const PILE_TOP = 224;
/** 더미가 얹히는 선반 바닥. */
const SHELF_BASE = 288;
const SHELF_LABEL_Y = 303;
const CAPTION_Y = 322;

const NODE_H = 22;
const NODE_MAX_W = 52;
const ROW_PITCH_MAX = 43;
const CHIP_H = 10;
const CHIP_PITCH_MAX = 12;

const RULE_W_PLAIN = 1.4;
const RULE_W_WORST = 2.6;

/**
 * 마디 하나가 돋는 데 드는 시간.
 *
 * 가지가 뻗고 마디가 내려앉는 것과, 그 복제가 선반으로 날아가는 것은 **한 뜻으로
 * 묶인 운동**이다 — 같은 호출이 나무에도 남고 더미에도 쌓인다는 말을 한다. 그래서
 * 시계를 둘로 나누지 않고 한 시계 안에서 마디를 나눈다.
 */
const SPROUT_MS = 380;
/** 가지·마디가 제 자리에 닿는 지점 (전체 진행 대비). */
const BRANCH_END = 0.53;
/** 복제 조각이 떨어져 나가는 지점. */
const CHIP_START = 0.34;
/** 날아가는 조각이 그리는 호의 높이. */
const CHIP_ARC = 20;

/**
 * 셈이 나는 걸음의 밑시간.
 *
 * 이 걸음 뒤에는 자동 재생이 멎으므로 `stepMs` 가 더해지지 않는다 — 걸음 벽시계가
 * 곧 이 운동의 길이다. 명령형 stage 에서는 이 걸음에 운동이 아예 없어 벽시계가
 * 0 이었다. 가장 높은 더미가 다섯이면 520 × (1 + 0.14 × 5) ≈ 884ms 로, 캡션을
 * 읽을 틈(800ms)을 넘긴다 (S-piece 얇은 걸음).
 */
const SETTLE_MS = 520;
/** 더미가 아래에서 위로 훑어 올라가는 정도 (전체 진행 대비 비율). */
const SETTLE_STAGGER = 0.14;
/** 훑고 지나갈 때 조각이 부푸는 폭과 들리는 높이. */
const SETTLE_BULGE = 7;
const SETTLE_LIFT = 3;
/** 뿌리 옆 답이 내려앉기 시작하는 지점. */
const ANSWER_START = 0.45;
/** 답이 뿌리에서 밀려 나오는 거리. */
const ANSWER_SLIDE = 14;

/** 마디 하나의 자리. 장면은 좌표를 모르므로 여기서 셈한다 (S-piece). */
type Spot = { readonly x: number; readonly y: number };

/** 선반에 쌓인 조각 하나의 손잡이. DOM 만 담는다 — 뜻은 장면이 말한다. */
type ChipEl = { readonly g: SVGGElement; readonly slab: SVGRectElement };

/**
 * 그림의 밑감. 장면이 말하는 나무와 더미에서 매번 역산한다.
 *
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 이웃의 지금 좌표를
 * 읽으면 순회 순서가 곧 숨은 상태가 된다.
 */
type Layout = {
  readonly nodeW: number;
  readonly rowPitch: number;
  readonly chipW: number;
  readonly chipPitch: number;
  readonly columns: readonly number[];
  spot(id: string): Spot | undefined;
  colCenter(n: number): number;
  /** 더미의 `i` 번째 (0 이 바닥) 조각이 앉는 높이. */
  chipY(i: number): number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * 장면에서 자리를 셈한다.
 *
 * 잎을 왼쪽부터 한 자리씩 차지하게 하고 부모는 자식들의 가운데에 선다. 나무는
 * `n` 하나로 정해지므로 걸음이 흘러도 자리는 흔들리지 않는다 — 다 자란 나무를
 * 재고, 그중 돋은 것만 그린다.
 *
 * 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
 */
function layoutOf(scene: OverlappingSubproblemsScene): Layout {
  const calls = callsOf(scene);

  const kids = new Map<string, string[]>();
  for (const c of calls) {
    if (c.parentId === null) continue;
    const list = kids.get(c.parentId);
    if (list) list.push(c.id);
    else kids.set(c.parentId, [c.id]);
  }

  const slot = new Map<string, number>();
  let leafCount = 0;
  const assign = (id: string): number => {
    const children = kids.get(id) ?? [];
    if (children.length === 0) {
      const s = leafCount;
      leafCount += 1;
      slot.set(id, s);
      return s;
    }
    let sum = 0;
    for (const kid of children) sum += assign(kid);
    const s = sum / children.length;
    slot.set(id, s);
    return s;
  };
  const root = calls[0];
  if (root !== undefined) assign(root.id);

  let maxDepth = 0;
  for (const c of calls) if (c.depth > maxDepth) maxDepth = c.depth;

  const slotW = (W - SIDE * 2) / Math.max(1, leafCount);
  const nodeW = Math.max(30, Math.min(NODE_MAX_W, Math.round(slotW - 22)));
  const rowPitch =
    maxDepth > 0 ? Math.min(ROW_PITCH_MAX, (TREE_BOTTOM - TREE_TOP - NODE_H) / maxDepth) : 0;

  const spots = new Map<string, Spot>();
  for (const c of calls) {
    spots.set(c.id, {
      x: SIDE + slotW * ((slot.get(c.id) ?? 0) + 0.5),
      y: TREE_TOP + NODE_H / 2 + c.depth * rowPitch,
    });
  }

  // ── 선반. 칸도 조각 간격도 **다 자란** 나무를 보고 정한다 — 걸음마다 자라면
  // 이미 쌓인 더미가 눈앞에서 다시 배치된다.
  const columns = termColumns(scene);
  const colW = (W - SIDE * 2) / Math.max(1, columns.length);
  const chipW = Math.max(24, Math.min(nodeW, Math.round(colW - 26)));
  const tallest = tallestPile(scene);
  const chipPitch =
    tallest > 1
      ? Math.min(CHIP_PITCH_MAX, (SHELF_BASE - PILE_TOP - CHIP_H) / (tallest - 1))
      : CHIP_PITCH_MAX;

  return {
    nodeW,
    rowPitch,
    chipW,
    chipPitch,
    columns,
    spot: (id) => spots.get(id),
    colCenter: (n) => SIDE + colW * (columns.indexOf(n) + 0.5),
    chipY: (i) => SHELF_BASE - CHIP_H / 2 - i * chipPitch,
  };
}

export const overlappingSubproblemsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<OverlappingSubproblemsScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 레이어의 차례가 곧 겹치는 차례다. 레이어 자체는 다시 짓지 않고 속성도 걸지
    // 않는다 — 안에 든 것만 매번 새로 짓는다.
    const shelfLayer = el('g');
    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const chipLayer = el('g');
    const markLayer = el('g');
    const captionLayer = el('g');
    svg.append(shelfLayer, edgeLayer, nodeLayer, chipLayer, markLayer, captionLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const rafIds = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 마디를 매번 새로 짓지만 그 손잡이를 담는 `nodeEls` 는 **다시
     * 할당되는 클로저 변수**다. 옛 세대의 프레임이 그것을 읽으면 새 손잡이를 타고
     * 살아 있는 화면에 쓴다. 그래서 프레임마다 자기 세대를 확인하고 아니면 손대지
     * 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /**
     * t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다.
     *
     * **날것의 진행을 넘긴다.** 한 걸음 안에서 마디가 갈리므로 (가지 → 조각) 완급은
     * 마디마다 제 몫으로 먹인다.
     */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const startedAt = Date.now();
        let id = 0;
        const frame = (): void => {
          rafIds.delete(id);
          const raw = clamp01((Date.now() - startedAt) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          rafIds.add(id);
        };
        id = requestAnimationFrame(frame);
        rafIds.add(id);
      });
    }

    // ── 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다.
    let nodeEls = new Map<string, SVGGElement>();
    let edgeEls = new Map<string, SVGLineElement>();
    let chipEls = new Map<string, ChipEl>();
    let ruleEls = new Map<number, SVGLineElement>();
    let answerEl: SVGTextElement | null = null;

    function placeChip(chip: ChipEl, x: number, y: number, w: number, h: number): void {
      chip.g.setAttribute('transform', `translate(${x},${y})`);
      chip.slab.setAttribute('x', String(-w / 2));
      chip.slab.setAttribute('y', String(-h / 2));
      chip.slab.setAttribute('width', String(w));
      chip.slab.setAttribute('height', String(h));
      chip.slab.setAttribute('rx', String(Math.min(4, h / 2)));
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform ·
     * opacity · 보간 끝자리도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: OverlappingSubproblemsScene): void {
      const L = layoutOf(scene);
      shelfLayer.textContent = '';
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      chipLayer.textContent = '';
      markLayer.textContent = '';
      nodeEls = new Map<string, SVGGElement>();
      edgeEls = new Map<string, SVGLineElement>();
      chipEls = new Map<string, ChipEl>();
      ruleEls = new Map<number, SVGLineElement>();
      answerEl = null;

      const summary = summaryOf(scene);
      const { ordinals, heights } = sproutTally(scene);

      // ── 선반. 더미 높이는 장면이 세고, 가장 높은 더미의 표식은 셈이 난 뒤에만
      // 선다 — **머무는 강조**라 정적으로도 그린다.
      for (const n of L.columns) {
        const cx = L.colCenter(n);
        const worst = scene.concluded && n === summary.worstN;
        const rule = el('line', {
          x1: cx - L.chipW / 2 - 4,
          y1: SHELF_BASE + 1,
          x2: cx + L.chipW / 2 + 4,
          y2: SHELF_BASE + 1,
          stroke: worst ? c.itemComparing : c.border,
          'stroke-width': worst ? RULE_W_WORST : RULE_W_PLAIN,
          'stroke-linecap': 'round',
        });
        const label = el('text', {
          x: cx,
          y: SHELF_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': worst ? 700 : 400,
          fill: worst ? c.itemComparing : c.textMuted,
        });
        const count = heights.get(n) ?? 0;
        label.textContent = count > 0 ? `f(${n}) ×${count}` : `f(${n})`;
        shelfLayer.append(rule, label);
        ruleEls.set(n, rule);
      }

      // ── 가지 · 마디 · 조각. 셋 다 "몇 개가 돋았나" 하나에서 나온다.
      const sprouted = sproutedCalls(scene);
      for (let i = 0; i < sprouted.length; i += 1) {
        const call = sprouted[i];
        if (call === undefined) continue;
        const self = L.spot(call.id);
        if (self === undefined) continue;
        const ordinal = ordinals[i] ?? 1;
        const repeat = ordinal > 1;

        // 가지는 부모 자리와 자식 자리에서 파생된다. 전위 순서라 부모는 언제나
        // 먼저 서 있으므로 상수로 박아 둘 가지가 없다.
        const parent = call.parentId === null ? undefined : L.spot(call.parentId);
        if (parent !== undefined) {
          const edge = el('line', {
            x1: parent.x,
            y1: parent.y + NODE_H / 2,
            x2: self.x,
            y2: self.y - NODE_H / 2,
            stroke: c.border,
            'stroke-width': 1.2,
            'stroke-linecap': 'round',
          });
          edgeLayer.appendChild(edge);
          edgeEls.set(call.id, edge);
        }

        const group = el('g', { transform: `translate(${self.x},${self.y})` });
        group.appendChild(
          el('rect', {
            x: -L.nodeW / 2,
            y: -NODE_H / 2,
            width: L.nodeW,
            height: NODE_H,
            rx: 5,
            fill: repeat ? c.itemComparing : c.itemDefault,
            stroke: repeat ? c.itemComparing : c.border,
            'stroke-width': 1.3,
          }),
        );
        const name = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: repeat ? c.stateInk : c.text,
        });
        name.textContent = `f(${call.n})`;
        group.appendChild(name);

        // 몇 번째로 나타났는지는 그 자리에 **남는다.** 이 조각이 하는 말이 거기 있다.
        const bx = L.nodeW / 2 - 2;
        const by = -NODE_H / 2 + 2;
        group.appendChild(
          el('circle', {
            cx: bx,
            cy: by,
            r: 8.5,
            fill: c.bg,
            stroke: repeat ? c.itemComparing : c.border,
            'stroke-width': 1.2,
          }),
        );
        const badge = el('text', {
          x: bx,
          y: by,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: repeat ? c.text : c.textMuted,
        });
        badge.textContent = String(ordinal);
        group.appendChild(badge);
        nodeLayer.appendChild(group);
        nodeEls.set(call.id, group);

        // 선반의 조각. 더미 안의 자리는 그 항의 등장 차례가 곧 말한다.
        const chipG = el('g');
        const slab = el('rect', {
          rx: 4,
          fill: repeat ? c.itemComparing : c.itemDefault,
          stroke: repeat ? c.itemComparing : c.border,
          'stroke-width': 1.1,
        });
        chipG.appendChild(slab);
        chipLayer.appendChild(chipG);
        const chip: ChipEl = { g: chipG, slab };
        placeChip(chip, L.colCenter(call.n), L.chipY(ordinal - 1), L.chipW, CHIP_H);
        chipEls.set(call.id, chip);
      }

      // ── 얻어 낸 답. 셈이 난 뒤에만 선다.
      if (scene.concluded) {
        const rootCall = callsOf(scene)[0];
        const rootSpot = rootCall === undefined ? undefined : L.spot(rootCall.id);
        if (rootSpot !== undefined) {
          const answer = el('text', {
            x: rootSpot.x + L.nodeW / 2 + 18,
            y: rootSpot.y,
            'text-anchor': 'start',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: c.text,
          });
          answer.textContent = `= ${summary.value}`;
          markLayer.appendChild(answer);
          answerEl = answer;
        }
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: OverlappingSubproblemsScene): string {
      const mark = scene.mark;
      if (mark === null) return '';
      if (mark.kind === 'settle') {
        const s = summaryOf(scene);
        return tr(
          'caption.summary',
          '{calls} calls to reach {value}, yet only {distinct} different terms — f({worst}) alone was solved {count} times',
          {
            calls: s.calls,
            value: s.value,
            distinct: s.distinct,
            worst: s.worstN,
            count: s.worstCount,
          },
        );
      }
      const last = lastSprout(scene);
      if (last === null) return '';
      return last.ordinal > 1
        ? tr('caption.repeatTerm', 'f({n}) turns up again — that is {count} times now', {
            n: last.call.n,
            count: last.ordinal,
          })
        : tr('caption.newTerm', 'f({n}) — solving this term for the first time', {
            n: last.call.n,
          });
    }

    function drawCaption(scene: OverlappingSubproblemsScene): void {
      captionLayer.textContent = '';
      const text = captionTextOf(scene);
      if (text === '') return;
      const node = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      node.textContent = text;
      captionLayer.appendChild(node);
    }

    /**
     * 마디 하나가 돋는다.
     *
     * 가지가 부모에게서 뻗어 내려가고 마디가 그 끝에 앉는다. 뒤이어 같은 항의
     * 복제가 마디에서 떨어져 나와 호를 그리며 선반으로 날아가 더미 위에 얹힌다.
     *
     * 출발 자리는 `prev` 가 아니라 장면이 말한다 (S-scene) — 부모의 자리도 더미
     * 안의 자리도 `layoutOf` 에서 나온다. 뿌리는 부모가 없으므로 한 층 위에서
     * 내려온다.
     *
     * **한 뜻으로 묶인 운동이라 한 목록, 한 시계로 흐른다.**
     */
    function flowSprout(scene: OverlappingSubproblemsScene, mine: number): Promise<void> {
      const last = lastSprout(scene);
      if (last === null) return Promise.resolve();
      const L = layoutOf(scene);
      const self = L.spot(last.call.id);
      if (self === undefined) return Promise.resolve();

      const group = nodeEls.get(last.call.id);
      const edge = edgeEls.get(last.call.id);
      const chip = chipEls.get(last.call.id);
      const parent = last.call.parentId === null ? undefined : L.spot(last.call.parentId);

      const fromX = parent ? parent.x : self.x;
      const fromY = parent ? parent.y : self.y - Math.max(L.rowPitch, ROW_PITCH_MAX);
      const chipX = L.colCenter(last.call.n);
      const chipY = L.chipY(last.ordinal - 1);

      const draw = (raw: number): void => {
        const b = easeOut(clamp01(raw / BRANCH_END));

        if (edge !== undefined && parent !== undefined) {
          edge.setAttribute('x2', String(lerp(parent.x, self.x, b)));
          edge.setAttribute('y2', String(lerp(parent.y + NODE_H / 2, self.y - NODE_H / 2, b)));
        }
        if (group !== undefined) {
          group.setAttribute(
            'transform',
            `translate(${lerp(fromX, self.x, b)},${lerp(fromY, self.y, b)})`,
          );
          group.setAttribute('opacity', String(Math.min(1, b * 3)));
        }
        if (chip !== undefined) {
          const p = easeOut(clamp01((raw - CHIP_START) / (1 - CHIP_START)));
          const x = lerp(self.x, chipX, p);
          const y = lerp(self.y, chipY, p) - CHIP_ARC * 4 * p * (1 - p);
          placeChip(chip, x, y, lerp(L.nodeW, L.chipW, p), lerp(NODE_H, CHIP_H, p));
        }
      };

      // 끝 자리에 선 것을 옛 자리로 물려 놓고 출발한다.
      draw(0);
      return tween(SPROUT_MS, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    /**
     * 셈이 난다.
     *
     * 가장 높은 더미가 **아래에서 위로 훑어 올라가며** 한 번 부풀고, 그 끝에서
     * 뿌리 옆에 답이 밀려 나와 앉는다. 이 걸음 뒤에는 `stepMs` 가 더해지지 않으므로
     * 운동 자체가 그 걸음의 벽시계다 (S-piece 얇은 걸음).
     *
     * 명령형 stage 에서는 이 걸음이 속성 몇 개를 즉시 덮어쓰고 끝나 **운동이
     * 하나도 없었다.**
     */
    function flowSettle(scene: OverlappingSubproblemsScene, mine: number): Promise<void> {
      const L = layoutOf(scene);
      const summary = summaryOf(scene);
      const { ordinals } = sproutTally(scene);
      const sprouted = sproutedCalls(scene);

      // 가장 높은 더미의 조각들 — 바닥부터 차례로.
      const pile: { chip: ChipEl; index: number }[] = [];
      for (let i = 0; i < sprouted.length; i += 1) {
        const call = sprouted[i];
        if (call === undefined || call.n !== summary.worstN) continue;
        const chip = chipEls.get(call.id);
        if (chip === undefined) continue;
        pile.push({ chip, index: (ordinals[i] ?? 1) - 1 });
      }
      pile.sort((a, b) => a.index - b.index);

      const rule = ruleEls.get(summary.worstN);
      const rootCall = callsOf(scene)[0];
      const rootSpot = rootCall === undefined ? undefined : L.spot(rootCall.id);
      const answerX = rootSpot === undefined ? 0 : rootSpot.x + L.nodeW / 2 + 18;

      const span = Math.max(0.001, 1 - SETTLE_STAGGER * Math.max(0, pile.length - 1));
      const cx = L.colCenter(summary.worstN);

      const draw = (raw: number): void => {
        for (const { chip, index } of pile) {
          const lp = clamp01((raw - SETTLE_STAGGER * index) / span);
          const s = Math.sin(lp * Math.PI);
          placeChip(
            chip,
            cx,
            L.chipY(index) - SETTLE_LIFT * s,
            L.chipW + SETTLE_BULGE * s,
            CHIP_H,
          );
        }
        if (rule !== undefined) {
          const e = easeOut(clamp01(raw / 0.35));
          rule.setAttribute('stroke-width', String(lerp(RULE_W_PLAIN, RULE_W_WORST, e)));
        }
        if (answerEl !== null) {
          const e = easeOut(clamp01((raw - ANSWER_START) / (1 - ANSWER_START)));
          answerEl.setAttribute('x', String(answerX - ANSWER_SLIDE * (1 - e)));
          answerEl.setAttribute('opacity', String(e));
        }
      };

      draw(0);
      return tween(SETTLE_MS * (1 + SETTLE_STAGGER * pile.length), (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    function flow(
      scene: OverlappingSubproblemsScene,
      mark: OverlappingSubproblemsMark,
      mine: number,
    ): Promise<void> {
      switch (mark.kind) {
        case 'sprout':
          return flowSprout(scene, mine);
        case 'settle':
          return flowSettle(scene, mine);
      }
    }

    async function render(
      next: OverlappingSubproblemsScene,
      /** 출발 자리를 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: OverlappingSubproblemsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const mark = next.mark;
      if (mark === null) return;
      await flow(next, mark, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리와 opacity 를 통째로 거둔다. 되돌릴 목록을 손으로
      // 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafIds) cancelAnimationFrame(id);
        }
        rafIds.clear();
        // 걸어 둔 프레임을 거두면 그 tick 은 아예 불리지 않으므로, 기다리던
        // promise 를 여기서 직접 깨운다 (S-piece).
        for (const done of [...pending]) done();
        pending.clear();
        nodeEls.clear();
        edgeEls.clear();
        chipEls.clear();
        ruleEls.clear();
        answerEl = null;
        svg.textContent = '';
      },
    };
  },
};
