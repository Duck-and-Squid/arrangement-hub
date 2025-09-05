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

export type ElementToken = BaseToken & {
  nodeType: XMLDiffTokenNodeType.ELEMENT;
  name: string;
};

export type AttributeToken = BaseToken & {
  nodeType: XMLDiffTokenNodeType.ATTRIBUTE;
  name: string;
  oldValue?: string;
  newValue?: string;
};

export type ContentToken = BaseToken & {
  nodeType: XMLDiffTokenNodeType.CONTENT;
  oldValue?: string;
  newValue?: string;
};

export type XMLDiffToken = ElementToken | AttributeToken | ContentToken;

/* --------------------------- internal node structure --------------------------- */
type UNode = {
  id: number;
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: UNode[];
};

/* ------------------------------- parser setup -------------------------------- */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  trimValues: false,
});

/* ---------------------------- XMLDiff class --------------------------------- */
export class XMLDiff {
  private nextId = 1;
  private subtreeCostMemo = new Map<number, number>();
  private pairCostMemo = new Map<string, number>();

  /* ------------------------------- normalization -------------------------------- */
  private toUNode(name: string, obj: any): UNode {
    const id = this.nextId++;
    const attrs: Record<string, string> = {};
    let text = "";
    const children: UNode[] = [];

    if (obj == null) return { id, name, attrs, text, children };
    if (typeof obj !== "object") {
      text = String(obj);
      return { id, name, attrs, text, children };
    }

    for (const [k, v] of Object.entries(obj)) {
      if (k === "#text") {
        text += Array.isArray(v) ? v.filter((c) => typeof c === "string").join("") : String(v);
      } else if (k.startsWith("@")) {
        attrs[k.slice(1)] = String(v);
      } else {
        if (Array.isArray(v)) {
          for (const item of v) {
            children.push(
              typeof item === "object" ? this.toUNode(k, item) : this.toUNode(k, { "#text": String(item) }),
            );
          }
        } else {
          children.push(typeof v === "object" ? this.toUNode(k, v) : this.toUNode(k, { "#text": String(v) }));
        }
      }
    }

    return { id, name, attrs, text, children };
  }

  private parseXMLToUNode(xml: string): UNode {
    this.nextId = 1; // reset ID counter for each parse
    const doc = parser.parse(xml);
    const rootName = Object.keys(doc)[0];
    return this.toUNode(rootName, doc[rootName]);
  }

  /* ------------------------------- XPaths with index ---------------------------- */
  private buildXPath(parent: string, node: UNode, siblings: UNode[]): string {
    const sameTag = siblings.filter((s) => s.name === node.name);
    let index = 1;
    if (sameTag.length > 1) {
      for (const s of sameTag) {
        if (s === node) break;
        index++;
      }
      return parent === "" ? `/${node.name}[${index}]` : `${parent}/${node.name}[${index}]`;
    } else {
      return parent === "" ? `/${node.name}` : `${parent}/${node.name}`;
    }
  }

  /* -------------------------- cost estimation & memo ------------------------- */
  private subtreeCost(n: UNode): number {
    const cached = this.subtreeCostMemo.get(n.id);
    if (cached !== undefined) return cached;
    let cost = 1 + Object.keys(n.attrs).length + (n.text.length > 0 ? 1 : 0);
    for (const c of n.children) cost += this.subtreeCost(c);
    this.subtreeCostMemo.set(n.id, cost);
    return cost;
  }

  private computeCost(a: UNode, b: UNode): number {
    const key = `${a.id}:${b.id}`;
    const cached = this.pairCostMemo.get(key);
    if (cached !== undefined) return cached;

    const INF = 1e9;
    if (a.name !== b.name) return INF;

    let cost = 0;
    const allAttrKeys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
    for (const k of allAttrKeys) {
      if (!(k in a.attrs) || !(k in b.attrs) || a.attrs[k] !== b.attrs[k]) cost += 1;
    }
    if (a.text !== b.text && (a.text.length > 0 || b.text.length > 0)) cost += 1;

    const aLen = a.children.length;
    const bLen = b.children.length;
    const dp: number[][] = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));

    for (let i = 0; i <= aLen; i++) dp[i][0] = i === 0 ? 0 : dp[i - 1][0] + this.subtreeCost(a.children[i - 1]);
    for (let j = 0; j <= bLen; j++) dp[0][j] = j === 0 ? 0 : dp[0][j - 1] + this.subtreeCost(b.children[j - 1]);

    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        const match = this.computeCost(a.children[i - 1], b.children[j - 1]);
        const del = this.subtreeCost(a.children[i - 1]);
        const ins = this.subtreeCost(b.children[j - 1]);
        dp[i][j] = Math.min(dp[i - 1][j] + del, dp[i][j - 1] + ins, dp[i - 1][j - 1] + match);
      }
    }

    cost += dp[aLen][bLen];
    this.pairCostMemo.set(key, cost);
    return cost;
  }

  /* ------------------------------ emit tokens -------------------------------- */
  private emitAttrDiffs(a: Record<string, string>, b: Record<string, string>, path: string, out: XMLDiffToken[]) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) {
        out.push({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: `${path}/@${k}`,
          name: k,
          newValue: b[k],
        });
      } else if (!(k in b)) {
        out.push({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: `${path}/@${k}`,
          name: k,
          oldValue: a[k],
        });
      } else if (a[k] !== b[k]) {
        out.push({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: `${path}/@${k}`,
          name: k,
          oldValue: a[k],
          newValue: b[k],
        });
      }
    }
  }

  private emitContentDiff(aText: string, bText: string, path: string, out: XMLDiffToken[]) {
    if (aText === bText && aText.length === 0) return;
    if (aText.length && !bText.length)
      out.push({
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: `${path}/text()`,
        oldValue: aText,
      });
    else if (!aText.length && bText.length)
      out.push({
        editType: XMLDiffTokenEditType.INSERT,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: `${path}/text()`,
        newValue: bText,
      });
    else if (aText !== bText)
      out.push({
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: `${path}/text()`,
        oldValue: aText,
        newValue: bText,
      });
  }

  private diffNodes(a: UNode, b: UNode, xpath: string, out: XMLDiffToken[]) {
    this.emitAttrDiffs(a.attrs, b.attrs, xpath, out);
    this.emitContentDiff(a.text, b.text, xpath, out);

    const aLen = a.children.length;
    const bLen = b.children.length;
    const dp: { cost: number; ops: ("match" | "delete" | "insert")[] }[][] = [];

    for (let i = 0; i <= aLen; i++) dp[i] = Array.from({ length: bLen + 1 }, () => ({ cost: 0, ops: [] }));

    for (let i = 1; i <= aLen; i++)
      dp[i][0] = {
        cost: dp[i - 1][0].cost + this.subtreeCost(a.children[i - 1]),
        ops: [...dp[i - 1][0].ops, "delete"],
      };
    for (let j = 1; j <= bLen; j++)
      dp[0][j] = {
        cost: dp[0][j - 1].cost + this.subtreeCost(b.children[j - 1]),
        ops: [...dp[0][j - 1].ops, "insert"],
      };

    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        const matchCost = dp[i - 1][j - 1].cost + this.computeCost(a.children[i - 1], b.children[j - 1]);
        const delCost = dp[i - 1][j].cost + this.subtreeCost(a.children[i - 1]);
        const insCost = dp[i][j - 1].cost + this.subtreeCost(b.children[j - 1]);

        if (matchCost <= delCost && matchCost <= insCost)
          dp[i][j] = { cost: matchCost, ops: [...dp[i - 1][j - 1].ops, "match"] };
        else if (delCost <= insCost) dp[i][j] = { cost: delCost, ops: [...dp[i - 1][j].ops, "delete"] };
        else dp[i][j] = { cost: insCost, ops: [...dp[i][j - 1].ops, "insert"] };
      }
    }

    const ops = dp[aLen][bLen].ops;
    let ai = 0,
      bi = 0;

    for (const op of ops) {
      if (op === "match") {
        this.diffNodes(a.children[ai], b.children[bi], this.buildXPath(xpath, a.children[ai], a.children), out);
        ai++;
        bi++;
      } else if (op === "delete") {
        out.push({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: this.buildXPath(xpath, a.children[ai], a.children),
          name: a.children[ai].name,
        });
        ai++;
      } else {
        out.push({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: this.buildXPath(xpath, b.children[bi], b.children),
          name: b.children[bi].name,
        });
        bi++;
      }
    }
  }

  /* ------------------------------- public API -------------------------------- */
  computeXMLDiffTokens(aXML: string, bXML: string): XMLDiffToken[] {
    this.subtreeCostMemo.clear();
    this.pairCostMemo.clear();

    const a = this.parseXMLToUNode(aXML);
    const b = this.parseXMLToUNode(bXML);
    const out: XMLDiffToken[] = [];

    if (a.name !== b.name) {
      out.push({
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: `/${a.name}`,
        name: a.name,
      });
      out.push({
        editType: XMLDiffTokenEditType.INSERT,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: `/${b.name}`,
        name: b.name,
      });
    } else {
      this.diffNodes(a, b, `/${a.name}`, out);
    }

    return out;
  }
}
