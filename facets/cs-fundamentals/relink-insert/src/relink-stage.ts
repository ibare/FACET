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
 * 있고, 끝이 B 에서 떨어져 (link-detached) 허공에 걸렸다가 X 로 내려가 붙는다
 * (link-attached). 색 전환이 아니라 좌표가 실제로 이동한다.
 *
 * 화면 문자 중 sentence 는 하나도 여기 없다 — 캡션 · 각주 · 집계는 projector 가
 * tr 로 해석해 넘긴다 (C10). 여기 남는 리터럴은 `next` / `null` 처럼 도식에
 * 각인된 표식뿐이다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type View,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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

export type RelinkStageNode = { id: string; value: number };

export type RelinkStageSpec = {
  /** 줄에 서 있는 노드들. 순서가 곧 화살표 순서다. */
  nodes: RelinkStageNode[];
  /** 줄 아래에서 기다리는 노드. */
  incoming: RelinkStageNode;
  /** 화살표를 떼어 낼 노드의 id. */
  insertAfter: string;
  /** 전제 각주. 저작자 문안이라 projector 가 해석해 넘긴다. */
};

type P = { x: number; y: number };

type Arrow = {
  path: SVGPathElement;
  head: SVGPolygonElement;
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

export const relinkStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const colors = getColors(params.theme);

    container.style.display = 'flex';
    container.style.justifyContent = 'center';

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
    });
    svg.style.width = '100%';
    svg.style.maxWidth = `${W}px`;
    svg.style.height = 'auto';
    container.appendChild(svg);

    const edgeLayer = el('g', {});
    const nodeLayer = el('g', {});
    const markLayer = el('g', {});
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(markLayer);

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
    markLayer.appendChild(caption);
    markLayer.appendChild(tally);

    // ── 애니메이션 —————————————————————————————————————————————
    let rafId = 0;
    let abort: (() => void) | null = null;
    let dead = false;

    function animate(dur: number, apply: (t: number) => void): Promise<void> {
      abort?.();
      return new Promise<void>((resolve) => {
        if (dead || dur <= 0) {
          apply(1);
          resolve();
          return;
        }
        const t0 = now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          abort = null;
          resolve();
        };
        abort = () => {
          unschedule(rafId);
          apply(1);
          finish();
        };
        const tick = (): void => {
          if (dead) {
            finish();
            return;
          }
          const raw = Math.min(1, (now() - t0) / dur);
          apply(easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          rafId = schedule(tick);
        };
        rafId = schedule(tick);
      });
    }

    // ── 화살표 —————————————————————————————————————————————————
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
    function paintArrow(a: Arrow, color: string, hollow: boolean): void {
      a.path.setAttribute('stroke', color);
      a.head.setAttribute('stroke', color);
      a.head.setAttribute('fill', hollow ? 'none' : color);
    }

    function showArrow(a: Arrow, visible: boolean): void {
      a.path.style.display = visible ? '' : 'none';
      a.head.style.display = visible ? '' : 'none';
    }

    // ── 레이아웃 (init 에서 채워진다) ————————————————————————————
    let spec: RelinkStageSpec | null = null;
    let mainX: number[] = [];
    let anchorAt = 0;
    let stageX = 0;
    let nullTip: P = { x: 0, y: ROW_CY };
    let mainArrows: Arrow[] = [];
    let stageArrow: Arrow | null = null;
    let stageGroup: SVGGElement | null = null;
    let looseRing: SVGCircleElement | null = null;
    let traceDot: SVGCircleElement | null = null;

    const mainTail = (i: number): P => ({ x: mainX[i] + NODE_W, y: ROW_CY });
    const mainTip = (i: number): P =>
      i + 1 < mainX.length ? { x: mainX[i + 1] - TIP_GAP, y: ROW_CY } : nullTip;
    const mainCtrl = (i: number): P => {
      const a = mainTail(i);
      const b = mainTip(i);
      return { x: (a.x + b.x) / 2, y: ROW_CY };
    };

    /** 아래 줄 노드의 좌표들 — 화살표가 오가는 세 지점. */
    const stageTop = (): P => ({ x: stageX + NODE_W / 2, y: STAGE_Y - TIP_GAP });
    const stageOut = (): P => ({ x: stageX + NODE_W, y: STAGE_CY });
    const stageCenter = (): P => ({ x: stageX + NODE_W / 2, y: STAGE_CY });
    /** 떼어 낸 화살표 끝이 잠시 걸려 있는 허공. */
    const looseTip = (): P => ({ x: mainTail(anchorAt).x + 47, y: ROW_CY + 19 });
    const looseCtrl = (): P => ({ x: mainTail(anchorAt).x + 24, y: ROW_CY + 5 });
    /** 붙을 때의 곡선 제어점 — 아래로 휘어 내려간다. */
    const downCtrl = (): P => ({ x: mainTail(anchorAt).x + 8, y: ROW_CY + 42 });
    /** X 의 화살표가 뒤 노드의 배 밑으로 올라가 닿는 지점. */
    const stageLinkTip = (): P => ({ x: mainX[anchorAt + 1] + NODE_W / 2, y: ROW_Y + NODE_H + 8 });
    const stageLinkCtrl = (): P => ({ x: stageOut().x + 25, y: STAGE_CY - 8 });

    function nodeGroup(node: RelinkStageNode, x: number, y: number, incoming: boolean): SVGGElement {
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
      // 이름표는 줄에 선 노드는 위, 아래 줄 노드는 왼쪽에 둔다 — 아래 줄 노드의
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

    function clearLayers(): void {
      while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
      while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
      for (const node of Array.from(markLayer.childNodes)) {
        if (node !== caption && node !== tally) markLayer.removeChild(node);
      }
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    /** 처음 상태로 되돌린다. 애니메이션 없이 즉시 — 되감기는 걸음이 아니다. */
    function resetVisual(): void {
      abort?.();
      for (let i = 0; i < mainArrows.length; i++) {
        const a = mainArrows[i];
        setArrow(a, mainTail(i), mainCtrl(i), mainTip(i));
        paintArrow(a, colors.border, false);
        showArrow(a, true);
      }
      if (stageArrow) showArrow(stageArrow, false);
      if (stageGroup) {
        stageGroup.setAttribute('transform', `translate(0 ${NODE_H - 6})`);
        stageGroup.setAttribute('opacity', '0');
      }
      if (looseRing) looseRing.setAttribute('opacity', '0');
      if (traceDot) traceDot.setAttribute('opacity', '0');
      tally.textContent = '';
    }

    function init(next: RelinkStageSpec): void {
      spec = next;
      clearLayers();
      mainArrows = [];

      const n = next.nodes.length;
      const span = n * NODE_W + (n - 1) * GAP + NULL_SPAN;
      const startX = Math.round((W - span) / 2);
      mainX = next.nodes.map((_, i) => startX + i * (NODE_W + GAP));
      const found = next.nodes.findIndex((node) => node.id === next.insertAfter);
      // 마지막 노드 뒤에 넣는 배치는 이 조각이 말하려는 장면이 아니다 — 앞으로 당긴다.
      anchorAt = found >= 0 && found < n - 1 ? found : 0;
      const lastRight = mainX[n - 1] + NODE_W;
      nullTip = { x: lastRight + 15, y: ROW_CY };
      stageX = Math.round((mainX[anchorAt] + NODE_W + mainX[anchorAt + 1]) / 2 - NODE_W / 2);

      // 줄 끝의 null — 사슬이 어디서 끝나는지 말해 주는 표식.
      markLayer.appendChild(
        textEl(
          {
            x: lastRight + NULL_SPAN - 14,
            y: ROW_CY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          MARK_NULL,
        ),
      );

      for (let i = 0; i < n; i++) mainArrows.push(makeArrow());
      stageArrow = makeArrow();
      paintArrow(stageArrow, colors.accent, false);

      for (let i = 0; i < n; i++) nodeGroup(next.nodes[i], mainX[i], ROW_Y, false);
      stageGroup = nodeGroup(next.incoming, stageX, STAGE_Y, true);

      // 움직일 화살표가 무엇인지 한 번만 이름 붙인다.
      markLayer.appendChild(
        textEl(
          {
            x: mainTail(anchorAt).x + 7,
            y: ROW_CY - 9,
            'text-anchor': 'start',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          MARK_NEXT,
        ),
      );

      // 화살표가 떨어져 나간 자리에 남는 빈 고리.
      looseRing = el('circle', {
        cx: mainTip(anchorAt).x + 1,
        cy: ROW_CY,
        r: 5,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1.5,
        'stroke-dasharray': '2 2',
        opacity: 0,
      });
      markLayer.appendChild(looseRing);

      traceDot = el('circle', { cx: 0, cy: 0, r: 5, fill: colors.success, opacity: 0 });
      markLayer.appendChild(traceDot);

      resetVisual();
      setCaption('');
    }

    // ── projector 가 부르는 표면 ————————————————————————————————
    function showChain(text: string): void {
      resetVisual();
      setCaption(text);
    }

    async function stageNode(text: string): Promise<void> {
      setCaption(text);
      const g = stageGroup;
      if (!g) return;
      const from = NODE_H - 6;
      await animate(ENTER_MS, (t) => {
        g.setAttribute('transform', `translate(0 ${lerp(from, 0, t)})`);
        g.setAttribute('opacity', String(Math.min(1, t * 1.6)));
      });
    }

    /** X 의 화살표가 자라 뒤 노드에 닿는다. 끝점이 곡선을 따라 뻗어 나간다. */
    async function growStageEdge(text: string): Promise<void> {
      setCaption(text);
      const a = stageArrow;
      if (!a) return;
      const tail = stageOut();
      const ctrl = stageLinkCtrl();
      const tip = stageLinkTip();
      showArrow(a, true);
      await animate(GROW_MS, (t) => {
        // 2차 베지어의 0..t 부분곡선도 2차 — de Casteljau 로 정확히 자른다.
        const cut = lerpP(tail, ctrl, t);
        setArrow(a, tail, cut, quadAt(tail, ctrl, tip, t));
      });
    }

    /** A 의 화살표 끝이 뒤 노드에서 떨어져 허공에 걸린다. */
    async function detachEdge(text: string): Promise<void> {
      setCaption(text);
      const a = mainArrows[anchorAt];
      if (!a) return;
      paintArrow(a, colors.accent, true);
      const tail = mainTail(anchorAt);
      const fromCtrl = mainCtrl(anchorAt);
      const fromTip = mainTip(anchorAt);
      const toCtrl = looseCtrl();
      const toTip = looseTip();
      looseRing?.setAttribute('opacity', '1');
      await animate(DETACH_MS, (t) => {
        setArrow(a, tail, lerpP(fromCtrl, toCtrl, t), lerpP(fromTip, toTip, t));
      });
    }

    /** 그 화살표가 아래 줄 노드의 머리에 내려앉는다. 꼬리는 한 번도 움직이지 않았다. */
    async function landEdge(text: string): Promise<void> {
      setCaption(text);
      const a = mainArrows[anchorAt];
      if (!a) return;
      const tail = mainTail(anchorAt);
      const fromCtrl = looseCtrl();
      const fromTip = looseTip();
      const toCtrl = downCtrl();
      const toTip = stageTop();
      await animate(ATTACH_MS, (t) => {
        setArrow(a, tail, lerpP(fromCtrl, toCtrl, t), lerpP(fromTip, toTip, t));
      });
      paintArrow(a, colors.accent, false);
      looseRing?.setAttribute('opacity', '0');
    }

    /** 이어진 사슬을 점 하나가 처음부터 끝까지 훑는다 — 끊었는데 여전히 하나다. */
    async function finish(text: string, tallyText: string): Promise<void> {
      setCaption(text);
      const dot = traceDot;
      if (!spec || !dot) return;

      const order: P[] = [];
      const ctrls: P[] = [];
      for (let i = 0; i <= anchorAt; i++) {
        order.push({ x: mainX[i] + NODE_W / 2, y: ROW_CY });
        if (i < anchorAt) ctrls.push(mainCtrl(i));
      }
      ctrls.push(downCtrl());
      order.push(stageCenter());
      ctrls.push(stageLinkCtrl());
      for (let i = anchorAt + 1; i < mainX.length; i++) {
        order.push({ x: mainX[i] + NODE_W / 2, y: ROW_CY });
        if (i < mainX.length - 1) ctrls.push(mainCtrl(i));
      }
      order.push(nullTip);
      ctrls.push({ x: (order[order.length - 2].x + nullTip.x) / 2, y: ROW_CY });

      const legs = order.length - 1;
      dot.setAttribute('opacity', '1');
      await animate(TRACE_MS, (t) => {
        const pos = Math.min(legs - 1e-6, t * legs);
        const leg = Math.floor(pos);
        const p = quadAt(order[leg], ctrls[leg], order[leg + 1], pos - leg);
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
      });
      dot.setAttribute('opacity', '0');
      tally.textContent = tallyText;
    }

    function rewind(): void {
      resetVisual();
      setCaption('');
    }

    function destroy(): void {
      dead = true;
      abort?.();
      unschedule(rafId);
      if (svg.parentElement) svg.remove();
    }

    return {
      init,
      showChain,
      stageNode,
      growStageEdge,
      detachEdge,
      landEdge,
      finish,
      rewind,
      destroy,
    };
  },
};
