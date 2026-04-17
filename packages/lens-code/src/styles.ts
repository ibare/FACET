export const CODE_STYLE_ID = 'facet-lens-code-styles';

const CSS = `
.facet-code { background: #f6f7fb; border-radius: 12px; padding: 14px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #2b2f44; }
.facet-code__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.facet-code__meta { font-size: 11px; color: #6b6f80; letter-spacing: 0.04em; text-transform: uppercase; }
.facet-code__phase { font-size: 11px; color: #6b6f80; margin-top: 2px; font-family: ui-monospace, Menlo, Monaco, monospace; }
.facet-code__phase span { font-weight: 500; }
.facet-code__tabs { display: inline-flex; gap: 4px; }
.facet-code__tab { height: 26px; padding: 0 10px; font-size: 11px; border: 1px solid #d5d8e3; border-radius: 6px; background: #ffffff; cursor: pointer; color: #2b2f44; }
.facet-code__tab[data-active="true"] { background: #eceffb; border-color: #9aa3c4; font-weight: 500; }
.facet-code__columns { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; }
.facet-code__col-head { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
.facet-code__col-head[data-paradigm="imperative"] { color: #185FA5; }
.facet-code__col-head[data-paradigm="functional"] { color: #534AB7; }
.facet-code__block { background: #ffffff; border-radius: 8px; padding: 10px 0; font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 12px; line-height: 1.7; min-height: 220px; overflow-x: auto; }
.facet-code__line { padding: 0 14px; border-left: 3px solid transparent; white-space: pre; transition: background 0.15s; }
.facet-code__line.hl-comparing { background: #FAEEDA; border-left-color: #BA7517; }
.facet-code__line.hl-swapping { background: #FAECE7; border-left-color: #D85A30; }
.facet-code__line.hl-pass_complete { background: #EAF3DE; border-left-color: #639922; }
.facet-code__line.hl-outer_loop { background: #E6F1FB; border-left-color: #378ADD; }
`;

export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(CODE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CODE_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
