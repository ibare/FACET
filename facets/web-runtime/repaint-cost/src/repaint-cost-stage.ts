/**
 * repaint-cost 의 stage — 페이지 장(문서 흐름)과 도는 단계 표시등을 그린다.
 *
 * @notation native — 여기 그려지는 낱말(header/intro/card/card-title/card-text/list/footer/badge/page,
 * display/height/color/transform, style/layout/paint/composite)은 실제 HTML 태그·CSS 속성·렌더링
 * 파이프라인 단계 이름 그 자체다. 번역하지 않는다.
 *
 * 운동 — 손잡이를 돌리면:
 *   - `property` 가 display→height→color→transform 으로 내려가며 도는 단계 표시등이 하나씩 꺼지고
 *     (더 짧은 사슬만 켠다), 다시 칠해진 요소가 하나씩 빛나는 수가 줄어든다.
 *   - display: card 가 실제로 높이 0 으로 줄어들며(운동) 사라지고, list·footer 가 그 자리로
 *     미끄러져 올라온다.
 *   - height: card 가 실제로 자라고(운동), list·footer 가 미끄러져 내려간다.
 *   - transform: card(와 자식)가 실제로 옆으로 미끄러진다(운동). `cardLayer` 가 제 장이면 다시
 *     칠하기 표시등 없이 미끄러지기만 한다("깜빡임 없이").
 * 길이는 `runtime.getSpeed()` 를 매 호출에서 다시 읽어 맞춘다(projector 가 넘겨준다).
 */
import type { CanvasView, Palette, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';
import type { Rect, RepaintCostData, RoundSummary, Stage } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CANVAS_W = 460;
const CANVAS_H = 560;
const FLOW_X = 80; // 300 짜리 문서 흐름 열의 왼쪽 x
const FLOW_TOP = 150; // 문서 흐름 첫 요소(header)의 top
const BASE_TWEEN_MS = 400;
const FLASH_MS = 260;

const STAGES: readonly Stage[] = ['style', 'layout', 'paint', 'composite'];
const STAGE_X: Record<Stage, number> = { style: 100, layout: 200, paint: 300, composite: 400 };

type El = { rect: SVGRectElement; text: SVGTextElement };

export type RepaintCostStageInstance = ViewInstance & {
  resetRound(property: number, cardLayer: number): void;
  runStyle(speed: number): void;
  runLayout(rects: Record<string, Rect>, removed: string[], speed: number): void;
  runPaint(id: string, speed: number): void;
  runComposite(dx: number, summary: RoundSummary, speed: number): void;
};

function dur(speed: number): number {
  return Math.max(50, BASE_TWEEN_MS / Math.max(0.01, speed));
}

function makeBox(svg: SVGSVGElement, palette: Palette, label: string): El {
  const rect = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
  rect.setAttribute('rx', '4');
  rect.setAttribute('fill', palette.itemDefault);
  rect.setAttribute('stroke', palette.border);
  rect.setAttribute('stroke-width', '1');
  const text = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  text.setAttribute('font-family', fonts.mono);
  text.setAttribute('font-size', fontSizes.xs);
  text.setAttribute('fill', palette.text);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = label;
  svg.appendChild(rect);
  svg.appendChild(text);
  return { rect, text };
}

function placeBox(box: El, r: Rect, transition: string): void {
  box.rect.style.transition = transition;
  box.rect.setAttribute('x', String(FLOW_X + r.x));
  box.rect.setAttribute('y', String(FLOW_TOP + r.y));
  box.rect.setAttribute('width', String(r.w));
  box.rect.setAttribute('height', String(Math.max(0, r.h)));
  box.text.style.transition = transition;
  box.text.setAttribute('x', String(FLOW_X + r.x + r.w / 2));
  box.text.setAttribute('y', String(FLOW_TOP + r.y + Math.max(0, r.h) / 2));
  box.text.style.opacity = r.h <= 0 ? '0' : '1';
}

export const repaintCostStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): RepaintCostStageInstance {
    const svg = params.canvas;
    const palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const data = (params.initialData as RepaintCostData | undefined) ?? undefined;

    // ── 도는 단계 표시등
    const lights = new Map<Stage, { circle: SVGCircleElement; label: SVGTextElement }>();
    for (const s of STAGES) {
      const circle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
      circle.setAttribute('cx', String(STAGE_X[s]));
      circle.setAttribute('cy', '36');
      circle.setAttribute('r', '14');
      circle.setAttribute('fill', palette.itemDefault);
      circle.setAttribute('stroke', palette.border);
      circle.style.transition = `fill ${BASE_TWEEN_MS}ms`;
      const label = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
      label.setAttribute('x', String(STAGE_X[s]));
      label.setAttribute('y', '64');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-size', fontSizes.xs);
      label.setAttribute('fill', palette.textMuted);
      label.textContent = s;
      svg.appendChild(circle);
      svg.appendChild(label);
      lights.set(s, { circle, label });
    }
    // ── 캡션 (역할 이름 — messages 를 거친다)
    const cap1 = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    const cap2 = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    const cap3 = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    for (const [i, cap] of [cap1, cap2, cap3].entries()) {
      cap.setAttribute('x', String(FLOW_X));
      cap.setAttribute('y', String(90 + i * 16));
      cap.setAttribute('font-family', fonts.body);
      cap.setAttribute('font-size', fontSizes.sm);
      cap.setAttribute('fill', palette.text);
      svg.appendChild(cap);
    }

    // ── 문서 흐름 요소
    const ids = ['header', 'intro', 'card', 'card-title', 'card-text', 'list', 'footer'];
    const boxes = new Map<string, El>();
    for (const id of ids) boxes.set(id, makeBox(svg, palette, id));
    const badgeBox = makeBox(svg, palette, 'badge');
    badgeBox.rect.setAttribute('fill', palette.itemPivot);
    boxes.set('badge', badgeBox);

    // page — 문서 배경 경계(점선)
    const pageRect = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    pageRect.setAttribute('x', String(FLOW_X - 6));
    pageRect.setAttribute('fill', 'none');
    pageRect.setAttribute('stroke', palette.textMuted);
    pageRect.setAttribute('stroke-dasharray', '4 3');
    pageRect.style.transition = `height ${BASE_TWEEN_MS}ms, stroke ${FLASH_MS}ms`;
    svg.insertBefore(pageRect, svg.firstChild);

    // 제 장(own layer) 표시 — cardLayer=1 일 때 card 뒤에 겹쳐 그리는 점선 상자(장 아이콘)
    const layerBadge = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    layerBadge.setAttribute('rx', '4');
    layerBadge.setAttribute('fill', 'none');
    layerBadge.setAttribute('stroke', palette.accent);
    layerBadge.setAttribute('stroke-dasharray', '3 2');
    layerBadge.style.transition = `x ${BASE_TWEEN_MS}ms, y ${BASE_TWEEN_MS}ms, width ${BASE_TWEEN_MS}ms, height ${BASE_TWEEN_MS}ms`;
    layerBadge.style.visibility = 'hidden';
    svg.appendChild(layerBadge);

    const timers = new Set<ReturnType<typeof setTimeout>>();

    let currentCardLayer = 0;

    function noTransition(run: () => void): void {
      for (const box of boxes.values()) {
        box.rect.style.transition = 'none';
        box.text.style.transition = 'none';
      }
      pageRect.style.transition = 'none';
      layerBadge.style.transition = 'none';
      run();
      // 강제 리플로우 뒤 트랜지션을 되살린다 — 다음 애니메이션은 실제로 tween 한다.
      void svg.getBoundingClientRect();
      for (const box of boxes.values()) {
        box.rect.style.transition = '';
        box.text.style.transition = '';
      }
      pageRect.style.transition = `height ${BASE_TWEEN_MS}ms, stroke ${FLASH_MS}ms`;
      layerBadge.style.transition = `x ${BASE_TWEEN_MS}ms, y ${BASE_TWEEN_MS}ms, width ${BASE_TWEEN_MS}ms, height ${BASE_TWEEN_MS}ms`;
    }

    function baselineRects(): Record<string, Rect> {
      if (!data) return {};
      const w = data.width;
      const hOf = (id: string) => data.elements.find((e) => e.id === id)?.h ?? 0;
      let y = 0;
      const header: Rect = { x: 0, y, w, h: hOf('header') }; y += header.h;
      const intro: Rect = { x: 0, y, w, h: hOf('intro') }; y += intro.h;
      const cardY = y;
      const cardH = hOf('card');
      const card: Rect = { x: 0, y: cardY, w, h: cardH };
      const cardTitle: Rect = { x: 0, y: cardY, w, h: data.cardTitleH };
      const cardText: Rect = { x: 0, y: cardY + data.cardTitleH, w, h: cardH - data.cardTitleH };
      y += cardH;
      const list: Rect = { x: 0, y, w, h: hOf('list') }; y += list.h;
      const footer: Rect = { x: 0, y, w, h: hOf('footer') }; y += footer.h;
      return { header, intro, card, 'card-title': cardTitle, 'card-text': cardText, list, footer, page: { x: 0, y: 0, w, h: y }, badge: data.badge };
    }

    function setPage(r: Rect): void {
      pageRect.setAttribute('y', String(FLOW_TOP + r.y));
      pageRect.setAttribute('width', String(r.w + 12));
      pageRect.setAttribute('height', String(r.h));
    }

    function placeAll(rects: Record<string, Rect>): void {
      for (const [id, box] of boxes) {
        const r = rects[id];
        if (r) placeBox(box, r, box.rect.style.transition);
      }
      const page = rects.page;
      if (page) setPage(page);
    }

    function updateLayerBadge(cardLayer: number, cardRect: Rect | undefined): void {
      if (cardLayer === 1 && cardRect) {
        layerBadge.style.visibility = 'visible';
        layerBadge.setAttribute('x', String(FLOW_X + cardRect.x - 4));
        layerBadge.setAttribute('y', String(FLOW_TOP + cardRect.y - 4));
        layerBadge.setAttribute('width', String(cardRect.w + 8));
        layerBadge.setAttribute('height', String(Math.max(0, cardRect.h) + 8));
      } else {
        layerBadge.style.visibility = 'hidden';
      }
    }

    function lightsOff(): void {
      for (const s of STAGES) {
        lights.get(s)!.circle.setAttribute('fill', palette.itemDefault);
      }
    }

    const instance: RepaintCostStageInstance = {
      resetRound(_property: number, cardLayer: number) {
        currentCardLayer = cardLayer;
        noTransition(() => {
          lightsOff();
          const base = baselineRects();
          placeAll(base);
          updateLayerBadge(cardLayer, base.card);
          pageRect.setAttribute('stroke', palette.textMuted);
        });
        cap1.textContent = '';
        cap2.textContent = '';
        cap3.textContent = '';
      },
      runStyle() {
        lights.get('style')!.circle.setAttribute('fill', palette.primary);
      },
      runLayout(rects, removed, speed) {
        const transition = `x ${dur(speed)}ms, y ${dur(speed)}ms, width ${dur(speed)}ms, height ${dur(speed)}ms, opacity ${dur(speed)}ms`;
        lights.get('layout')!.circle.setAttribute('fill', palette.primary);
        pageRect.style.transition = `height ${dur(speed)}ms, stroke ${FLASH_MS}ms`;
        for (const box of boxes.values()) {
          box.rect.style.transition = transition;
          box.text.style.transition = transition;
        }
        if (removed.length > 0) {
          const cardBox = boxes.get('card')!;
          const cur = { x: Number(cardBox.rect.getAttribute('x')) - FLOW_X, y: Number(cardBox.rect.getAttribute('y')) - FLOW_TOP, w: Number(cardBox.rect.getAttribute('width')), h: 0 };
          placeBox(cardBox, cur, transition);
          placeBox(boxes.get('card-title')!, { ...cur, h: 0 }, transition);
          placeBox(boxes.get('card-text')!, { ...cur, h: 0 }, transition);
          updateLayerBadge(0, undefined);
        }
        if (rects.list) placeBox(boxes.get('list')!, rects.list, transition);
        if (rects.footer) placeBox(boxes.get('footer')!, rects.footer, transition);
        if (rects.card && removed.length === 0) {
          placeBox(boxes.get('card')!, rects.card, transition);
          if (rects['card-title']) placeBox(boxes.get('card-title')!, rects['card-title']!, transition);
          if (rects['card-text']) placeBox(boxes.get('card-text')!, rects['card-text']!, transition);
          updateLayerBadge(currentCardLayer, rects.card);
        }
        if (rects.page) setPage(rects.page);
      },
      runPaint(id, speed) {
        lights.get('paint')!.circle.setAttribute('fill', palette.primary);
        const box = id === 'page' ? undefined : boxes.get(id);
        if (id === 'page') {
          pageRect.setAttribute('stroke', palette.danger);
          const timer = setTimeout(() => {
            pageRect.setAttribute('stroke', palette.textMuted);
            timers.delete(timer);
          }, FLASH_MS);
          timers.add(timer);
          return;
        }
        if (!box) return;
        const prevFill = box.rect.getAttribute('fill') ?? palette.itemDefault;
        box.rect.style.transition = `fill ${Math.min(FLASH_MS, dur(speed))}ms`;
        box.rect.setAttribute('fill', palette.danger);
        const timer = setTimeout(() => {
          box.rect.setAttribute('fill', prevFill);
          timers.delete(timer);
        }, Math.min(FLASH_MS, dur(speed)));
        timers.add(timer);
      },
      runComposite(dx, summary, speed) {
        lights.get('composite')!.circle.setAttribute('fill', palette.primary);
        if (dx !== 0) {
          const transition = `x ${dur(speed)}ms`;
          for (const id of ['card', 'card-title', 'card-text']) {
            const box = boxes.get(id)!;
            box.rect.style.transition = transition;
            box.text.style.transition = transition;
            const x = Number(box.rect.getAttribute('x')) + dx;
            box.rect.setAttribute('x', String(x));
            box.text.setAttribute('x', String(x + Number(box.rect.getAttribute('width')) / 2));
          }
          const cardX = Number(boxes.get('card')!.rect.getAttribute('x')) - FLOW_X;
          const cardY = Number(boxes.get('card')!.rect.getAttribute('y')) - FLOW_TOP;
          const cardW = Number(boxes.get('card')!.rect.getAttribute('width'));
          const cardH = Number(boxes.get('card')!.rect.getAttribute('height'));
          layerBadge.style.transition = transition;
          updateLayerBadge(currentCardLayer, { x: cardX, y: cardY, w: cardW, h: cardH });
        }
        cap1.textContent = t('caption.chain', 'Pipeline: {chain}', { chain: summary.chain });
        cap2.textContent = t(
          'caption.repaint',
          'Render tree Δ{tree} · Remeasured {boxes} · Repainted {count} ({list}) · Layers {layers}',
          {
            tree: summary.renderTreeChange,
            boxes: summary.boxesRemeasured,
            count: summary.repaintedCount,
            list: summary.repaintedList || '—',
            layers: summary.layers,
          },
        );
        cap3.textContent =
          summary.layers > 1
            ? t('caption.layerOwn', 'card has its own compositing layer')
            : t('caption.layerTogether', 'card paints together with the page');
      },
      destroy() {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      },
    };

    if (data) instance.resetRound(data.property, data.cardLayer);
    return instance;
  },
};
