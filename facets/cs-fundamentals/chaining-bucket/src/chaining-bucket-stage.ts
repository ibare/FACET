/**
 * chaining-bucket-stage — 체이닝 조각 전용 시각화.
 *
 * 동사가 "매달린다" 이므로 화면의 축은 **세로**다.
 *
 *   ┌ 들어오는 길(lane) ─ 키가 왼쪽 밖에서 들어와 자기 자리 위까지 가로로 온다
 *   ├ 자리 줄(bar)      ─ 버킷 여덟이 캔버스 폭을 채우고, 칸마다 고리가 달려 있다
 *   └ 사슬(chain)       ─ 고리 아래로 칸이 세로로 이어진다
 *
 * 빈 자리에는 곧장 내려가 걸리고, 이미 무언가 매달린 자리에는 **옆 칸으로 내려가
 * 사슬 끝에 걸어 넣는다.** 먼저 온 것은 한 픽셀도 움직이지 않는다 — 그것이 이
 * 조각이 하는 주장이다.
 *
 * 찾기는 반대 방향의 운동이다. 질의 표는 왼쪽 밖에서 포물선을 그리며 다른 자리를
 * 건너뛰고 목표 자리로 날아온 뒤, 그 사슬만 한 칸씩 내려가며 견준다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`hangKey()` · `jumpToBucket()` · `compareLink()` …) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면
 * 처음부터 다시 밟는 수밖에 없었고, 무엇보다 **어느 칸에 무엇이 몇 개 달렸나가
 * DOM 손잡이 배열(`ChainNode[][]`) 에만** 있었다. 이제 `render(next, prev,
 * { animate })` 하나가 그 장면의 화면 전체를 세운다 (S-scene). 장면의 모양은
 * `scene.ts`.
 *
 * 사슬은 장면의 `chains` 에서 **셈해진다** — 마디도, 마디를 잇는 줄도, 줄이
 * 시작하는 높이도 전부 그 구조에서 나온다. 마디를 하나씩 덧붙이고 줄을 하나씩
 * 자라게 하던 명령 줄기가 없다. 마디의 칠도 `probe` 에서 파생된다 — 훑은 깊이보다
 * 앞이면 지나온 칸, 같으면 지금 견주는 칸, 뒤면 아직 손대지 않은 칸.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에
 * 서 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그 장면을
 * 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도 다르면
 * 되짚기 판정이 어긋나기 때문이다.
 *
 * 문안은 이 파일이 `params.t` 로 만든다 (C10). 자리 번호(0..7)는 도형에 새겨진
 * 표식이라 키를 만들지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  space,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { ChainingBucketScene, ChainingCaption, ChainingProbe } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** '12px' 같은 CSS 토큰을 SVG 좌표계의 수로. 토큰 경유를 유지하기 위한 변환만 한다. */
const px = (token: string): number => Number.parseFloat(token);

// ── 가로. 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
const CANVAS_W = PIECE_CANVAS_W;
const SIDE_MIN = px(space.xl);
const SLOT_MAX_W = 78;
const NODE_INSET = 2;
const CELL_INSET = 3;
const PROBE_MAX_W = 62;
const PROBE_GAP = px(space.sm);

// ── 세로. 내용이 정한다.
const LANE_Y = px(space.md);
const NODE_H = 34;
const KEY_BASELINE = 14;
const HASH_BASELINE = 27;
const BAR_Y = 60;
const BAR_H = 26;
const HOOK_H = 14;
const HOOK_STUB = 6;
const LINK_GAP = 14;
const PITCH = NODE_H + LINK_GAP;
const CHAIN_TOP = BAR_Y + BAR_H + HOOK_H;
/** 이 조각이 보이는 가장 긴 사슬. 자리 하나에 셋이 걸린다. */
const MAX_DEPTH = 3;
const CHAIN_BOTTOM = CHAIN_TOP + (MAX_DEPTH - 1) * PITCH + NODE_H;
const CAPTION_Y = CHAIN_BOTTOM + px(space.xl) - 2;
const STAGE_H = CAPTION_Y + px(space.md);
const PROBE_H = 22;
const PROBE_BASELINE = 15;
const ARC_RISE = 28;

// ── 걸음 안의 운동 시간. 걸음 간격(stepMs)과 별개로 짧게 유지한다.
const TRAVEL_MS = 300;
const DROP_MS = 320;
const HOOK_MS = 180;
const LINK_MS = 150;
const JUMP_MS = 340;
const PROBE_MS = 240;

const DEFAULT_BUCKETS = 8;

const STROKE_W = 1.5;
const CHAIN_STROKE_W = 2;
const ACTIVE_STROKE_W = 2;

/** 마디 하나의 형편. 어디에도 저장하지 않는다 — 장면의 `probe` 에서 파생된다. */
type NodeState = 'default' | 'comparing' | 'visited' | 'match';

type ChainNode = {
  g: SVGGElement;
  box: SVGRectElement;
  keyText: SVGTextElement;
  hashText: SVGTextElement;
};

type BucketCell = {
  box: SVGRectElement;
  label: SVGTextElement;
};

/** 정적 그리기가 세운 사슬 한 칸의 손잡이. 걸음이 그 위에 운동을 덧댄다. */
type Drawn = {
  node: ChainNode;
  link: SVGLineElement;
};

/**
 * 자리 셈에 필요한 것들. 장면은 좌표를 모르므로 (S-piece) 여기서 역산한다.
 *
 * 자리 수 하나로 전부 정해지므로 자리 수가 바뀔 때만 다시 셈한다.
 */
type Geom = {
  bucketCount: number;
  slotW: number;
  originX: number;
  nodeW: number;
  probeW: number;
  /** 들어오는 길의 시작. 캔버스 왼쪽 밖이다. */
  laneStartX: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clear(parent: Element): void {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const nowMs = (): number =>
  typeof performance === 'object' && performance !== null ? performance.now() : Date.now();

function makeGeom(bucketCount: number): Geom {
  const count = Math.max(1, bucketCount);
  // 남는 폭을 좌우로 버리지 않는다. 칸 폭은 캔버스에서 역산한다 (S-piece).
  const slotW = Math.min(SLOT_MAX_W, Math.floor((CANVAS_W - SIDE_MIN * 2) / count));
  const nodeW = slotW - NODE_INSET * 2;
  return {
    bucketCount: count,
    slotW,
    originX: Math.round((CANVAS_W - count * slotW) / 2),
    nodeW,
    probeW: Math.min(PROBE_MAX_W, nodeW),
    laneStartX: -nodeW,
  };
}

const cx = (g: Geom, b: number): number => g.originX + b * g.slotW + g.slotW / 2;

const nodeTop = (depth: number): number => CHAIN_TOP + depth * PITCH;

/** 그 깊이의 줄이 시작하는 높이 — 고리에서, 또는 앞 칸의 밑에서. */
const linkTop = (depth: number): number =>
  depth === 0 ? BAR_Y + BAR_H : nodeTop(depth - 1) + NODE_H;

/** 이미 매달린 것을 밀치지 않으려면 옆 칸으로 내려간다. 오른쪽이 없으면 왼쪽. */
function descentX(g: Geom, b: number): number {
  const right = cx(g, b) + g.slotW;
  return right + g.nodeW / 2 <= CANVAS_W ? right : cx(g, b) - g.slotW;
}

/** 질의 표가 사슬을 훑을 때 서는 자리 — 사슬 왼쪽, 없으면 오른쪽. */
function probeLaneX(g: Geom, b: number): number {
  const left = cx(g, b) - g.nodeW / 2 - PROBE_GAP - g.probeW / 2;
  return left - g.probeW / 2 >= 0 ? left : cx(g, b) + g.nodeW / 2 + PROBE_GAP + g.probeW / 2;
}

/** 질의 표가 서는 높이. 사슬에 들어가기 전이면 들어오는 길 높이다. */
const probeY = (at: number | null): number =>
  (at === null ? LANE_Y : nodeTop(at)) + (NODE_H - PROBE_H) / 2;

/**
 * 마디 하나의 칠은 어디에도 적히지 않는다 — 훑은 자리에서 파생된다.
 *
 * 옮기기 전에는 `lastCompared` 라는 `let` 이 "앞서 견준 칸을 지나온 칸으로
 * 되돌린다" 는 명령을 쥐고 있었고, 그 되돌림이 되짚기가 어긋나던 자리였다.
 */
function stateOf(probe: ChainingProbe | null, bucket: number, depth: number): NodeState {
  if (probe === null || probe.bucket !== bucket || probe.at === null) return 'default';
  if (depth < probe.at) return 'visited';
  if (depth > probe.at) return 'default';
  return probe.matched ? 'match' : 'comparing';
}

export type ChainingBucketStage = ViewInstance & SceneRenderer<ChainingBucketScene>;

export const chainingBucketStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ChainingBucketScene> {
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    // ── 층. mount 에서 한 번 세운다. 사슬은 칸 뒤에, 질의 표는 맨 앞에.
    const root = el('g');
    const barLayer = el('g');
    const linkLayer = el('g');
    const nodeLayer = el('g');
    const probeLayer = el('g');
    root.append(barLayer, linkLayer, nodeLayer, probeLayer);
    svg.appendChild(root);

    const caption = el('text', {
      x: CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': px(fontSizes.sm),
      fill: c.textMuted,
    });
    root.appendChild(caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 이 조각의 걸음은 `await` 를 여럿 지나며 프레임마다 좌표를 고쳐 쓴다. 자리
     * 줄과 질의 표는 **정적 그리기가 다시 만들지 않는** 요소라 (자리 수가 바뀔
     * 때만 짓는다) 살아남은 옛 운동이 살아 있는 화면에 옛 좌표를 덮어쓸 수 있다.
     * 걸음 함수는 깨어날 때마다 자기 세대가 아직 유효한지 보고, 아니면 **화면에
     * 손대지 않고** 물러난다.
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     * 세대가 지났거나 되짚는 중이면 프레임을 하나도 걸지 않고 물러난다.
     */
    function animate(myGen: number, ms: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (
          !alive(myGen) ||
          ms <= 0 ||
          typeof requestAnimationFrame !== 'function'
        ) {
          resolve();
          return;
        }
        const started = nowMs();
        draw(0);
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (!alive(myGen)) {
            finish();
            return;
          }
          const raw = Math.min(1, (nowMs() - started) / ms);
          draw(easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    const place = (g: SVGGElement, x: number, y: number): void => {
      g.setAttribute('transform', `translate(${x} ${y})`);
    };

    // ── 자리 수가 정하는 것들. 자리 수가 바뀔 때만 다시 짓는다.
    let geom = makeGeom(DEFAULT_BUCKETS);
    let builtCount = -1;
    let cells: BucketCell[] = [];
    let probeG = el('g');
    let probeText = el('text');

    /** 정적 그리기가 세운 사슬 손잡이. 걸음 함수가 여기서 꺼내 쓴다. */
    let drawn: Drawn[][] = [];

    const setCellActive = (b: number, active: boolean): void => {
      const cell = cells[b];
      if (!cell) return;
      cell.box.setAttribute('stroke', active ? c.itemActive : c.border);
      cell.box.setAttribute('stroke-width', String(active ? ACTIVE_STROKE_W : STROKE_W));
      cell.label.setAttribute('fill', active ? c.text : c.textMuted);
    };

    const setNodeState = (node: ChainNode, state: NodeState): void => {
      const chip = state === 'comparing' ? c.itemComparing : state === 'match' ? c.itemPivot : null;
      node.box.setAttribute('fill', chip ?? c.bg);
      node.box.setAttribute('stroke', chip ?? (state === 'visited' ? c.textMuted : c.border));
      node.keyText.setAttribute('fill', chip === null ? c.text : c.stateInk);
      node.hashText.setAttribute('fill', chip === null ? c.textMuted : c.stateInk);
    };

    const makeNode = (key: string, hash: number): ChainNode => {
      const g = el('g');
      const box = el('rect', {
        x: -geom.nodeW / 2,
        y: 0,
        width: geom.nodeW,
        height: NODE_H,
        rx: px(radii.md),
        fill: c.bg,
        stroke: c.border,
        'stroke-width': STROKE_W,
      });
      const keyText = el('text', {
        x: 0,
        y: KEY_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': px(fontSizes.sm),
        'font-weight': 600,
        fill: c.text,
      });
      keyText.textContent = key;
      const hashText = el('text', {
        x: 0,
        y: HASH_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': px(fontSizes.xs),
        fill: c.textMuted,
      });
      hashText.textContent = String(hash);
      g.append(box, keyText, hashText);
      nodeLayer.appendChild(g);
      return { g, box, keyText, hashText };
    };

    /** 자리 줄과 질의 표를 짓는다. 자리 수가 정하는 것이라 그때만 다시 짓는다. */
    function build(bucketCount: number): void {
      geom = makeGeom(bucketCount);
      const g = geom;
      clear(barLayer);
      clear(probeLayer);
      cells = [];

      for (let b = 0; b < g.bucketCount; b += 1) {
        const box = el('rect', {
          x: g.originX + b * g.slotW + CELL_INSET,
          y: BAR_Y,
          width: g.slotW - CELL_INSET * 2,
          height: BAR_H,
          rx: px(radii.sm),
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': STROKE_W,
        });
        const label = el('text', {
          x: cx(g, b),
          y: BAR_Y + BAR_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': px(fontSizes.sm),
          fill: c.textMuted,
        });
        label.textContent = String(b);
        const hook = el('line', {
          x1: cx(g, b),
          y1: BAR_Y + BAR_H,
          x2: cx(g, b),
          y2: BAR_Y + BAR_H + HOOK_STUB,
          stroke: c.border,
          'stroke-width': CHAIN_STROKE_W,
          'stroke-linecap': 'round',
        });
        barLayer.append(box, label, hook);
        cells.push({ box, label });
      }

      probeG = el('g', { display: 'none' });
      const probeBox = el('rect', {
        x: -g.probeW / 2,
        y: 0,
        width: g.probeW,
        height: PROBE_H,
        rx: px(radii.lg),
        fill: c.risingMarker,
      });
      probeText = el('text', {
        x: 0,
        y: PROBE_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': px(fontSizes.sm),
        'font-weight': 600,
        fill: c.bg,
      });
      probeG.append(probeBox, probeText);
      probeLayer.appendChild(probeG);

      builtCount = g.bucketCount;
    }

    function captionText(cap: ChainingCaption | null): string {
      if (cap === null) return '';
      switch (cap.kind) {
        case 'hangFirst':
          return tr(
            'caption.hangFirst',
            '{key} hashes to slot {bucket}. Nothing hangs there yet, so it hangs alone.',
            { key: cap.key, bucket: cap.bucket },
          );
        case 'hangCollide':
          return tr(
            'caption.hangCollide',
            '{key} lands on slot {bucket} too. Nothing is pushed out — it hooks onto the end of that chain.',
            { key: cap.key, bucket: cap.bucket },
          );
        case 'probeJump':
          return tr(
            'caption.probeJump',
            'Looking for {key}: go straight to slot {bucket}. No other slot is touched.',
            { key: cap.key, bucket: cap.bucket },
          );
        case 'probeMiss':
          return tr('caption.probeMiss', '{key} is not it. Step one link down the chain.', {
            key: cap.key,
          });
        case 'probeHit':
          return tr('caption.probeHit', '{key} matches.', { key: cap.key });
        case 'done':
          return tr(
            'caption.done',
            'Found in slot {bucket} after {comparisons} comparisons — only that one chain was walked.',
            { bucket: cap.bucket, comparisons: cap.comparisons },
          );
      }
    }

    /**
     * 장면 하나를 통째로 세운다 — 사슬도 줄도 칸의 켜짐도 질의 표도 캡션도.
     *
     * 사슬은 매번 지우고 새로 만든다. 그래야 흐르며 남은 속성 하나가 곧바로 세운
     * 화면과의 차이가 되는 일이 없다 (프로토콜 4절). 자리 줄과 질의 표는 다시
     * 짓지 않으므로 **모든 속성을 매번 명시로** 쓴다 — 숨기기만 하고 자리를 그대로
     * 두면 되짚기 판정에서 어긋난다.
     */
    function settle(s: ChainingBucketScene): void {
      const count = Math.max(1, s.bucketCount);
      if (builtCount !== count) build(count);
      const g = geom;

      clear(linkLayer);
      clear(nodeLayer);
      drawn = [];

      for (let b = 0; b < g.bucketCount; b += 1) {
        const chain = s.chains[b] ?? [];
        const row: Drawn[] = [];
        for (let d = 0; d < chain.length; d += 1) {
          const hung = chain[d];
          const link = el('line', {
            x1: cx(g, b),
            y1: linkTop(d),
            x2: cx(g, b),
            y2: nodeTop(d),
            stroke: c.textMuted,
            'stroke-width': CHAIN_STROKE_W,
            'stroke-linecap': 'round',
          });
          linkLayer.appendChild(link);
          const node = makeNode(hung.key, hung.hash);
          place(node.g, cx(g, b), nodeTop(d));
          setNodeState(node, stateOf(s.probe, b, d));
          row.push({ node, link });
        }
        drawn.push(row);
        setCellActive(b, s.probe !== null && s.probe.bucket === b);
      }

      if (s.probe === null) {
        probeText.textContent = '';
        probeG.setAttribute('display', 'none');
        place(probeG, g.laneStartX, LANE_Y);
      } else {
        probeText.textContent = s.probe.key;
        probeG.removeAttribute('display');
        place(probeG, probeLaneX(g, s.probe.bucket), probeY(s.probe.at));
      }

      caption.textContent = captionText(s.caption);
    }

    // ── 걸음. 정적으로 선 것을 출발 자리로 물렸다가 되돌린다. ─────────────

    /** 키 하나가 들어와 매달린다. 먼저 온 것은 한 픽셀도 움직이지 않는다. */
    async function runHang(bucket: number, depth: number, myGen: number): Promise<void> {
      const cell = drawn[bucket]?.[depth];
      if (!cell) return;
      const g = geom;
      const landX = cx(g, bucket);
      // 이미 무언가 매달린 자리면 옆 칸으로 돌아 내려간다 — 그것이 부딪힘의 몸짓이다.
      const dropX = depth === 0 ? landX : descentX(g, bucket);
      const landY = nodeTop(depth);
      const from = linkTop(depth);

      // 줄은 아직 자라지 않았다. 정적이 세워 둔 끝 자리를 되물린다.
      cell.link.setAttribute('y2', String(from));

      await animate(myGen, TRAVEL_MS, (t) =>
        place(cell.node.g, lerp(g.laneStartX, dropX, t), LANE_Y),
      );
      await animate(myGen, DROP_MS, (t) => place(cell.node.g, dropX, lerp(LANE_Y, landY, t)));
      if (depth > 0) {
        await animate(myGen, HOOK_MS, (t) => place(cell.node.g, lerp(dropX, landX, t), landY));
      }
      await animate(myGen, LINK_MS, (t) =>
        cell.link.setAttribute('y2', String(lerp(from, landY, t))),
      );
    }

    /** 찾는 키가 다른 자리를 건너뛰고 목표 자리로 곧장 날아온다. */
    async function runJump(bucket: number, myGen: number): Promise<void> {
      const g = geom;
      const toX = probeLaneX(g, bucket);
      const toY = probeY(null);
      const ctrlX = (g.laneStartX + toX) / 2;
      const ctrlY = toY - ARC_RISE;
      await animate(myGen, JUMP_MS, (t) => {
        const u = 1 - t;
        place(
          probeG,
          u * u * g.laneStartX + 2 * u * t * ctrlX + t * t * toX,
          u * u * toY + 2 * u * t * ctrlY + t * t * toY,
        );
      });
    }

    /** 그 사슬만 한 칸씩 내려가며 견준다. */
    async function runCompare(
      bucket: number,
      depth: number,
      from: number | null,
      myGen: number,
    ): Promise<void> {
      const g = geom;
      // 내려가는 동안에는 아직 견주기 전이다. 정적이 미리 칠한 것을 잠시 물린다 —
      // 뒤따르는 settle 이 되돌린다.
      const node = drawn[bucket]?.[depth]?.node;
      if (node) setNodeState(node, 'default');
      const x = probeLaneX(g, bucket);
      const y0 = probeY(from);
      const y1 = probeY(depth);
      await animate(myGen, PROBE_MS, (t) => place(probeG, x, lerp(y0, y1, t)));
    }

    /** 방금 밟은 걸음 하나만 흐르게 한다. */
    async function flow(s: ChainingBucketScene, myGen: number): Promise<void> {
      const step = s.step;
      if (step === null) return;
      switch (step.kind) {
        case 'hang':
          await runHang(step.bucket, step.depth, myGen);
          return;
        case 'jump':
          await runJump(step.bucket, myGen);
          return;
        case 'compare':
          await runCompare(step.bucket, step.depth, step.from, myGen);
          return;
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 보간의 끝자리가 남긴
     * 좌표 문자열 하나가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게
     * 하기 때문이다. 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질 뿐이다.
     *
     * 돌려주는 Promise 는 장면이 다 선 뒤에 풀린다 — 이것이 바깥이 걸음의 끝을
     * 아는 유일한 통로다 (S-scene).
     */
    async function render(
      next: ChainingBucketScene,
      /** 이 조각은 출발 그림을 장면의 계기값에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: ChainingBucketScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      await flow(next, myGen);
      if (alive(myGen)) settle(next);
    }

    const instance: ViewInstance & SceneRenderer<ChainingBucketScene> = {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id); // 걸어 둔 것을 먼저 거두고
        }
        frames.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        root.remove();
      },
    };

    return instance;
  },
};
