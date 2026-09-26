/**
 * cooperative-yielding-stage — DOM 행 수 · 화면(screen) 행 수 · 클릭 셋의 기다림 ·
 * 지금 도는 코드(native, 손잡이에 따라 두 변형 중 하나)를 그린다.
 *
 * 운동: DOM 막대와 화면 막대는 너비가 CSS transition 으로 바뀐다(재생 속도를 그때그때
 * 읽어 길이를 맞춘다). 클릭 표식은 나타나 기다림 막대가 자라다가, 처리된 뒤 잠깐
 * 멈췄다 막대와 표식만 옅어져 사라지고 기다림 값 글자만 남는다.
 */
import { fonts, fontSizes, getColors, makeTranslator, type CanvasView, type ViewInstance, type ViewMountParams } from '@ffacet/core/runtime';

const W = 720;
const H = 460;
const BAR_X = 176;
const BAR_W = 420;
const BAR_H = 20;
const CLICK_X = [40, 280, 520];
const CLICK_BAR_W = 140;
const CODE_LINE_H = 20;

function ns<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

type ClickSlot = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  barTrack: SVGRectElement;
  bar: SVGRectElement;
  waitText: SVGTextElement;
};

export const cooperativeYieldingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const t = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const initial = params.initialData as
      | { codeSetTimeout?: unknown; codeQueueMicrotask?: unknown }
      | undefined;
    const codeSetTimeout = typeof initial?.codeSetTimeout === 'string' ? initial.codeSetTimeout : '';
    const codeQueueMicrotask = typeof initial?.codeQueueMicrotask === 'string' ? initial.codeQueueMicrotask : '';

    const destroyed = { value: false };
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed.value) fn();
      }, ms);
      timers.add(id);
    };

    const text = (x: number, y: number, size: string, color: string, anchor: 'start' | 'middle' | 'end' = 'start'): SVGTextElement => {
      const el = ns('text');
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('font-family', fonts.body);
      el.setAttribute('font-size', size);
      el.setAttribute('fill', color);
      el.setAttribute('text-anchor', anchor);
      return el;
    };

    const roundCaption = text(16, 26, fontSizes.md, palette.text);
    svg.appendChild(roundCaption);

    const domLabel = text(16, 64, fontSizes.sm, palette.textMuted);
    domLabel.textContent = t('label.dom', 'DOM rows');
    svg.appendChild(domLabel);
    const domTrack = ns('rect');
    domTrack.setAttribute('x', String(BAR_X));
    domTrack.setAttribute('y', '50');
    domTrack.setAttribute('width', String(BAR_W));
    domTrack.setAttribute('height', String(BAR_H));
    domTrack.setAttribute('rx', '4');
    domTrack.setAttribute('fill', palette.bgSubtle);
    domTrack.setAttribute('stroke', palette.border);
    svg.appendChild(domTrack);
    const domBar = ns('rect');
    domBar.setAttribute('x', String(BAR_X));
    domBar.setAttribute('y', '50');
    domBar.setAttribute('width', '0');
    domBar.setAttribute('height', String(BAR_H));
    domBar.setAttribute('rx', '4');
    domBar.setAttribute('fill', palette.primary);
    svg.appendChild(domBar);
    const domValue = text(BAR_X + BAR_W + 12, 64, fontSizes.sm, palette.text);
    domValue.textContent = '0';
    svg.appendChild(domValue);

    const screenLabel = text(16, 100, fontSizes.sm, palette.textMuted);
    screenLabel.textContent = t('label.screen', 'Rows on screen');
    svg.appendChild(screenLabel);
    const screenTrack = ns('rect');
    screenTrack.setAttribute('x', String(BAR_X));
    screenTrack.setAttribute('y', '86');
    screenTrack.setAttribute('width', String(BAR_W));
    screenTrack.setAttribute('height', String(BAR_H));
    screenTrack.setAttribute('rx', '4');
    screenTrack.setAttribute('fill', palette.bgSubtle);
    screenTrack.setAttribute('stroke', palette.border);
    svg.appendChild(screenTrack);
    const screenBar = ns('rect');
    screenBar.setAttribute('x', String(BAR_X));
    screenBar.setAttribute('y', '86');
    screenBar.setAttribute('width', '0');
    screenBar.setAttribute('height', String(BAR_H));
    screenBar.setAttribute('rx', '4');
    screenBar.setAttribute('fill', palette.accent);
    svg.appendChild(screenBar);
    const screenValue = text(BAR_X + BAR_W + 12, 100, fontSizes.sm, palette.text);
    screenValue.textContent = '0';
    svg.appendChild(screenValue);

    const clickSlots: ClickSlot[] = CLICK_X.map((x) => {
      const group = ns('g');
      group.setAttribute('opacity', '0');
      group.style.transition = 'opacity 250ms linear';
      const circle = ns('circle');
      circle.setAttribute('cx', String(x + 8));
      circle.setAttribute('cy', String(146));
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', palette.danger);
      group.appendChild(circle);
      const label = text(x + 22, 150, fontSizes.sm, palette.text);
      group.appendChild(label);
      const barTrack = ns('rect');
      barTrack.setAttribute('x', String(x));
      barTrack.setAttribute('y', '160');
      barTrack.setAttribute('width', String(CLICK_BAR_W));
      barTrack.setAttribute('height', '10');
      barTrack.setAttribute('rx', '3');
      barTrack.setAttribute('fill', palette.bgSubtle);
      barTrack.setAttribute('stroke', palette.border);
      group.appendChild(barTrack);
      const bar = ns('rect');
      bar.setAttribute('x', String(x));
      bar.setAttribute('y', '160');
      bar.setAttribute('width', '0');
      bar.setAttribute('height', '10');
      bar.setAttribute('rx', '3');
      bar.setAttribute('fill', palette.danger);
      group.appendChild(bar);
      svg.appendChild(group);
      const waitText = text(x, 190, fontSizes.sm, palette.text);
      svg.appendChild(waitText);
      return { group, circle, label, barTrack, bar, waitText };
    });

    const doneCaption = text(16, 218, fontSizes.sm, palette.success);
    svg.appendChild(doneCaption);

    const codeBg = ns('rect');
    codeBg.setAttribute('x', '16');
    codeBg.setAttribute('y', '236');
    codeBg.setAttribute('width', String(W - 32));
    codeBg.setAttribute('height', String(H - 236 - 12));
    codeBg.setAttribute('rx', '8');
    codeBg.setAttribute('fill', palette.bgSubtle);
    codeBg.setAttribute('stroke', palette.border);
    svg.appendChild(codeBg);
    const codeLabel = text(28, 256, fontSizes.xs, palette.textMuted);
    codeLabel.textContent = t('label.code', 'Code running now');
    svg.appendChild(codeLabel);
    const codeText = ns('text');
    codeText.setAttribute('x', '28');
    codeText.setAttribute('y', '276');
    codeText.setAttribute('font-family', fonts.mono);
    codeText.setAttribute('font-size', fontSizes.sm);
    codeText.setAttribute('fill', palette.text);
    svg.appendChild(codeText);

    const setCodeText = (src: string, chunkSize: number): void => {
      while (codeText.firstChild) codeText.removeChild(codeText.firstChild);
      const lines = src.replace(/SIZE/g, String(chunkSize)).split('\n');
      lines.forEach((line, i) => {
        const tspan = ns('tspan');
        tspan.setAttribute('x', '28');
        tspan.setAttribute('dy', i === 0 ? '0' : String(CODE_LINE_H));
        tspan.textContent = line;
        codeText.appendChild(tspan);
      });
    };

    const dur = (base: number, speed: number): string => `${Math.max(60, Math.round(base / Math.max(0.01, speed)))}ms`;

    const instance: ViewInstance & {
      startRound(p: { chunkSize: number; via: number; numChunks: number; chunkMs: number }, speed: number): void;
      growDom(dom: number, speed: number): void;
      renderScreen(dom: number, speed: number): void;
      clickEvent(p: { id: string; arrivalMs: number; waitMs: number }, speed: number): void;
      markDone(atMs: number): void;
    } = {
      destroy(): void {
        destroyed.value = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
      },
      startRound(p, speed): void {
        const api = p.via === 1 ? 'queueMicrotask' : 'setTimeout';
        roundCaption.textContent = t('caption.round', 'Chunk {chunkSize} rows · {numChunks} chunks · {chunkMs}ms each · {api}', {
          chunkSize: p.chunkSize,
          numChunks: p.numChunks,
          chunkMs: p.chunkMs,
          api,
        });
        setCodeText(p.via === 1 ? codeQueueMicrotask : codeSetTimeout, p.chunkSize);
        doneCaption.textContent = '';
        domBar.style.transition = 'none';
        screenBar.style.transition = 'none';
        domBar.setAttribute('width', '0');
        screenBar.setAttribute('width', '0');
        domValue.textContent = '0';
        screenValue.textContent = '0';
        for (const slot of clickSlots) {
          slot.group.style.transition = 'none';
          slot.group.setAttribute('opacity', '0');
          slot.bar.setAttribute('width', '0');
          slot.waitText.textContent = '';
        }
        // 다음 tick 부터 transition 을 다시 켠다(위 초기화는 애니메이션 없이 즉시).
        later(() => {
          domBar.style.transition = `width ${dur(260, speed)} linear`;
          screenBar.style.transition = `width ${dur(260, speed)} linear`;
          for (const slot of clickSlots) slot.group.style.transition = 'opacity 250ms linear';
        }, 0);
      },
      growDom(dom, speed): void {
        const w = Math.round((Math.min(dom, 500) / 500) * BAR_W);
        domBar.style.transition = `width ${dur(220, speed)} linear`;
        domBar.setAttribute('width', String(w));
        domValue.textContent = String(dom);
      },
      renderScreen(dom, speed): void {
        const w = Math.round((Math.min(dom, 500) / 500) * BAR_W);
        screenBar.style.transition = `width ${dur(260, speed)} linear`;
        screenBar.setAttribute('width', String(w));
        screenValue.textContent = String(dom);
      },
      clickEvent(p, speed): void {
        const index = ['click1', 'click2', 'click3'].indexOf(p.id);
        const slot = clickSlots[index];
        if (!slot) throw new Error(`알 수 없는 클릭 식별자: ${p.id}`);
        slot.label.textContent = t('label.click', 'Click {n}', { n: index + 1 });
        slot.group.setAttribute('opacity', '1');
        const growMs = dur(220, speed);
        slot.group.style.transition = `opacity ${growMs} linear`;
        slot.bar.style.transition = `width ${growMs} linear`;
        const w = Math.min(CLICK_BAR_W, p.waitMs * 2);
        slot.bar.setAttribute('width', String(w));
        later(() => {
          slot.waitText.textContent = t('caption.wait', 'Waited {waitMs}ms', { waitMs: p.waitMs });
          const fadeMs = dur(300, speed);
          slot.group.style.transition = `opacity ${fadeMs} linear`;
          slot.group.setAttribute('opacity', '0');
        }, Math.max(60, Math.round(220 / Math.max(0.01, speed))));
      },
      markDone(atMs): void {
        doneCaption.textContent = t('caption.done', 'All 500 rows done at {atMs}ms', { atMs });
      },
    };
    return instance;
  },
};
