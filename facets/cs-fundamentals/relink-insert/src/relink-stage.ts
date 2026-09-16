/**
 * relink-stage — 재연결 조각의 전용 시각화 (S-facet 의 stage view 1파일).
 *
 * ── 왜 이 배치인가
 *
 * 이 조각의 동사는 "끊고 잇는다" 이고, 그 동사가 성립하려면 **노드가 움직이지
 * 않아야** 한다. 그래서 A · B · C 는 한 줄에 박혀 끝까지 한 픽셀도 옮기지 않고,
 * 새로 들어오는 X 만 그 줄 아래에 선다. X 를 줄 사이에 끼워 넣으면 B 와 C 가
 * 오른쪽으로 밀려나 — 배열이 하는 바로 그 일 — 조각이 말하려는 것과 반대를
 * 그리게 된다.
 *
 * 움직이는 것은 화살표의 **끝** 하나뿐이다. 꼬리는 A 의 포인터 자리에 못박혀
 * 있고, 끝이 B 에서 떨어져 허공에 걸렸다가 X 로 내려가 붙는다. 색 전환이 아니라
 * 좌표가 실제로 이동한다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`showChain()` · `detachEdge()` · `landEdge()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었고, 무엇보다 **잇는 곳이 어디서 어디로 바뀌었나가 화살표의
 * `d` 속성에만** 있었다. 이제 `render(next, prev, { animate })` 하나가 그 장면의
 * 화면 전체를 세운다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 화살표는 장면의 `links` 에서 **셈해진다** — 어느 마디를 가리키면 그 마디로
 * 뻗고, 끝이면 null 표식으로 가고, 떨어져 있으면 허공에 걸린 채 촉이 빈다. 그러니
 * 화살표를 하나하나 고쳐 쓰는 코드가 없다.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에
 * 서 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그 장면을
 * 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도 다르면
 * 되짚기 판정이 어긋나기 때문이다.
 *
 * 화면 문자 중 sentence 는 `params.t` 로만 짓는다 (C10). 여기 남는 리터럴은
 * `next` / `null` 처럼 도식에 각인된 표식과, 조회가 빗나갔을 때의 en 되받이뿐이다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  RelinkCaption,
  RelinkInsertScene,
  RelinkLink,
  RelinkSceneNode,
  RelinkStep,
  RelinkTally,
} from './scene.js';

/** 도식에 각인된 표식 — 번역 대상이 아니다 (C10 표식 판정 1·2). */
const MARK_NEXT = 'next';
const MARK_NULL = 'null';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 310;

const NODE_W = 64;
const NODE_H = 44;
/** 노드 사이 빈 자리. 화살표가 살 곳이라 넉넉해야 한다. */
const GAP = 66;
/** 줄 끝의 null 표식이 차지하는 폭. */
const NULL_SPAN = 44;
/** 화살촉이 상대 상자에 닿기 전에 멈추는 거리. */
const TIP_GAP = 7;

const ROW_Y = 92;
const ROW_CY = ROW_Y + NODE_H / 2;
const STAGE_Y = 184;
const STAGE_CY = STAGE_Y + NODE_H / 2;

const CAPTION_Y = 30;
const TALLY_Y = 250;

const ENTER_MS = 380;
const DETACH_MS = 300;
const ATTACH_MS = 480;
const GROW_MS = 420;
const TRACE_MS = 1040;

type P = { x: number; y: number };

type Arrow = {
  path: SVGPathElement;
  head: SVGPolygonElement;
};

/** 화살표 하나가 어떻게 놓이나. 장면의 링크에서 셈해진다. */
type Shape = {
  tail: P;
  ctrl: P;
  tip: P;
  /** 어디에도 닿지 않은 화살표는 속이 빈 촉으로 그것을 말한다. */
  hollow: boolean;
  /** 이번에 고쳐 쓴 화살표인가. 처음부터 있던 것과 색이 갈린다. */
  accent: boolean;
};

/**
 * 자리 셈에 필요한 것들. 장면은 좌표를 모르므로 (S-piece) 여기서 역산한다.
 *
 * 걸음마다 다시 셈한다 — 마디의 수와 순서만 있으면 나오므로 쥐고 있을 까닭이 없다.
 */
type Geom = {
  /** 줄에 선 마디의 왼쪽 끝. */
  x: number[];
  /** 마디 id → 줄에서의 자리. 줄 밖 마디는 들어 있지 않다. */
  at: Map<string, number>;
  /** next 를 고쳐 쓰는 마디의 자리. */
  anchorAt: number;
  /** 줄 밖 마디의 왼쪽 끝. */
  stageX: number;
  /** 사슬 끝의 null 표식이 받는 자리. */
  nullTip: P;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function textEl(attrs: Record<string, string | number>, content: string): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpP(a: P, b: P, t: number): P {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** 2차 베지어 위의 점. */
function quadAt(p0: P, c: P, p1: P, t: number): P {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

// window 경유로 부르면 반환형이 number 로 통일돼 캐스팅이 필요 없다 (C9).
const schedule = (fn: () => void): number =>
  typeof requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(() => fn())
    : window.setTimeout(fn, 16);

const unschedule = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
  else window.clearTimeout(id);
};

// ── 자리 셈 ──────────────────────────────────────────────────────────────
//
// 장면은 자리를 모른다. 마디의 수와 순서가 줄의 폭을 정하고, 남는 폭은 좌우로
// 고르게 나눈다. 줄 밖 마디는 고쳐 쓸 화살표의 두 끝 사이에 선다.

function buildGeom(s: RelinkInsertScene): Geom | null {
  const n = s.nodes.length;
  if (n < 2) return null;
  const span = n * NODE_W + (n - 1) * GAP + NULL_SPAN;
  const startX = Math.round((W - span) / 2);
  const x = s.nodes.map((_, i) => startX + i * (NODE_W + GAP));
  const at = new Map<string, number>();
  for (let i = 0; i < n; i += 1) at.set(s.nodes[i].id, i);

  const found = at.get(s.anchorId);
  // 마지막 마디 뒤에 넣는 배치는 이 그림이 말하려는 장면이 아니다 — 앞으로 당긴다.
  const anchorAt = found !== undefined && found < n - 1 ? found : 0;

  const lastRight = x[n - 1] + NODE_W;
  return {
    x,
    at,
    anchorAt,
    stageX: Math.round((x[anchorAt] + NODE_W + x[anchorAt + 1]) / 2 - NODE_W / 2),
    nullTip: { x: lastRight + 15, y: ROW_CY },
  };
}

/** next 포인터가 사는 자리 — 화살표는 언제나 여기서 출발한다. */
const rowTail = (g: Geom, i: number): P => ({ x: g.x[i] + NODE_W, y: ROW_CY });
/** 줄에 선 마디의 왼쪽 옆구리 — 화살촉이 닿기 직전. */
const rowTip = (g: Geom, j: number): P => ({ x: g.x[j] - TIP_GAP, y: ROW_CY });
const rowCenter = (g: Geom, i: number): P => ({ x: g.x[i] + NODE_W / 2, y: ROW_CY });
const midCtrl = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: ROW_CY });

/** 아래 줄 마디의 좌표들 — 화살표가 오가는 세 지점. */
const stageTop = (g: Geom): P => ({ x: g.stageX + NODE_W / 2, y: STAGE_Y - TIP_GAP });
const stageOut = (g: Geom): P => ({ x: g.stageX + NODE_W, y: STAGE_CY });
const stageCenter = (g: Geom): P => ({ x: g.stageX + NODE_W / 2, y: STAGE_CY });
/** 떼어 낸 화살표 끝이 잠시 걸려 있는 허공. */
const looseTip = (g: Geom, i: number): P => ({ x: rowTail(g, i).x + 47, y: ROW_CY + 19 });
const looseCtrl = (g: Geom, i: number): P => ({ x: rowTail(g, i).x + 24, y: ROW_CY + 5 });
/** 붙을 때의 곡선 제어점 — 아래로 휘어 내려간다. */
const downCtrl = (g: Geom, i: number): P => ({ x: rowTail(g, i).x + 8, y: ROW_CY + 42 });
/** 줄 밖 마디의 화살표가 뒤 마디의 배 밑으로 올라가 닿는 지점. */
const stageLinkTip = (g: Geom, j: number): P => ({
  x: g.x[j] + NODE_W / 2,
  y: ROW_Y + NODE_H + 8,
});
const stageLinkCtrl = (g: Geom): P => ({ x: stageOut(g).x + 25, y: STAGE_CY - 8 });

/**
 * 줄에 선 마디 하나의 화살표가 어떻게 놓이나.
 *
 * 이것이 이 파일의 중심이다 — 링크라는 **구조**만 보고 곡선과 촉을 셈한다. 그래서
 * 어느 걸음에서 오든, 앞 화면이 무엇이었든 같은 그림이 나온다.
 */
function rowShape(g: Geom, s: RelinkInsertScene, i: number, link: RelinkLink): Shape | null {
  const tail = rowTail(g, i);
  switch (link.kind) {
    case 'end': {
      const tip = g.nullTip;
      return { tail, ctrl: midCtrl(tail, tip), tip, hollow: false, accent: false };
    }
    case 'loose':
      return { tail, ctrl: looseCtrl(g, i), tip: looseTip(g, i), hollow: true, accent: true };
    case 'absent':
      return null;
    case 'to': {
      const j = g.at.get(link.id);
      if (j !== undefined) {
        const tip = rowTip(g, j);
        return { tail, ctrl: midCtrl(tail, tip), tip, hollow: false, accent: false };
      }
      // 줄 밖 마디를 가리킨다 — 아래로 휘어 내려가 그 머리에 닿는다.
      if (s.incoming !== null && link.id === s.incoming.id) {
        return { tail, ctrl: downCtrl(g, i), tip: stageTop(g), hollow: false, accent: true };
      }
      return null;
    }
  }
}

/** 줄 밖 마디의 화살표. 뒤 마디의 배 밑으로 올라가 닿는다. */
function stageShape(g: Geom, link: RelinkLink): Shape | null {
  if (link.kind !== 'to') return null;
  const j = g.at.get(link.id);
  if (j === undefined) return null;
  return {
    tail: stageOut(g),
    ctrl: stageLinkCtrl(g),
    tip: stageLinkTip(g, j),
    hollow: false,
    accent: true,
  };
}

/**
 * 사슬을 처음부터 끝까지 따라간 길.
 *
 * 링크를 실제로 밟으므로 "끊었는데 여전히 하나다" 를 **그림이 증명한다** — 훑는
 * 순서를 손으로 적어 두지 않는다.
 */
function chainRoute(g: Geom, s: RelinkInsertScene): { pts: P[]; ctrls: P[] } {
  const pts: P[] = [];
  const ctrls: P[] = [];
  const first = s.nodes[0];
  if (first === undefined) return { pts, ctrls };

  pts.push(rowCenter(g, 0));
  let cur: string = first.id;
  // 링크가 돌아 들어가도 멈추게 한다 — 장면은 순수 자료라 무엇이든 담길 수 있다.
  const limit = s.nodes.length + 2;
  for (let hop = 0; hop < limit; hop += 1) {
    const link = s.links[cur];
    if (link === undefined) break;
    const fromRow = g.at.get(cur);

    if (link.kind === 'to') {
      const j = g.at.get(link.id);
      if (j !== undefined) {
        ctrls.push(
          fromRow === undefined ? stageLinkCtrl(g) : midCtrl(rowTail(g, fromRow), rowTip(g, j)),
        );
        pts.push(rowCenter(g, j));
        cur = link.id;
        continue;
      }
      if (s.incoming !== null && link.id === s.incoming.id && fromRow !== undefined) {
        ctrls.push(downCtrl(g, fromRow));
        pts.push(stageCenter(g));
        cur = link.id;
        continue;
      }
      break;
    }

    if (link.kind === 'end') {
      const last = pts[pts.length - 1];
      ctrls.push({ x: (last.x + g.nullTip.x) / 2, y: ROW_CY });
      pts.push(g.nullTip);
    }
    // end · loose · absent — 사슬은 여기서 끝난다.
    break;
  }
  return { pts, ctrls };
}

/**
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면이 말하는 화면을 통째로
 * 세우므로, 되돌릴 명령이 있을 자리가 없다 (S-scene).
 */
export type RelinkStage = ViewInstance & {
  render(
    next: RelinkInsertScene,
    prev: RelinkInsertScene | null,
    opts: { animate: boolean },
  ): Promise<void>;
};

export const relinkStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;

    // 층은 mount 에서 한 번 세운다. 걸음마다 비워지는 것은 그 안이다.
    const edgeLayer = el('g', {});
    const nodeLayer = el('g', {});
    const markLayer = el('g', {});
    const textLayer = el('g', {});
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(markLayer);
    svg.appendChild(textLayer);

    const caption = textEl(
      {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      },
      '',
    );
    const tally = textEl(
      {
        x: W / 2,
        y: TALLY_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      },
      '',
    );
    textLayer.appendChild(caption);
    textLayer.appendChild(tally);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 깨어난 운동이 다음 세대의 화면에 손대지 않게 하는 빗장이다 — 되짚기가
     * 기다리던 것을 깨우면 그 뒷처리가 곧바로 이어 돌기 때문이다. scene 경로에서는
     * 러너가 `isInstant` 를 거치지 않고 `render` 를 부르는 길이 있어, 실효 장치는
     * `opts.animate` 검사와 이 빗장 둘이다.
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 이 조각의 운동은 프레임마다 화살표의 `d` 를 고쳐 쓰는 짜임이라, 되짚기가
     * 화면을 새로 세운 뒤에도 앞 걸음의 운동이 살아 있으면 옛 값이 덮인다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);

    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 와 같은 모양).
    params.onScrubStart?.(() => {
      gen += 1;
      for (const id of frames) unschedule(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    /**
     * 프레임마다 `apply` 를 부르며 `dur` 동안 흐른다.
     *
     * 되짚는 중이거나 세대가 끊기면 곧바로 접는다 — 되짚기 경로에서는 프레임을
     * 하나도 남기지 않아야 한다 (S-scene).
     */
    function animate(dur: number, myGen: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || isInstant() || dur <= 0) {
          resolve();
          return;
        }
        const t0 = now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);

        const tick = (): void => {
          if (!alive(myGen) || isInstant()) {
            finish();
            return;
          }
          const raw = Math.min(1, (now() - t0) / dur);
          apply(easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          queue();
        };
        const queue = (): void => {
          const id = schedule(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        queue();
      });
    }

    // ── 화살표 ────────────────────────────────────────────────────────────
    function makeArrow(): Arrow {
      const path = el('path', { fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' });
      const head = el('polygon', { 'stroke-width': 2, 'stroke-linejoin': 'round' });
      edgeLayer.appendChild(path);
      edgeLayer.appendChild(head);
      return { path, head };
    }

    function setArrow(a: Arrow, tail: P, ctrl: P, tip: P): void {
      a.path.setAttribute('d', `M ${tail.x} ${tail.y} Q ${ctrl.x} ${ctrl.y} ${tip.x} ${tip.y}`);
      const ang = Math.atan2(tip.y - ctrl.y, tip.x - ctrl.x);
      const len = 10;
      const spread = 0.42;
      const p2 = { x: tip.x - len * Math.cos(ang - spread), y: tip.y - len * Math.sin(ang - spread) };
      const p3 = { x: tip.x - len * Math.cos(ang + spread), y: tip.y - len * Math.sin(ang + spread) };
      a.head.setAttribute('points', `${tip.x},${tip.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`);
    }

    /** hollow = 어디에도 닿지 않은 화살표. 속이 빈 촉으로 "떨어져 있음" 을 말한다. */
    function paintArrow(a: Arrow, accent: boolean, hollow: boolean): void {
      const color = accent ? colors.accent : colors.border;
      a.path.setAttribute('stroke', color);
      a.head.setAttribute('stroke', color);
      a.head.setAttribute('fill', hollow ? 'none' : color);
    }

    /** 모양대로 세운 화살표 하나. */
    function drawArrow(shape: Shape): Arrow {
      const a = makeArrow();
      setArrow(a, shape.tail, shape.ctrl, shape.tip);
      paintArrow(a, shape.accent, shape.hollow);
      return a;
    }

    // ── 마디 ──────────────────────────────────────────────────────────────
    function nodeGroup(node: RelinkSceneNode, x: number, y: number, incoming: boolean): SVGGElement {
      const g = el('g', {});
      const box = el('rect', {
        x,
        y,
        width: NODE_W,
        height: NODE_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: incoming ? colors.itemActive : colors.border,
        'stroke-width': incoming ? 2 : 1.5,
      });
      const value = textEl(
        {
          x: x + NODE_W / 2,
          y: y + NODE_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: colors.text,
        },
        String(node.value),
      );
      // 이름표는 줄에 선 마디는 위, 아래 줄 마디는 왼쪽에 둔다 — 아래 줄 마디의
      // 머리 위는 화살표가 내려와 앉는 자리다.
      const name = incoming
        ? textEl(
            {
              x: x - 9,
              y: y + NODE_H / 2 + 4,
              'text-anchor': 'end',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            node.id,
          )
        : textEl(
            {
              x: x + NODE_W / 2,
              y: y - 10,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            node.id,
          );
      // next 포인터가 사는 자리. 화살표는 언제나 여기서 출발한다.
      const slot = el('circle', {
        cx: x + NODE_W,
        cy: y + NODE_H / 2,
        r: 3.5,
        fill: colors.textMuted,
      });
      g.appendChild(box);
      g.appendChild(value);
      g.appendChild(name);
      g.appendChild(slot);
      nodeLayer.appendChild(g);
      return g;
    }

    /** 화살표가 떨어져 나간 자리에 남는 빈 고리. */
    function makeLooseRing(g: Geom, i: number): SVGCircleElement {
      const anchorOfRing = i + 1 < g.x.length ? rowTip(g, i + 1) : g.nullTip;
      const ring = el('circle', {
        cx: anchorOfRing.x + 1,
        cy: ROW_CY,
        r: 5,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1.5,
        'stroke-dasharray': '2 2',
      });
      markLayer.appendChild(ring);
      return ring;
    }

    // ── 문안 ──────────────────────────────────────────────────────────────
    //
    // 장면은 무엇을 말할지와 그 인자만 담는다. 문자는 여기서 만든다 (C10).
    function captionText(c: RelinkCaption | null): string {
      if (c === null) return '';
      switch (c.kind) {
        case 'chain':
          return tr(
            'caption.chain',
            'Three boxes in a row. The arrows, not the boxes, set the order.',
          );
        case 'staged':
          return tr('caption.staged', 'A new box holding {value} waits below, linked to nothing yet.', {
            value: c.value,
          });
        case 'attachNew':
          return tr('caption.attachNew', "First, point {source}'s next at {target}.", {
            source: c.source,
            target: c.target,
          });
        case 'detach':
          return tr(
            'caption.detach',
            "Now unhook {source}'s next from {target}. For a moment it points nowhere.",
            { source: c.source, target: c.target },
          );
        case 'attachBack':
          return tr('caption.attachBack', 'Drop that same arrow onto {target}. The tail never left {source}.', {
            source: c.source,
            target: c.target,
          });
        case 'done':
          return tr('caption.done', 'Inserted — and every box sits exactly where it sat.');
      }
    }

    function tallyText(t: RelinkTally | null): string {
      if (t === null) return '';
      return tr('label.tally', 'Arrows rewritten: {rewires} · Boxes moved: {moves}', {
        rewires: t.rewires,
        moves: t.moves,
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────
    //
    // 늘 비우고 시작해 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않으므로
    // 되돌릴 명령이 있을 자리가 없다.

    /** 걸음마다 다시 만들어지는 것들. 장면에서 셈해 세우므로 쥔 상태가 아니다. */
    let geom: Geom | null = null;
    let rowArrows: (Arrow | null)[] = [];
    let stageArrow: Arrow | null = null;
    let stageGroup: SVGGElement | null = null;

    function clearLayers(): void {
      while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
      while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
      while (markLayer.firstChild) markLayer.removeChild(markLayer.firstChild);
      rowArrows = [];
      stageArrow = null;
      stageGroup = null;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function stand(s: RelinkInsertScene): void {
      clearLayers();
      caption.textContent = captionText(s.caption);
      tally.textContent = tallyText(s.tally);

      const g = buildGeom(s);
      geom = g;
      if (g === null) return;

      // 줄 끝의 null — 사슬이 어디서 끝나는지 말해 주는 표식.
      markLayer.appendChild(
        textEl(
          {
            x: g.x[g.x.length - 1] + NODE_W + NULL_SPAN - 14,
            y: ROW_CY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          MARK_NULL,
        ),
      );
      // 움직일 화살표가 무엇인지 한 번만 이름 붙인다.
      markLayer.appendChild(
        textEl(
          {
            x: rowTail(g, g.anchorAt).x + 7,
            y: ROW_CY - 9,
            'text-anchor': 'start',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          MARK_NEXT,
        ),
      );

      rowArrows = s.nodes.map((node, i) => {
        const link = s.links[node.id];
        if (link === undefined) return null;
        // 떨어져 나간 자리에는 빈 고리가 남는다 — 머무는 강조라 정적으로도 그린다.
        if (link.kind === 'loose') makeLooseRing(g, i);
        const shape = rowShape(g, s, i, link);
        return shape === null ? null : drawArrow(shape);
      });

      for (let i = 0; i < s.nodes.length; i += 1) nodeGroup(s.nodes[i], g.x[i], ROW_Y, false);

      const inc = s.incoming;
      if (inc !== null && s.staged) {
        stageGroup = nodeGroup(inc, g.stageX, STAGE_Y, true);
        const link = s.links[inc.id];
        const shape = link === undefined ? null : stageShape(g, link);
        stageArrow = shape === null ? null : drawArrow(shape);
      }
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 다섯 다 출발 그림을 **장면과 걸음의 계기값에서 스스로 셈해** 물린 뒤 흐른다.
    // 앞 장면을 들추지 않으므로 걸음을 건너뛰어 와도 그림이 어긋나지 않는다.
    // 물리는 일은 `stand` 직후 아직 어떤 기다림도 지나지 않은 동안 하므로 첫
    // 프레임에 끝 자리가 번쩍이지 않는다.

    /** 줄 밖 마디가 아래에서 올라와 선다. */
    async function runEnter(myGen: number): Promise<void> {
      const g = stageGroup;
      if (g === null) return;
      const from = NODE_H - 6;
      g.setAttribute('transform', `translate(0 ${from})`);
      g.setAttribute('opacity', '0');
      await animate(ENTER_MS, myGen, (t) => {
        g.setAttribute('transform', `translate(0 ${lerp(from, 0, t)})`);
        g.setAttribute('opacity', String(Math.min(1, t * 1.6)));
      });
    }

    /** 줄 밖 마디의 화살표가 자라 뒤 마디에 닿는다. 끝점이 곡선을 따라 뻗어 나간다. */
    async function runGrow(g: Geom, j: number, myGen: number): Promise<void> {
      const a = stageArrow;
      if (a === null) return;
      const tail = stageOut(g);
      const ctrl = stageLinkCtrl(g);
      const tip = stageLinkTip(g, j);
      // 아직 자라지 않은 길이 0 으로 물린다.
      setArrow(a, tail, tail, tail);
      await animate(GROW_MS, myGen, (t) => {
        // 2차 베지어의 0..t 부분곡선도 2차 — de Casteljau 로 정확히 자른다.
        const cut = lerpP(tail, ctrl, t);
        setArrow(a, tail, cut, quadAt(tail, ctrl, tip, t));
      });
    }

    /**
     * 줄에 선 마디의 화살표 끝이 뒤 마디에서 떨어져 허공에 걸린다.
     *
     * 출발 그림은 "아직 `was` 에 닿아 있던" 모양이다. 걸음이 실어 온 `was` 로
     * 그것을 셈으로 복원한다 — `prev` 를 들추지 않는다 (S-scene).
     */
    async function runDetach(g: Geom, i: number, wasAt: number, myGen: number): Promise<void> {
      const a = rowArrows[i];
      if (a === null || a === undefined) return;
      const tail = rowTail(g, i);
      const fromTip = rowTip(g, wasAt);
      const fromCtrl = midCtrl(tail, fromTip);
      const toCtrl = looseCtrl(g, i);
      const toTip = looseTip(g, i);
      setArrow(a, tail, fromCtrl, fromTip);
      await animate(DETACH_MS, myGen, (t) => {
        setArrow(a, tail, lerpP(fromCtrl, toCtrl, t), lerpP(fromTip, toTip, t));
      });
    }

    /**
     * 그 화살표가 아래 줄 마디의 머리에 내려앉는다. 꼬리는 한 번도 움직이지 않았다.
     *
     * 출발 그림은 허공에 걸려 있던 모양이고, 그 자리는 마디의 자리에서 나온다.
     * 떨어져 있던 동안의 빈 고리도 이 걸음 동안만 다시 세운다 — 끝나면 링크가
     * 이어지므로 장면에는 없는 것이다.
     */
    async function runLand(g: Geom, i: number, myGen: number): Promise<void> {
      const a = rowArrows[i];
      if (a === null || a === undefined) return;
      const tail = rowTail(g, i);
      const fromCtrl = looseCtrl(g, i);
      const fromTip = looseTip(g, i);
      const toCtrl = downCtrl(g, i);
      const toTip = stageTop(g);
      setArrow(a, tail, fromCtrl, fromTip);
      paintArrow(a, true, true);
      const ring = makeLooseRing(g, i);
      await animate(ATTACH_MS, myGen, (t) => {
        setArrow(a, tail, lerpP(fromCtrl, toCtrl, t), lerpP(fromTip, toTip, t));
      });
      ring.remove();
    }

    /** 이어진 사슬을 점 하나가 처음부터 끝까지 훑는다 — 끊었는데 여전히 하나다. */
    async function runTrace(g: Geom, s: RelinkInsertScene, myGen: number): Promise<void> {
      const route = chainRoute(g, s);
      const legs = route.pts.length - 1;
      if (legs < 1) return;
      const dot = el('circle', {
        cx: route.pts[0].x,
        cy: route.pts[0].y,
        r: 5,
        fill: colors.success,
      });
      markLayer.appendChild(dot);
      // 집계는 다 훑고 난 뒤에 남는다. 되돌리는 것은 뒤따르는 `stand` 다.
      tally.textContent = '';
      await animate(TRACE_MS, myGen, (t) => {
        const pos = Math.min(legs - 1e-6, t * legs);
        const leg = Math.floor(pos);
        const p = quadAt(route.pts[leg], route.ctrls[leg], route.pts[leg + 1], pos - leg);
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
      });
      dot.remove();
    }

    /** 방금 밟은 걸음 하나만 흐르게 한다. */
    async function flow(s: RelinkInsertScene, step: RelinkStep, myGen: number): Promise<void> {
      const g = geom;
      if (g === null) return;
      switch (step.kind) {
        case 'enter':
          await runEnter(myGen);
          return;
        case 'grow': {
          const j = g.at.get(step.to);
          if (j === undefined) return;
          await runGrow(g, j, myGen);
          return;
        }
        case 'detach': {
          const i = g.at.get(step.from);
          const wasAt = g.at.get(step.was);
          if (i === undefined || wasAt === undefined) return;
          await runDetach(g, i, wasAt, myGen);
          return;
        }
        case 'land': {
          const i = g.at.get(step.from);
          if (i === undefined) return;
          await runLand(g, i, myGen);
          return;
        }
        case 'trace':
          await runTrace(g, s, myGen);
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
     * 부동소수 꼬리 하나가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게
     * 하기 때문이다. 사이에 프레임이 없어 같은 그림이 다시 그려질 뿐이다.
     */
    async function render(
      next: RelinkInsertScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: RelinkInsertScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      stand(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step === null) return;
      await flow(next, step, myGen);
      if (alive(myGen)) stand(next);
    }

    const instance: RelinkStage = {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) unschedule(id); // 걸어 둔 것을 먼저 거두고
        frames.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        if (svg.parentElement) svg.remove();
      },
    };

    return instance;
  },
};
