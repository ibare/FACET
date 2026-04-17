import type { FacetExpr, FacetExprMatch, FacetIdentifier } from './types.js';

const IDENT = 'facet:[a-zA-Z][a-zA-Z0-9_-]*';
const SINGLE_PATTERN = new RegExp(`^\\{(${IDENT}(?:\\s+${IDENT})*)\\}$`);
const GLOBAL_PATTERN = new RegExp(`\\{(${IDENT}(?:\\s+${IDENT})*)\\}`, 'g');

function toIdentifier(token: string): FacetIdentifier | null {
  const [ns, name] = token.split(':');
  if (ns !== 'facet' || !name) return null;
  return { ns: 'facet', name };
}

export function parseFacetExpr(text: string): FacetExpr | null {
  const match = text.match(SINGLE_PATTERN);
  if (!match) return null;

  const tokens = match[1].split(/\s+/);
  const idents = tokens.map(toIdentifier);
  if (idents.some((i) => i === null)) return null;

  const [first, ...rest] = idents as FacetIdentifier[];
  return {
    container: first,
    bodies: rest,
    raw: text,
  };
}

export function findFacetExprs(source: string): FacetExprMatch[] {
  const results: FacetExprMatch[] = [];
  const regex = new RegExp(GLOBAL_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const parsed = parseFacetExpr(match[0]);
    if (parsed) {
      results.push({
        expr: parsed,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return results;
}
