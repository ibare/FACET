/**
 * recolor-then-rotate-stage — 레드-블랙 트리를 그리는 이 조각 전용 캔버스.
 *
 * 빨강/검정은 그 자체가 데이터이므로 색 바꿈은 실제 색 보간으로, 회전은 실제
 * 좌표 이동으로 그린다 — 어느 쪽도 opacity 페이드로 뭉개지 않는다
 * (S-piece MUST NOT).
 *
 * 좌표는 각 마디의 뿌리→자신 경로(L/R 비트열)만으로 정해진다
 * (`x = 좌우여백 + 가용폭 * (경로의 이진값 + 0.5) / 2^깊이`). 그래서 회전으로
 * 부모/자식 관계가 바뀌면 좌표가 같은 공식에서 저절로 다시 나오고, 그 차이만큼
 * 실제로 움직인다 — 대본을 미리 적어 재생하는 것이 아니다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * 어느 마디가 무슨 색인지 · 어떤 이음으로 걸렸는지 · 지금 무엇이 위반으로 짚였는지 ·
 * 그 위반이 색칠 갈래인지 회전 갈래인지는 전부 장면이 말한다 (`scene.ts`). 여기서는
 * 그것을 자리와 칠로 옮길 뿐이다.
 *
 * **운동의 출발 그림은 `prev` 가 아니라 `step` 이 준다.** 정적 그리기가 정본이라
 * 마디들은 이미 끝 색·끝 자리에 서 있고, 걸음 함수는 `step.changes[].from` 과
 * `step.moved[].fromParentId` 로 옛 그림을 셈으로 되세운 뒤 거기서 출발한다
 * (S-scene: `prev` 는 무엇을 흐르게 할지 고르는 데만).
 *
 * 색은 design-tokens 만 쓴다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  RecolorThenRotateCaption,
  RecolorThenRotateColor,
  RecolorThenRotateNode,
  RecolorThenRotateScene,
  RecolorThenRotateSide,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 이 조각이 삽입 순서상 만나는 가장 깊은 자리(3이 회전 전에 잠깐 닿는 자리) 까지. */
const MAX_DEPTH = 3;
const ROW_H = 76;
const NODE_R = 25;
const RING_GAP = 5;
const SIDE_MIN = 28;
const CAPTION_H = 28;
const TOP_PAD = 26;
const BOTTOM_PAD = 22;
const TREE_TOP = CAPTION_H + TOP_PAD;
/** 빈 자리(NIL) 를 나타내는 작은 사각의 한 변. */
const NIL_SIZE = 15;

const MOVE_MS = 320;
const COLOR_MS = 240;
const APPEAR_MS = 200;

export const STAGE_HEIGHT = TREE_TOP + MAX_DEPTH * ROW_H + NODE_R + BOTTOM_PAD;

function pathIndex(path: string): number {
  let n = 0;
  for (const ch of path) n = n * 2 + (ch === 'R' ? 1 : 0);
  return n;
}

function xOf(path: string, width: number): number {
  const usable = width - SIDE_MIN * 2;
  const slots = 2 ** path.length;
  return SIDE_MIN + (usable * (pathIndex(path) + 0.5)) / slots;
}

function yOf(depth: number): number {
  return TREE_TOP + depth * ROW_H;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** `#rrggbb` → 세 성분. 팔레트가 rgba 문자열을 줄 수도 있으므로 실패를 허용한다. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (m === null) return null;
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * 두 색 사이를 섞는다.
 *
 * `t` 가 1 이면 목표 문자열을 **그대로** 돌려준다. 보간값을 끝에 남기면 흐르며 선
 * 화면과 곧바로 세운 화면이 `rgb(220, 38, 38)` 대 `#dc2626` 만큼 달라져 되짚기
 * 판정이 어긋난다 (S-scene 의 끝자리 함정).
 */
function mixColor(from: string, to: string, t: number): string {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return t < 0.5 ? from : to;
  const ch = (i: 0 | 1 | 2): number => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** 한 마디의 자리. 장면에 담지 않고 그리는 쪽이 경로에서 역산한다 (S-piece). */
type Spot = { readonly x: number; readonly y: number; readonly path: string };

/**
 * 나무의 이음에서 자리를 셈한다.
 *
 * 걸음이 돌 때는 **돌기 전 이음으로 한 번 더** 불러 옛 자리를 얻는다 — 그것이
 * 미끄러지는 운동의 출발 그림이다.
 */
function spotsOf(nodes: readonly RecolorThenRotateNode[], width: number): Map<string, Spot> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const spots = new Map<string, Spot>();
  for (const n of nodes) {
    const bits: string[] = [];
    let cur: RecolorThenRotateNode | undefined = n;
    // 이음이 어긋난 자료가 와도 멎지 않게 걸음 수를 나무 크기로 막는다.
    for (let guard = 0; cur !== undefined && cur.parentId !== null && guard <= nodes.length; guard += 1) {
      bits.unshift(cur.side ?? '');
      cur = byId.get(cur.parentId);
    }
    const path = bits.join('');
    spots.set(n.id, { x: xOf(path, width), y: yOf(path.length), path });
  }
  return spots;
}

type NodeVisual = {
  readonly group: SVGGElement;
  readonly circle: SVGCircleElement;
  readonly text: SVGTextElement;
};

export const recolorThenRotateStageView: CanvasView = {
  canvas: { height: STAGE_HEIGHT },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RecolorThenRotateScene> {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    const svg = params.canvas;
    svg.textContent = '';

    const width = PIECE_CANVAS_W;
    const palette: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const captionEl = document.createElementNS(SVG_NS, 'text');
    captionEl.setAttribute('x', String(width / 2));
    captionEl.setAttribute('y', String(CAPTION_H));
    captionEl.setAttribute('text-anchor', 'middle');
    captionEl.setAttribute('font-family', fonts.body);
    captionEl.setAttribute('font-size', fontSizes.sm);
    captionEl.setAttribute('fill', palette.text);
    svg.appendChild(captionEl);

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    const markLayer = document.createElementNS(SVG_NS, 'g');
    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(markLayer);
    svg.appendChild(nodeLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 걸음 함수가 `await` 를 지나므로 빗장을 둔다. 되짚기가 그 사이에 끼어들면
     * 옛 세대의 프레임이 **새로 선 화면**을 덮을 수 있다 — 정적 그리기가 매번 새
     * 요소를 짓더라도 손잡이를 쥔 클로저는 그대로 살아 있기 때문이다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다. 러너는 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed) {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const start = performance.now();
        let id = 0;
        const frame = (now: number): void => {
          frames.delete(id);
          const raw = Math.min(1, (now - start) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function fillFor(c: RecolorThenRotateColor): string {
      return c === 'red' ? palette.danger : palette.primary;
    }

    /**
     * 마디 위 글자색은 타일이 무엇이냐로 갈린다 (design-tokens 의 결정표).
     *
     *   danger   두 팔레트에서 고정(#dc2626) → stateInk
     *   primary  테마를 따라 뒤집힘          → textInverse
     *
     * 검정 마디에 stateInk(#171717 고정)를 얹으면 light 에서 타일색과 같아져
     * 글자가 사라진다.
     */
    function inkFor(c: RecolorThenRotateColor): string {
      return c === 'red' ? palette.stateInk : palette.textInverse;
    }

    // ── 정적 그리기가 걸음마다 새로 채우는 손잡이. `await` 뒤에 읽지 않는다.
    let visuals = new Map<string, NodeVisual>();
    let lines = new Map<string, SVGLineElement>();
    let spots = new Map<string, Spot>();

    function ringInto(parent: SVGGElement): void {
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('r', String(NODE_R + RING_GAP));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', palette.itemComparing);
      ring.setAttribute('stroke-width', '2.5');
      parent.appendChild(ring);
    }

    /** 빈 자리는 검정 취급이라는 사실을 작은 검정 사각(NIL)으로 못박아 보여준다. */
    function drawNil(spot: Spot): void {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${spot.x} ${spot.y})`);
      ringInto(g);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(-NIL_SIZE / 2));
      rect.setAttribute('y', String(-NIL_SIZE / 2));
      rect.setAttribute('width', String(NIL_SIZE));
      rect.setAttribute('height', String(NIL_SIZE));
      rect.setAttribute('fill', palette.primary);
      rect.setAttribute('stroke', palette.border);
      g.appendChild(rect);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('y', String(NIL_SIZE + 12));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-size', fontSizes.xs);
      label.setAttribute('fill', palette.textMuted);
      label.textContent = 'NIL';
      g.appendChild(label);
      markLayer.appendChild(g);
    }

    /**
     * 위반으로 짚인 자리들. 고리는 **머무는 강조**라 정적 그리기에도 들어간다 —
     * 빠뜨리면 되짚었을 때 사라진다 (S-scene).
     */
    function ringedIds(scene: RecolorThenRotateScene): Set<string> {
      const ids = new Set<string>();
      const v = scene.violation;
      if (v === null) return ids;
      ids.add(v.childId);
      ids.add(v.parentId);
      if (v.uncle.kind === 'node') ids.add(v.uncle.id);
      return ids;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform ·
     * 보간 색 · opacity 도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: RecolorThenRotateScene): void {
      edgeLayer.textContent = '';
      markLayer.textContent = '';
      nodeLayer.textContent = '';
      visuals = new Map<string, NodeVisual>();
      lines = new Map<string, SVGLineElement>();
      spots = spotsOf(scene.nodes, width);

      // 가지는 자식 쪽 id 로 센다 — 부모가 바뀌면 같은 가지의 위 끝만 옮겨간다.
      for (const n of scene.nodes) {
        if (n.parentId === null) continue;
        const from = spots.get(n.parentId);
        const to = spots.get(n.id);
        if (from === undefined || to === undefined) continue;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(from.x));
        line.setAttribute('y1', String(from.y));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y));
        line.setAttribute('stroke', palette.border);
        line.setAttribute('stroke-width', '2');
        edgeLayer.appendChild(line);
        lines.set(n.id, line);
      }

      const ringed = ringedIds(scene);
      for (const n of scene.nodes) {
        const spot = spots.get(n.id);
        if (spot === undefined) continue;
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('transform', `translate(${spot.x} ${spot.y})`);
        // 고리를 마디와 한 무리에 넣는다 — 마디가 미끄러지면 함께 따라간다.
        if (ringed.has(n.id)) ringInto(group);

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('r', String(NODE_R));
        circle.setAttribute('fill', fillFor(n.color));
        circle.setAttribute('stroke', palette.border);
        circle.setAttribute('stroke-width', '1.5');

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-family', fonts.body);
        text.setAttribute('font-size', fontSizes.sm);
        text.setAttribute('font-weight', '600');
        text.setAttribute('fill', inkFor(n.color));
        text.textContent = String(n.value);

        group.appendChild(circle);
        group.appendChild(text);
        nodeLayer.appendChild(group);
        visuals.set(n.id, { group, circle, text });
      }

      // 빈 옆자리는 조부모의 경로에서 나온다 — 조부모가 어디 있든 그 옆이다.
      const v = scene.violation;
      if (v !== null && v.uncle.kind === 'nil') {
        const gp = spots.get(v.grandparentId);
        if (gp !== undefined) {
          const path = gp.path + v.uncle.side;
          drawNil({ x: xOf(path, width), y: yOf(path.length), path });
        }
      }
    }

    /** 마디의 값. 캡션이 id 만 싣고 수는 장면에서 꺼내므로 여기서 푼다. */
    function valueOf(scene: RecolorThenRotateScene, id: string): number | string {
      return scene.nodes.find((n) => n.id === id)?.value ?? '';
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: RecolorThenRotateScene): void {
      const cap: RecolorThenRotateCaption | null = scene.caption;
      if (cap === null) {
        captionEl.textContent = '';
        return;
      }
      const v = (id: string): number | string => valueOf(scene, id);
      switch (cap.kind) {
        case 'insertRoot':
          captionEl.textContent = tr(
            'caption.insertRoot',
            '{value} starts the tree — the root is always black.',
            { value: v(cap.id) },
          );
          return;
        case 'insertRed':
          captionEl.textContent = tr('caption.insertRed', '{value} enters red, under {parent}.', {
            value: v(cap.id),
            parent: v(cap.parentId),
          });
          return;
        case 'violationRed':
          captionEl.textContent = tr(
            'caption.violationRed',
            '{child} lands red under red {parent}. Its sibling {uncle} is red too — recoloring will settle it.',
            { child: v(cap.childId), parent: v(cap.parentId), uncle: v(cap.uncleId) },
          );
          return;
        case 'violationNil':
          captionEl.textContent = tr(
            'caption.violationNil',
            '{child} lands red under red {parent}, and the empty spot beside {parent} counts as black — recoloring alone will not fix this.',
            { child: v(cap.childId), parent: v(cap.parentId) },
          );
          return;
        case 'recolorApplied':
          captionEl.textContent = tr(
            'caption.recolorApplied',
            '{parent} and {uncle} turn black, {grandparent} turns red.',
            {
              parent: v(cap.parentId),
              uncle: v(cap.uncleId),
              grandparent: v(cap.grandparentId),
            },
          );
          return;
        case 'rootFixApplied':
          captionEl.textContent = tr(
            'caption.rootFixApplied',
            '{root} is the root, so it turns back to black.',
            { root: v(cap.rootId) },
          );
          return;
        case 'rotateApplied':
          captionEl.textContent = tr(
            'caption.rotateApplied',
            '{grandparent} rotates — {parent} moves up in its place.',
            { parent: v(cap.riserId), grandparent: v(cap.pivotId) },
          );
          return;
        case 'rotateSwapApplied':
          captionEl.textContent = tr(
            'caption.rotateSwapApplied',
            '{parent} turns black, {grandparent} turns red.',
            { parent: v(cap.riserId), grandparent: v(cap.pivotId) },
          );
          return;
      }
    }

    // ── 걸음 함수 ───────────────────────────────────────────────────────────
    //
    // 셋 다 정적 그리기가 세워 둔 **끝 그림에서 뒤로 물려** 출발한다. 물리는 그림은
    // 장면의 `step` 에서 셈하므로 `prev` 를 들추지 않는다 (S-scene).
    //
    // 정적으로 세운 직후에 물려 놓아도 그 사이에 타이머도 프레임도 없어 페인트가
    // 끼지 않는다 — 끝 그림이 번쩍이지 않는다.

    /** 새 마디가 제 자리에 돋아난다. 부모에서 뻗는 가지도 함께 자란다. */
    function growIn(id: string, myGen: number): Promise<void> {
      const node = visuals.get(id);
      if (node === undefined) return Promise.resolve();
      const line = lines.get(id) ?? null;

      node.circle.setAttribute('r', '0');
      node.text.setAttribute('opacity', '0');
      if (line !== null) line.setAttribute('opacity', '0');

      return tween(APPEAR_MS, (raw) => {
        if (!alive(myGen)) return;
        const e = easeOutCubic(raw);
        node.circle.setAttribute('r', String(NODE_R * e));
        node.text.setAttribute('opacity', String(e));
        if (line !== null) line.setAttribute('opacity', String(e));
      });
    }

    /**
     * 짚인 마디들의 색이 실제로 옮겨간다.
     *
     * 이 조각에서 색은 꾸밈이 아니라 값이므로 페이드가 아니라 **색 사이를 잇는다**.
     * 출발 색은 `step.changes[].from` 이 말해 준다.
     */
    function recolorFlow(
      changes: readonly { readonly id: string; readonly from: RecolorThenRotateColor }[],
      scene: RecolorThenRotateScene,
      myGen: number,
    ): Promise<void> {
      const shifts: { node: NodeVisual; fill: [string, string]; ink: [string, string] }[] = [];
      for (const c of changes) {
        const node = visuals.get(c.id);
        const to = scene.nodes.find((n) => n.id === c.id);
        if (node === undefined || to === undefined || to.color === c.from) continue;
        shifts.push({
          node,
          fill: [fillFor(c.from), fillFor(to.color)],
          ink: [inkFor(c.from), inkFor(to.color)],
        });
      }
      if (shifts.length === 0) return Promise.resolve();

      for (const s of shifts) {
        s.node.circle.setAttribute('fill', s.fill[0]);
        s.node.text.setAttribute('fill', s.ink[0]);
      }

      return tween(COLOR_MS, (raw) => {
        if (!alive(myGen)) return;
        for (const s of shifts) {
          s.node.circle.setAttribute('fill', mixColor(s.fill[0], s.fill[1], raw));
          s.node.text.setAttribute('fill', mixColor(s.ink[0], s.ink[1], raw));
        }
      });
    }

    /**
     * 나무가 돈다.
     *
     * 한 걸음에 여러 마디와 가지가 함께 미끄러지고 그것이 이 조각의 주장이므로,
     * **시계를 둘로 나누지 않는다** — 옮길 것을 한 목록에 모아 한 트윈으로 흘린다.
     *
     * 옛 자리는 돌기 전 이음(`fromParentId` · `fromSide`)으로 나무를 한 번 더 세워
     * 얻는다. `prev` 장면을 들추지 않는 것이 요점이다 (S-scene).
     */
    function rotateFlow(
      moved: readonly {
        readonly id: string;
        readonly fromParentId: string | null;
        readonly fromSide: RecolorThenRotateSide;
      }[],
      scene: RecolorThenRotateScene,
      myGen: number,
    ): Promise<void> {
      const back = new Map(moved.map((m) => [m.id, m]));
      const before = scene.nodes.map((n) => {
        const m = back.get(n.id);
        return m === undefined ? n : { ...n, parentId: m.fromParentId, side: m.fromSide };
      });
      const wasSpots = spotsOf(before, width);

      // 마디는 무리째, 가지는 양 끝을 따로 — 둘 다 같은 트윈이 민다.
      const nodeMoves: { group: SVGGElement; from: Spot; to: Spot }[] = [];
      for (const [id, visual] of visuals) {
        const from = wasSpots.get(id);
        const to = spots.get(id);
        if (from === undefined || to === undefined) continue;
        if (from.x === to.x && from.y === to.y) continue;
        nodeMoves.push({ group: visual.group, from, to });
      }
      const lineMoves: { line: SVGLineElement; from: [Spot, Spot]; to: [Spot, Spot] }[] = [];
      for (const n of scene.nodes) {
        const line = n.parentId === null ? undefined : lines.get(n.id);
        if (line === undefined || n.parentId === null) continue;
        const toChild = spots.get(n.id);
        const toParent = spots.get(n.parentId);
        if (toChild === undefined || toParent === undefined) continue;
        // 돌기 전에 그 이음이 없었더라도 끝점은 옛 자리에서 출발한다 — 원래 그림에서
        // 가지가 두 끝을 따라 미끄러지던 것과 같은 결이다.
        const fromChild = wasSpots.get(n.id) ?? toChild;
        const fromParent = wasSpots.get(n.parentId) ?? toParent;
        const still =
          fromChild.x === toChild.x &&
          fromChild.y === toChild.y &&
          fromParent.x === toParent.x &&
          fromParent.y === toParent.y;
        if (still) continue;
        lineMoves.push({ line, from: [fromParent, fromChild], to: [toParent, toChild] });
      }
      if (nodeMoves.length === 0 && lineMoves.length === 0) return Promise.resolve();

      const place = (e: number): void => {
        for (const m of nodeMoves) {
          const x = m.from.x + (m.to.x - m.from.x) * e;
          const y = m.from.y + (m.to.y - m.from.y) * e;
          m.group.setAttribute('transform', `translate(${x} ${y})`);
        }
        for (const m of lineMoves) {
          m.line.setAttribute('x1', String(m.from[0].x + (m.to[0].x - m.from[0].x) * e));
          m.line.setAttribute('y1', String(m.from[0].y + (m.to[0].y - m.from[0].y) * e));
          m.line.setAttribute('x2', String(m.from[1].x + (m.to[1].x - m.from[1].x) * e));
          m.line.setAttribute('y2', String(m.from[1].y + (m.to[1].y - m.from[1].y) * e));
        }
      };

      place(0);
      return tween(MOVE_MS, (raw) => {
        if (!alive(myGen)) return;
        place(easeInOut(raw));
      });
    }

    async function render(
      next: RecolorThenRotateScene,
      /** 출발 그림을 `step` 에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: RecolorThenRotateScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      // 위반을 짚는 걸음은 흐를 것이 없다 — 고리는 이미 정적으로 서 있다.
      if (step === null) return;

      if (step.kind === 'insert') {
        await growIn(step.id, myGen);
      } else if (step.kind === 'recolor') {
        await recolorFlow(step.changes, next, myGen);
      } else {
        await rotateFlow(step.moved, next, myGen);
      }

      if (!alive(myGen)) return;
      // 운동이 남긴 보간 끝자리와 임시 속성(`opacity` · `rgb(...)`)을 통째로 거둔다.
      // 되돌릴 목록을 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const done of [...pending]) done();
        pending.clear();
        svg.textContent = '';
      },
    };
  },
};
