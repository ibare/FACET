/**
 * prune-branch-stage — 가지가 돋다 마는 자리를 그린다.
 *
 * 장면(`scene.ts`)을 받아 화면을 **통째로** 세운다. 걸음마다 부르는 메서드는 없다 —
 * 그 메서드들이 곧 되돌릴 수 없는 명령이었다 (S-scene).
 *
 * ── 무엇이 화면에 있는가
 *
 * 1. **유령 나무** — 다 뻗었을 때의 결정나무 전체(31 자리)를 옅은 점선으로 깔아
 *    둔다. 안 그린 것이 몇인지는 이것과 견주어야만 보이므로 끝까지 지우지 않는다.
 *    열린 자리의 유령은 **짓지 않는다** — 숨기는 것이 아니라 없는 것이다.
 * 2. **뻗은 가지** — 열린 자리마다 부모에서 선이 나와 그 끝에 자리가 선다.
 *    걸음일 때는 그 선이 **실제로 자라 나오고**(`x2`/`y2` 가 움직인다) 자리가
 *    부풀어 나타난다. 페이드인이 아니다.
 * 3. **닫힌 자리** — 합이 목표를 넘은 자리는 붉게 굳고 아래에 뚜껑이 덮인다.
 *    그 아래 유령 영역에는 옅은 색지가 깔린다. 셋 다 **정적 그리기**에 있으므로
 *    다 끝난 화면에도, 되짚은 화면에도 그대로 남는다 — 무엇을 아꼈는지가 화면에
 *    없으면 이 조각은 아무 말도 하지 않은 것이 된다.
 * 4. **셈판** — 연 자리 / 안 연 자리. 두 수 다 장면의 구조에서 셈해진다.
 *
 * ── 세로도 장면이 정한다
 *
 * `init()` 이 사라졌으므로 층 수에 따라 달라지는 것 — 층 간격 · 자리 반지름 ·
 * 캡션 자리 · 캔버스 세로 — 을 정적 그리기가 매번 다시 정한다. mount 때 한 번
 * 재고 마는 값을 남겨 두면 첫 그림이 기본 높이로 눌린다.
 *
 * 색은 전부 design-tokens 경유 — 상태(itemActive) · 심각도(danger) ·
 * 강조(itemPivot) · 영역(subtreeShadeLeft) · 특수(ghostOutline) (S-view 결정 트리).
 * 색판(`categorical`)을 쓰지 않으므로 드러난 수에 따라 씨앗이 자라는 결함은 없다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  activeId,
  activeRow,
  allSpotIds,
  answerId,
  belowCount,
  depthOf,
  lineageOf,
  levelOf,
  openedCount,
  openedIds,
  parentOf,
  pickedAt,
  prunedIds,
  skippedCount,
  sumAt,
  valueAt,
  type BranchVerdict,
  type PruneBranchScene,
  type PruneBranchStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 첫 껍데기의 세로. 실제 값은 층 수에서 역산해 매번 다시 정한다. */
const CANVAS_H0 = 372;

/** 잎 한 칸의 최대 너비. 상한만 두고 실제 값은 캔버스에서 역산한다 (S-piece). */
const LEAF_PITCH_MAX = 34;
/** 왼쪽 홈통에 층 라벨(그 층에서 정하는 수)이 들어갈 만큼은 남긴다. */
const SIDE_MIN = 30;

const TOP_Y = 68;
const LEVEL_GAP = 54;
/** 나무 아래 끝과 캡션 첫 줄 사이. */
const CAPTION_GAP = 20;
const CAPTION_LINE_H = 18;
const CAPTION_MAX_LINES = 3;
const CAPTION_SIDE = 22;
/** 마지막 줄 아래로 남기는 여백. */
const CAPTION_TAIL = 14;
/** 줄바꿈 자리를 재는 데 쓰는 캡션 글자 크기. 토큰이 단일출처다 (S-view). */
const CAPTION_FONT_PX = Number.parseInt(fontSizes.md, 10);

const TALLY_X = 16;
const TALLY_Y1 = 22;
const TALLY_Y2 = 42;

const GHOST_DIM = 0.5;
/** 다 돌고 나면 끝내 안 연 자리만 남는다. 그것들은 짙어진 채로 머문다. */
const GHOST_LIT = 0.8;
const ROW_DIM = 0.45;
/** 층 라벨이 처음 들어설 때 위에서 내려앉는 거리. */
const ROW_DROP = 8;

// 걸음 하나 = 이 애니메이션 + algorithm 의 stepMs 배수. 열일곱 걸음이라
// 지속시간을 넉넉히 잡으면 총 길이가 금세 스무 초가 된다 (S-piece).
const EDGE_MS = 140;
const POP_MS = 70;
const VERDICT_MS = 110;
/** 뚜껑 · 색지 · 셈판이 **한 시계**로 돈다. 시계를 나누면 lockstep 이 우연이 된다. */
const CLOSE_MS = 240;
/** 그 시계 안에서 뚜껑이 다 펴지는 자리. */
const CAP_PART = 0.45;
const TRACE_MS = 380;
/**
 * 문제가 서는 걸음.
 *
 * 목표 딱지만 두드리면 220ms 뿐이라 걸음 벽시계가 800ms 아래로 떨어졌다. 고를
 * 수들이 홈통에 **내려앉는** 운동을 함께 얹는다 — "이 수들 가운데 고른다" 와 같은
 * 동사이고, 처음 뜨는 것이라 앉는 꼴이 맞다 (S-piece 얇은 걸음).
 */
const TASK_MS = 300;
/** 끝내 안 연 자리를 한 번에 짚는 걸음. */
const FINISH_MS = 300;

type Spot = { x: number; y: number; level: number; start: number; width: number };

/**
 * 층 수 하나에서 풀리는 기하 전부.
 *
 * **그리기 전에 한 번에 셈한다.** 그리면서 이웃의 지금 좌표를 읽으면 순회 순서가
 * 곧 숨은 상태가 된다.
 */
type Layout = {
  depth: number;
  pitch: number;
  originX: number;
  nodeR: number;
  spots: Map<string, Spot>;
  /** 나무의 아래 끝. 색지가 여기까지 깔린다. */
  treeBottom: number;
  captionY: number;
  height: number;
  rowLabelX: number;
};

/**
 * 방금 세운 화면의 손잡이들.
 *
 * 모듈 스코프에 두지 않고 정적 그리기가 **돌려준다.** 손잡이를 클로저 변수에 담아
 * 두면 정적 그리기가 재할당한 뒤에도 옛 세대의 걸음 함수가 그것을 타고 살아 있는
 * 화면에 쓴다 (S-scene). 여기서는 그 걸음 함수가 자기 호출에서 받은 것만 만진다.
 */
type Drawn = {
  layout: Layout;
  ghosts: Map<string, SVGCircleElement>;
  nodes: Map<string, { circle: SVGCircleElement; label: SVGTextElement }>;
  edges: Map<string, SVGLineElement>;
  caps: Map<string, SVGRectElement>;
  shades: Map<string, SVGRectElement>;
  trace: { line: SVGPolylineElement; length: number } | null;
  rowLabels: SVGTextElement[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 한글·전각은 거의 1em, 그 밖은 대략 0.53em 로 잡는다. 줄바꿈 자리를 정하는 데만 쓴다. */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x1100 && code <= 0xff60 ? size * 0.98 : size * 0.53;
  }
  return w;
}

function wrapText(s: string, size: number, maxW: number, maxLines: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cand = cur === '' ? word : `${cur} ${word}`;
    if (cur !== '' && textWidth(cand, size) > maxW) {
      lines.push(cur);
      if (lines.length === maxLines - 1) {
        // 마지막 줄에는 남은 것을 다 담는다 — 잘라 버리면 문장이 거짓이 된다.
        lines.push(words.slice(i).join(' '));
        return lines;
      }
      cur = word;
    } else {
      cur = cand;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 한 점을 붙박아 두고 부풀린다. 딱지가 제자리에서 두드려지게. */
function popAbout(x: number, y: number, s: number): string {
  return `translate(${x * (1 - s)} ${y * (1 - s)}) scale(${s})`;
}

/** 층 수 하나에서 기하를 통째로 셈한다. 좌표가 장면에 없는 까닭이다 (S-piece). */
function layoutOf(scene: PruneBranchScene): Layout {
  const depth = depthOf(scene);
  const leafCount = 2 ** depth;
  const pitch = Math.min(LEAF_PITCH_MAX, Math.floor((W - SIDE_MIN * 2) / leafCount));
  const treeW = leafCount * pitch;
  const originX = Math.round((W - treeW) / 2);
  const nodeR = Math.max(8, Math.min(12, Math.floor(pitch * 0.38)));

  const spots = new Map<string, Spot>();
  for (const id of allSpotIds(depth)) {
    const path = id.slice(1);
    let start = 0;
    let width = leafCount;
    for (const ch of path) {
      width /= 2;
      if (ch === '0') start += width;
    }
    spots.set(id, {
      x: originX + (start + width / 2) * pitch,
      y: TOP_Y + path.length * LEVEL_GAP,
      level: path.length,
      start,
      width,
    });
  }

  const treeBottom = TOP_Y + depth * LEVEL_GAP + nodeR + 6;
  const captionY = treeBottom + CAPTION_GAP;
  return {
    depth,
    pitch,
    originX,
    nodeR,
    spots,
    treeBottom,
    captionY,
    height: captionY + (CAPTION_MAX_LINES - 1) * CAPTION_LINE_H + CAPTION_TAIL,
    rowLabelX: Math.round(originX / 2),
  };
}

export const pruneBranchStageView: CanvasView = {
  canvas: { height: CANVAS_H0 },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    const cancelRaf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 운동이 끝난 뒤 장면을 통째로 다시 세우는 길이 있어 **살아 있는 화면에 쓰는
     * 손**이 남는다. 되짚기가 그 사이에 끼어들면 옛 세대의 마무리가 새로 선 화면을
     * 덮으므로, `await` 를 지난 뒤에는 자기 세대를 확인하고 아니면 화면에 손대지
     * 않고 물러난다. `isInstant` 나 `onScrubStart` 는 장면 조각에서 러너가 부르지
     * 않으므로 빗장이 되지 못한다 (S-scene).
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function now(): number {
      return typeof performance === 'object' ? performance.now() : Date.now();
    }

    /**
     * t=0..1 프레임마다 `onFrame` 을 부르는 rAF 트윈. 이 조각의 유일한 시계다.
     *
     * **`destroy` 가 기다리던 Promise 를 반드시 푼다.** 프레임만 거두면 다음 틱이
     * 오지 않아 `render` 의 Promise 가 영영 안 풀리고, 걸음의 끝을 기다리던 바깥이
     * 그 자리에 멎는다 (S-piece MUST).
     */
    function tween(durMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || raf === null) {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const started = now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          const t = Math.min(1, (now() - started) / durMs);
          onFrame(t);
          if (t >= 1 || destroyed) {
            done();
            return;
          }
          id = raf(tick);
          frames.add(id);
        };
        id = raf(tick);
        frames.add(id);
      });
    }

    // ── 껍데기. 층은 한 번 만들고 자식만 매번 다시 짓는다.
    const root = el('g', {});
    svg.appendChild(root);

    const shadeLayer = el('g', {});
    const ghostEdgeLayer = el('g', {});
    const ghostNodeLayer = el('g', {});
    const liveEdgeLayer = el('g', {});
    const traceLayer = el('g', {});
    const liveNodeLayer = el('g', {});
    const capLayer = el('g', {});
    const rowLayer = el('g', {});
    const chromeLayer = el('g', {});
    const rebuilt = [
      shadeLayer, ghostEdgeLayer, ghostNodeLayer, liveEdgeLayer,
      traceLayer, liveNodeLayer, capLayer, rowLayer,
    ];
    for (const layer of [...rebuilt, chromeLayer]) root.appendChild(layer);

    // ── 재건 밖 요소. 정적 경로가 속성을 **매번 명시로** 쓴다 (S-scene).
    const openedText = el('text', {
      x: TALLY_X, y: TALLY_Y1, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const skippedText = el('text', {
      x: TALLY_X, y: TALLY_Y2, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const targetText = el('text', {
      x: W - TALLY_X, y: TALLY_Y1, fill: c.text, 'text-anchor': 'end',
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const legendText = el('text', {
      x: W / 2, y: TALLY_Y2, fill: c.textMuted, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.xs,
    });
    legendText.textContent = tr(
      'label.branchKey',
      'left branch = put it in · right branch = leave it out',
    );
    const captionLines: SVGTextElement[] = [];
    for (let i = 0; i < CAPTION_MAX_LINES; i++) {
      captionLines.push(el('text', {
        x: W / 2, y: 0, fill: c.text, 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.md,
      }));
    }
    for (const t of [openedText, skippedText, targetText, legendText, ...captionLines]) {
      chromeLayer.appendChild(t);
    }

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function styleOf(verdict: BranchVerdict, active: boolean): {
      fill: string; stroke: string; ink: string; width: number;
    } {
      if (active) return { fill: c.itemActive, stroke: c.text, ink: c.stateInk, width: 2 };
      switch (verdict) {
        case 'cut': return { fill: c.danger, stroke: c.danger, ink: c.stateInk, width: 2 };
        case 'answer': return { fill: c.itemPivot, stroke: c.text, ink: c.stateInk, width: 2 };
        case 'dead': return { fill: c.itemDefault, stroke: c.border, ink: c.textMuted, width: 1.5 };
        default: return { fill: c.itemDefault, stroke: c.text, ink: c.text, width: 1.5 };
      }
    }

    function paint(
      node: { circle: SVGCircleElement; label: SVGTextElement },
      verdict: BranchVerdict,
      active: boolean,
    ): void {
      const s = styleOf(verdict, active);
      node.circle.setAttribute('fill', s.fill);
      node.circle.setAttribute('stroke', s.stroke);
      node.circle.setAttribute('stroke-width', String(s.width));
      node.label.setAttribute('fill', s.ink);
    }

    // ── 문안. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10).
    //
    // 수는 하나도 캡션에서 오지 않는다 — 합도 층도 자리 수도 화면이 그리는 구조를
    // 지난 것이라, 캡션의 수와 그림이 갈릴 자리가 없다.
    function captionTextOf(scene: PruneBranchScene): string {
      const cap = scene.caption;
      if (cap === null) return '';
      const step = scene.step;
      const id = step !== null && step.kind === 'spot' ? step.id : null;

      switch (cap.kind) {
        case 'task':
          return tr(
            'caption.task',
            'Pick from {list} and make the sum come out exactly — the target is {target}.',
            { list: scene.values.join(', '), target: scene.target },
          );
        case 'start':
          return tr('caption.start', 'Nothing chosen yet. The running sum is {sum}.', {
            sum: id === null ? 0 : sumAt(scene, id),
          });
        case 'take':
          if (id === null) return '';
          return tr('caption.take', 'Put {value} in — the running sum is now {sum}.', {
            value: valueAt(scene, id) ?? 0,
            sum: sumAt(scene, id),
          });
        case 'skip':
          if (id === null) return '';
          return tr('caption.skip', 'Leave {value} out — the running sum stays {sum}.', {
            value: valueAt(scene, id) ?? 0,
            sum: sumAt(scene, id),
          });
        case 'cut':
          if (id === null) return '';
          return tr(
            'caption.cut',
            'The running sum is already over: {sum} > {target}. Nothing below can bring it back down, so the {below} spots under this one never open.',
            { sum: sumAt(scene, id), target: scene.target, below: belowCount(scene, id) },
          );
        case 'cutLeaf':
          if (id === null) return '';
          return tr(
            'caption.cutLeaf',
            'Over again: {sum} > {target}. This spot closes too — on the last row there was nothing left underneath to skip.',
            { sum: sumAt(scene, id), target: scene.target },
          );
        case 'dead':
          if (id === null) return '';
          return tr('caption.dead', 'All {count} decided, and {sum} is not {target}. Nothing here.', {
            count: levelOf(id),
            sum: sumAt(scene, id),
            target: scene.target,
          });
        case 'answer':
          if (id === null) return '';
          return tr('caption.answer', '{list} — the sum is exactly {target}.', {
            list: pickedAt(scene, id).join(' + '),
            target: scene.target,
          });
        default:
          return tr(
            'caption.done',
            '{opened} spots opened, {skipped} never touched — and not one answer was lost. Below a sum that is already over, no answer can exist.',
            {
              opened: openedCount(scene),
              skipped: skippedCount(scene),
              target: scene.target,
            },
          );
      }
    }

    // ── 정적 그리기. 이 장면이 말하는 것을 **전부** 세운다 (S-scene).

    function drawStatic(scene: PruneBranchScene): Drawn {
      const L = layoutOf(scene);
      svg.setAttribute('viewBox', `0 0 ${W} ${L.height}`);
      for (const layer of rebuilt) clearLayer(layer);

      const opened = openedIds(scene);
      // 닫힌 자리 아래 — 캡션의 `{below}` 도 셈판의 수도 같은 함수를 지난다.
      const pruned = prunedIds(scene);
      const active = activeId(scene);
      const row = activeRow(scene);

      const ghosts = new Map<string, SVGCircleElement>();
      const nodes = new Map<string, { circle: SVGCircleElement; label: SVGTextElement }>();
      const edges = new Map<string, SVGLineElement>();
      const caps = new Map<string, SVGRectElement>();
      const shades = new Map<string, SVGRectElement>();

      // 1. 유령 — 다 뻗었을 때의 나무 가운데 **아직 열지 않은** 자리.
      //    다 돌고 나면 남은 것이 곧 끝내 안 연 자리라 짙어진 채로 머문다.
      for (const id of allSpotIds(L.depth)) {
        if (opened.has(id)) continue;
        const g = L.spots.get(id);
        if (g === undefined) continue;
        const pid = parentOf(id);
        const p = pid === null ? undefined : L.spots.get(pid);
        if (p !== undefined) {
          ghostEdgeLayer.appendChild(el('line', {
            x1: p.x, y1: p.y + L.nodeR, x2: g.x, y2: g.y - L.nodeR,
            stroke: c.ghostOutline, 'stroke-width': 1,
            'stroke-dasharray': '3 3', opacity: GHOST_DIM,
          }));
        }
        const circle = el('circle', {
          cx: g.x, cy: g.y, r: L.nodeR, fill: 'none',
          stroke: c.ghostOutline, 'stroke-width': 1, 'stroke-dasharray': '3 3',
          opacity: scene.finished && pruned.has(id) ? GHOST_LIT : GHOST_DIM,
        });
        ghostNodeLayer.appendChild(circle);
        ghosts.set(id, circle);
      }

      // 2. 열린 자리 — 뻗은 가지 · 자리 · 닫힌 자리의 뚜껑과 색지.
      //    닫힘의 표식 셋이 전부 여기 있다. 되짚어도 지워지지 않는 까닭이다.
      for (const spot of scene.opened) {
        const g = L.spots.get(spot.id);
        if (g === undefined) continue;

        const pid = parentOf(spot.id);
        const p = pid === null ? undefined : L.spots.get(pid);
        if (p !== undefined) {
          const line = el('line', {
            x1: p.x, y1: p.y + L.nodeR, x2: g.x, y2: g.y - L.nodeR,
            stroke: c.text, 'stroke-width': 1.6, 'stroke-linecap': 'round',
          });
          liveEdgeLayer.appendChild(line);
          edges.set(spot.id, line);
        }

        const circle = el('circle', { cx: g.x, cy: g.y, r: L.nodeR });
        const label = el('text', {
          x: g.x, y: g.y + 4, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
        });
        label.textContent = String(sumAt(scene, spot.id));
        liveNodeLayer.appendChild(circle);
        liveNodeLayer.appendChild(label);
        const node = { circle, label };
        nodes.set(spot.id, node);
        paint(node, spot.verdict, spot.id === active);

        if (spot.verdict !== 'cut') continue;

        const capW = L.nodeR * 1.9;
        const bar = el('rect', {
          x: g.x - capW / 2, y: g.y + L.nodeR + 4, width: capW, height: 4, rx: 2, fill: c.danger,
        });
        capLayer.appendChild(bar);
        caps.set(spot.id, bar);

        // 마지막 층에서 닫히면 아래에 자리가 없다. 없는 것은 숨기지 말고 짓지 않는다.
        if (g.level >= L.depth) continue;
        const yTop = g.y + LEVEL_GAP / 2;
        const rect = el('rect', {
          x: L.originX + g.start * L.pitch, y: yTop,
          width: g.width * L.pitch, height: L.treeBottom - yTop,
          rx: 6, fill: c.subtreeShadeLeft,
        });
        shadeLayer.appendChild(rect);
        shades.set(spot.id, rect);
      }

      // 3. 답까지의 길 — 뿌리에서 그 자리까지. 답을 만난 뒤로 계속 남는다.
      let trace: Drawn['trace'] = null;
      const aid = answerId(scene);
      if (aid !== null) {
        const points: Array<[number, number]> = [];
        for (const id of lineageOf(aid)) {
          const g = L.spots.get(id);
          if (g !== undefined) points.push([g.x, g.y]);
        }
        if (points.length >= 2) {
          let total = 0;
          for (let i = 1; i < points.length; i++) {
            total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
          }
          const line = el('polyline', {
            points: points.map(([x, y]) => `${x},${y}`).join(' '),
            fill: 'none', stroke: c.accent, 'stroke-width': 3, 'stroke-linecap': 'round',
          });
          traceLayer.appendChild(line);
          trace = { line, length: total };
        }
      }

      // 4. 홈통의 층 라벨 — 그 층의 가지들이 정하는 수. 숫자 표식이라 키를 두지 않는다.
      //    문제가 서기 전에는 아직 없는 것이므로 짓지 않는다.
      const rowLabels: SVGTextElement[] = [];
      if (scene.taskShown) {
        for (let k = 0; k < L.depth; k++) {
          const label = el('text', {
            x: L.rowLabelX, y: TOP_Y + k * LEVEL_GAP + LEVEL_GAP / 2 + 4,
            fill: k === row ? c.text : c.textMuted, 'text-anchor': 'middle',
            opacity: k === row ? 1 : ROW_DIM,
            'font-family': fonts.mono, 'font-size': fontSizes.sm,
          });
          label.textContent = String(scene.values[k] ?? '');
          rowLayer.appendChild(label);
          rowLabels.push(label);
        }
      }

      // 5. 재건 밖 요소 — 속성을 매번 명시로 쓴다. 운동이 남긴 `transform` 을
      //    여기서 통째로 거두므로 되돌릴 목록을 손으로 관리하지 않는다.
      openedText.textContent = tr('label.opened', 'opened {n}', { n: openedCount(scene) });
      skippedText.textContent = tr('label.skipped', 'never opened {n}', { n: skippedCount(scene) });
      skippedText.removeAttribute('transform');
      targetText.textContent = scene.taskShown
        ? tr('label.target', 'target = {n}', { n: scene.target })
        : '';
      targetText.removeAttribute('transform');

      const text = captionTextOf(scene);
      const lines = text === ''
        ? []
        : wrapText(text, CAPTION_FONT_PX, W - CAPTION_SIDE * 2, CAPTION_MAX_LINES);
      captionLines.forEach((node, i) => {
        node.setAttribute('y', String(L.captionY + i * CAPTION_LINE_H));
        node.textContent = lines[i] ?? '';
      });

      return { layout: L, ghosts, nodes, edges, caps, shades, trace, rowLabels };
    }

    // ── 흐르게 하기. 요소는 이미 끝 자리에 서 있으므로 **아직 못 온 만큼을 뒤로
    //    물려** 두고 앞으로 흐른다. 물림은 첫 프레임 전에 곧바로 박는다.

    /** 문제가 선다 — 목표 딱지가 두드려지고 고를 수들이 홈통에 내려앉는다. */
    function flowTask(d: Drawn): Promise<void> {
      const labels = d.rowLabels;
      const lag = 0.35;
      const span = 1 / (1 + lag * Math.max(0, labels.length - 1));
      for (const label of labels) {
        label.setAttribute('opacity', '0');
        label.setAttribute('transform', `translate(0 ${-ROW_DROP})`);
      }
      return tween(TASK_MS, (t) => {
        labels.forEach((label, k) => {
          const e = easeOut(clamp01((t - k * lag * span) / span));
          label.setAttribute('opacity', String(ROW_DIM * e));
          label.setAttribute('transform', `translate(0 ${ROW_DROP * (e - 1)})`);
        });
        const s = 1 + 0.3 * Math.sin(Math.PI * t);
        targetText.setAttribute('transform', popAbout(W - TALLY_X, TALLY_Y1, s));
      });
    }

    /**
     * 다 돌았다. 끝내 안 연 자리들이 한 번에 부풀었다 짙어진다.
     *
     * 짚을 자리를 걸음에서 받지 않고 **장면에서 찾는다** — `prunedIds` 는 셈판의
     * 수를 내는 것과 같은 함수다.
     */
    function flowFinish(scene: PruneBranchScene, d: Drawn): Promise<void> {
      const { nodeR } = d.layout;
      const left: SVGCircleElement[] = [];
      for (const id of prunedIds(scene)) {
        const ghost = d.ghosts.get(id);
        if (ghost !== undefined) left.push(ghost);
      }
      for (const ghost of left) ghost.setAttribute('opacity', String(GHOST_DIM));
      return tween(FINISH_MS, (t) => {
        const pulse = Math.sin(Math.PI * t);
        for (const ghost of left) {
          ghost.setAttribute('r', String(nodeR * (1 + 0.24 * pulse)));
          ghost.setAttribute('opacity', String(GHOST_DIM + (GHOST_LIT - GHOST_DIM) * t));
        }
      });
    }

    /** 가지가 한 자리까지 뻗고, 그 자리가 판정을 받는다. */
    async function flowSpot(
      scene: PruneBranchScene,
      step: Extract<PruneBranchStep, { kind: 'spot' }>,
      d: Drawn,
      my: number,
    ): Promise<void> {
      const L = d.layout;
      const g = L.spots.get(step.id);
      const node = d.nodes.get(step.id);
      if (g === undefined || node === undefined) return;

      const edge = d.edges.get(step.id);
      const pid = parentOf(step.id);
      const parent = pid === null ? undefined : L.spots.get(pid);
      const settled = step.verdict === 'cut' || step.verdict === 'answer';

      // 물림을 먼저 박는다. 안 박으면 첫 프레임에 끝 자리가 번쩍인다.
      if (edge !== undefined && parent !== undefined) {
        edge.setAttribute('x2', String(parent.x));
        edge.setAttribute('y2', String(parent.y + L.nodeR));
      }
      node.circle.setAttribute('r', '0');
      node.label.setAttribute('opacity', '0');
      // 판정이 난 자리도 **재고 나서** 굳는다. 곧바로 판정색이면 그 사이가 없어진다.
      if (settled) paint(node, step.verdict, true);
      const cap = d.caps.get(step.id);
      if (cap !== undefined) {
        cap.setAttribute('x', String(g.x));
        cap.setAttribute('width', '0');
      }
      const shade = d.shades.get(step.id);
      if (shade !== undefined) shade.setAttribute('height', '0');
      const trace = step.verdict === 'answer' ? d.trace : null;
      if (trace !== null) {
        trace.line.setAttribute('stroke-dasharray', String(trace.length));
        trace.line.setAttribute('stroke-dashoffset', String(trace.length));
      }

      if (edge !== undefined && parent !== undefined) {
        const x1 = parent.x;
        const y1 = parent.y + L.nodeR;
        const x2 = g.x;
        const y2 = g.y - L.nodeR;
        await tween(EDGE_MS, (t) => {
          const e = easeOut(t);
          edge.setAttribute('x2', String(x1 + (x2 - x1) * e));
          edge.setAttribute('y2', String(y1 + (y2 - y1) * e));
        });
        if (!alive(my)) return;
      }

      await tween(POP_MS, (t) => {
        const e = easeOut(t);
        node.circle.setAttribute('r', String(L.nodeR * e));
        node.label.setAttribute('opacity', String(e));
      });
      if (!alive(my)) return;

      if (settled) {
        // 판정이 자리를 채운다 — 판정색 원반이 가운데에서 자라 자리를 덮는다.
        // 색만 갈아 끼우면 깜빡임으로 읽혀 "재고 나서 정했다" 가 사라진다.
        const resting = styleOf(step.verdict, false);
        const disc = el('circle', { cx: g.x, cy: g.y, r: 0, fill: resting.fill });
        liveNodeLayer.insertBefore(disc, node.label);
        await tween(VERDICT_MS, (t) => {
          disc.setAttribute('r', String(L.nodeR * easeOut(t)));
        });
        disc.remove();
        if (!alive(my)) return;
        paint(node, step.verdict, false);
      }

      if (step.verdict === 'cut') {
        // 뚜껑 · 색지 · 셈판이 한 시계로 돈다. 셋이 한 뜻이라 나눌 까닭이 없고,
        // 나누면 하나를 `void` 로 흘릴 여지가 생긴다.
        const capW = L.nodeR * 1.9;
        const shadeTop = g.y + LEVEL_GAP / 2;
        const shadeH = L.treeBottom - shadeTop;
        const jumped = belowCount(scene, step.id) > 0;
        await tween(CLOSE_MS, (t) => {
          const capE = easeOut(clamp01(t / CAP_PART));
          if (cap !== undefined) {
            cap.setAttribute('width', String(capW * capE));
            cap.setAttribute('x', String(g.x - (capW * capE) / 2));
          }
          if (shade !== undefined) shade.setAttribute('height', String(shadeH * easeOut(t)));
          if (jumped) {
            const s = 1 + 0.42 * Math.sin(Math.PI * t);
            skippedText.setAttribute('transform', popAbout(TALLY_X, TALLY_Y2, s));
          }
        });
        return;
      }

      if (trace !== null) {
        const total = trace.length;
        await tween(TRACE_MS, (t) => {
          trace.line.setAttribute('stroke-dashoffset', String(total * (1 - easeOut(t))));
        });
      }
    }

    function flow(scene: PruneBranchScene, d: Drawn, my: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      if (step.kind === 'task') return flowTask(d);
      if (step.kind === 'finish') return flowFinish(scene, d);
      return flowSpot(scene, step, d, my);
    }

    async function render(
      next: PruneBranchScene,
      /** 출발 그림을 기하와 `step` 에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: PruneBranchScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);
      const drawn = drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      await flow(next, drawn, my);
      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리와 임시 속성을 통째로 거둔다. 되돌릴 목록을 손으로
      // 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (cancelRaf !== null) for (const id of frames) cancelRaf(id);
        frames.clear();
        // 기다리던 것을 반드시 푼다. 프레임만 거두면 걸음의 끝이 영영 안 온다.
        for (const done of [...pending]) done();
        pending.clear();
        root.remove();
      },
    };
  },
};
