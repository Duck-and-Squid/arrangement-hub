// src/utils/xmldiff.ts
import { XMLParser } from "fast-xml-parser";

/* ----------------------------- public enums/types ----------------------------- */
export enum XMLDiffTokenEditType {
  INSERT = "INSERT",
  DELETE = "DELETE",
  CHANGE = "CHANGE",
}

export enum XMLDiffTokenNodeType {
  ELEMENT = "ELEMENT",
  ATTRIBUTE = "ATTRIBUTE",
  CONTENT = "CONTENT",
}

type BaseToken = {
  editType: XMLDiffTokenEditType;
  nodeType: XMLDiffTokenNodeType;
  xpath: string;
};

export type XMLDiffToken =
  | (BaseToken & { nodeType: XMLDiffTokenNodeType.ELEMENT; name: string })
  | (BaseToken & {
      nodeType: XMLDiffTokenNodeType.ATTRIBUTE;
      name: string;
      oldValue?: string;
      newValue?: string;
    })
  | (BaseToken & {
      nodeType: XMLDiffTokenNodeType.CONTENT;
      oldValue?: string;
      newValue?: string;
    });

/* --------------------------- internal node structure --------------------------- */
type UNode = {
  id: number;
  name: string;
  attrs: Record<string, string>;
  text: string; // normalized direct text content; keep whitespace
  children: UNode[]; // only element children
};

/* ------------------------------- parser setup -------------------------------- */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  trimValues: false, // preserve whitespace so whitespace-only diffs are detectable
});

/* ------------------------------ normalization -------------------------------- */
let nextId = 1;

/**
 * Convert fast-xml-parser output into a UNode.
 *
 * Rules:
 * - If the node value is a primitive (string/number/boolean), treat it as the node's text.
 * - If the node object contains "#text", append all text chunks into .text (preserve whitespace).
 * - Attributes (keys starting with "@") go to attrs.
 * - Child elements become children (no text-as-child nodes).
 */
const toUNode = (name: string, obj: any): UNode => {
  const id = nextId++;
  const attrs: Record<string, string> = {};
  let text = "";
  const children: UNode[] = [];

  // null/undefined => empty node
  if (obj == null) return { id, name, attrs, text, children };

  // if obj is primitive (string/number/boolean), treat as direct text content
  if (typeof obj !== "object") {
    text = String(obj);
    return { id, name, attrs, text, children };
  }

  // otherwise iterate object keys
  for (const [k, v] of Object.entries(obj)) {
    if (k === "#text") {
      // may be string or array of strings; append everything to .text (preserve whitespace)
      if (typeof v === "string") text += v;
      else if (Array.isArray(v)) {
        for (const chunk of v) {
          if (typeof chunk === "string") text += chunk;
        }
      }
    } else if (k.startsWith("@")) {
      attrs[k.slice(1)] = String(v);
    } else {
      // child element(s)
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === "object") children.push(toUNode(k, item));
          else children.push(toUNode(k, { "#text": String(item) }));
        }
      } else if (typeof v === "object") {
        children.push(toUNode(k, v));
      } else {
        // primitive child -> treat as child element with text
        children.push(toUNode(k, { "#text": String(v) }));
      }
    }
  }

  return { id, name, attrs, text, children };
};

const parseXMLToUNode = (xml: string): UNode => {
  nextId = 1;
  const doc = parser.parse(xml);
  const rootName = Object.keys(doc)[0];
  return toUNode(rootName, doc[rootName]);
};

/* ------------------------------- helpers -------------------------------- */
/** Build XPath without positional indices (unordered semantics) */
const buildXPath = (parent: string, seg: string) => (parent === "" ? `/${seg}` : `${parent}/${seg}`);

/* -------------------------- cost estimation & memo ------------------------- */
const INF = 1e9;
const subtreeCostMemo = new Map<number, number>();
const pairCostMemo = new Map<string, number>();

const subtreeCost = (n: UNode): number => {
  const cached = subtreeCostMemo.get(n.id);
  if (cached !== undefined) return cached;
  let cost = 1; // presence of element
  cost += Object.keys(n.attrs).length; // attributes each cost 1
  if (n.text.length > 0) cost += 1; // content costs 1
  for (const c of n.children) cost += subtreeCost(c);
  subtreeCostMemo.set(n.id, cost);
  return cost;
};

const computeCost = (a: UNode, b: UNode): number => {
  const key = `${a.id}:${b.id}`;
  const cached = pairCostMemo.get(key);
  if (cached !== undefined) return cached;

  if (a.name !== b.name) {
    pairCostMemo.set(key, INF);
    return INF;
  }

  let cost = 0;
  // attribute diffs
  const allAttrKeys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  for (const k of allAttrKeys) {
    if (!(k in a.attrs) || !(k in b.attrs)) cost += 1;
    else if (a.attrs[k] !== b.attrs[k]) cost += 1;
  }

  // content diff counts as 1
  if (a.text !== b.text) {
    if (a.text.length > 0 || b.text.length > 0) cost += 1;
  }

  // children grouped by name, minimal assignment per group
  const group = (arr: UNode[]) => {
    const m = new Map<string, UNode[]>();
    for (const c of arr) (m.get(c.name) ?? m.set(c.name, []).get(c.name)!).push(c);
    return m;
  };

  const ag = group(a.children);
  const bg = group(b.children);

  for (const name of new Set([...ag.keys(), ...bg.keys()])) {
    const aList = ag.get(name) ?? [];
    const bList = bg.get(name) ?? [];
    const N = aList.length + bList.length;
    if (N === 0) continue;

    const mat: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i < aList.length && j < bList.length) mat[i][j] = computeCost(aList[i], bList[j]);
        else if (i < aList.length) mat[i][j] = subtreeCost(aList[i]);
        else mat[i][j] = subtreeCost(bList[j]);
      }
    }

    const assign = hungarian(mat);
    for (let r = 0; r < assign.length; r++) {
      const c = assign[r];
      if (c != null) cost += mat[r][c];
    }
  }

  pairCostMemo.set(key, cost);
  return cost;
};

/* --------------------------- Hungarian algorithm -------------------------- */
/**
 * Return assignment: array[row] = col | null
 */
const hungarian = (cost: number[][]): (number | null)[] => {
  const n = cost.length;
  if (n === 0) return [];
  const a = cost.map((row) => row.slice());
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number | null>(n).fill(null);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0 && p[j] <= n) assignment[p[j] - 1] = j - 1;
  }
  return assignment;
};

/* ------------------------------ emit tokens -------------------------------- */
const emitAttrDiffs = (a: Record<string, string>, b: Record<string, string>, path: string, out: XMLDiffToken[]) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a)) {
      out.push({
        editType: XMLDiffTokenEditType.INSERT,
        nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
        xpath: `${path}/@${k}`,
        name: k,
        newValue: b[k],
      } as any);
    } else if (!(k in b)) {
      out.push({
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
        xpath: `${path}/@${k}`,
        name: k,
        oldValue: a[k],
      } as any);
    } else if (a[k] !== b[k]) {
      out.push({
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
        xpath: `${path}/@${k}`,
        name: k,
        oldValue: a[k],
        newValue: b[k],
      } as any);
    }
  }
};

const emitContentDiff = (aText: string, bText: string, path: string, out: XMLDiffToken[]) => {
  const aHas = aText.length > 0;
  const bHas = bText.length > 0;
  if (!aHas && !bHas) return;
  if (aHas && !bHas) {
    out.push({
      editType: XMLDiffTokenEditType.DELETE,
      nodeType: XMLDiffTokenNodeType.CONTENT,
      xpath: `${path}/text()`,
      oldValue: aText,
    });
    return;
  }
  if (!aHas && bHas) {
    out.push({
      editType: XMLDiffTokenEditType.INSERT,
      nodeType: XMLDiffTokenNodeType.CONTENT,
      xpath: `${path}/text()`,
      newValue: bText,
    });
    return;
  }
  if (aText !== bText) {
    out.push({
      editType: XMLDiffTokenEditType.CHANGE,
      nodeType: XMLDiffTokenNodeType.CONTENT,
      xpath: `${path}/text()`,
      oldValue: aText,
      newValue: bText,
    });
  }
};

/* ------------------------------- diffing -------------------------------- */
/**
 * Diff nodes that have the same element name (unordered children)
 */
const diffNodes = (a: UNode, b: UNode, xpath: string, out: XMLDiffToken[]) => {
  // attributes + content
  emitAttrDiffs(a.attrs, b.attrs, xpath, out);
  emitContentDiff(a.text, b.text, xpath, out);

  // group element children by tag name (unordered)
  const group = (arr: UNode[]) => {
    const m = new Map<string, UNode[]>();
    for (const c of arr) (m.get(c.name) ?? m.set(c.name, []).get(c.name)!).push(c);
    return m;
  };

  const ag = group(a.children);
  const bg = group(b.children);

  for (const name of new Set([...ag.keys(), ...bg.keys()])) {
    const aList = ag.get(name) ?? [];
    const bList = bg.get(name) ?? [];

    // purely inserts
    if (aList.length === 0 && bList.length > 0) {
      for (const _ of bList) {
        out.push({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: buildXPath(xpath, name),
          name,
        } as any);
      }
      continue;
    }

    // purely deletes
    if (bList.length === 0 && aList.length > 0) {
      for (const _ of aList) {
        out.push({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: buildXPath(xpath, name),
          name,
        } as any);
      }
      continue;
    }

    // Mixed: use minimal assignment
    const N = aList.length + bList.length;
    const mat: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i < aList.length && j < bList.length) mat[i][j] = computeCost(aList[i], bList[j]);
        else if (i < aList.length) mat[i][j] = aList[i] ? subtreeCost(aList[i]) : 0;
        else mat[i][j] = bList[j] ? subtreeCost(bList[j]) : 0;
      }
    }
    const assign = hungarian(mat);
    for (let i = 0; i < assign.length; i++) {
      const j = assign[i];
      if (j == null) continue;
      if (i < aList.length && j < bList.length) {
        const pairCost = mat[i][j];
        const delIns = subtreeCost(aList[i]) + subtreeCost(bList[j]);
        if (pairCost < delIns) {
          diffNodes(aList[i], bList[j], buildXPath(xpath, name), out);
        } else {
          // emit delete+insert at element level (no indices)
          out.push({
            editType: XMLDiffTokenEditType.DELETE,
            nodeType: XMLDiffTokenNodeType.ELEMENT,
            xpath: buildXPath(xpath, name),
            name,
          } as any);
          out.push({
            editType: XMLDiffTokenEditType.INSERT,
            nodeType: XMLDiffTokenNodeType.ELEMENT,
            xpath: buildXPath(xpath, name),
            name,
          } as any);
        }
      } else if (i < aList.length) {
        out.push({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: buildXPath(xpath, name),
          name,
        } as any);
      } else if (j < bList.length) {
        out.push({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: buildXPath(xpath, name),
          name,
        } as any);
      }
    }
  }
};

/* ------------------------------- public API -------------------------------- */
export const computeXMLDiffTokens = (aXML: string, bXML: string): XMLDiffToken[] => {
  subtreeCostMemo.clear();
  pairCostMemo.clear();
  const a = parseXMLToUNode(aXML);
  const b = parseXMLToUNode(bXML);
  const out: XMLDiffToken[] = [];

  // root element name changed -> delete root + insert new root (coarse)
  if (a.name !== b.name) {
    out.push({
      editType: XMLDiffTokenEditType.DELETE,
      nodeType: XMLDiffTokenNodeType.ELEMENT,
      xpath: `/${a.name}`,
      name: a.name,
    } as any);
    out.push({
      editType: XMLDiffTokenEditType.INSERT,
      nodeType: XMLDiffTokenNodeType.ELEMENT,
      xpath: `/${b.name}`,
      name: b.name,
    } as any);
    return out;
  }

  diffNodes(a, b, `/${a.name}`, out);
  return out;
};
