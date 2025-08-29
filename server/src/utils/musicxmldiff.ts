import { XMLDiffToken, XMLDiffTokenNodeType, XMLDiffTokenEditType } from "@/utils/xmldiff";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as xpath from "xpath";

export type Color = string; // e.g., "#RRGGBB"

export type MusicXMLDiffResult = {
  oldXml: string;
  newXml: string;
  unusedTokens: XMLDiffToken[];
};

const COLOR_INSERT = "#00FF00"; // green
const COLOR_DELETE = "#FF0000"; // red
const COLOR_CHANGE = "#FFFF00"; // yellow

const COLORABLE_ELEMENTS = new Set([
  "note",
  "direction",
  "harmony",
  "backup",
  "forward",
  "attributes",
  "clef",
  "key",
  "time",
  "part",
  "measure",
  "rest",
]);

// Apply color attribute to an element
const setColor = (el: Element | null, color: Color) => {
  if (el) el.setAttribute("color", color);
};

// Traverse up parents to find the first colorable element
const findColorableParent = (el: Element | null): Element | null => {
  let current = el;
  while (current) {
    if (COLORABLE_ELEMENTS.has(current.nodeName)) return current;
    current = current.parentNode as Element | null;
  }
  return null;
};

// Find element from XPath using xpath.select
const findElementFromXPath = (doc: Document, xpathStr: string): Element | null => {
  const cleanedPath = xpathStr.replace(/\/@.*$|\/text\(\)$/, "");
  const nodes = xpath.select(cleanedPath, doc) as Element[];
  return nodes.length > 0 ? nodes[0] : null;
};

export const processMusicXMLDiff = (
  oldXmlStr: string,
  newXmlStr: string,
  tokens: XMLDiffToken[],
): MusicXMLDiffResult => {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const oldDoc = parser.parseFromString(oldXmlStr, "application/xml");
  const newDoc = parser.parseFromString(newXmlStr, "application/xml");

  const unusedTokens: XMLDiffToken[] = [];

  for (const token of tokens) {
    const oldEl = findElementFromXPath(oldDoc, token.xpath);
    const newEl = findElementFromXPath(newDoc, token.xpath);

    const isColorable = (el: Element | null) => el && COLORABLE_ELEMENTS.has(el.nodeName);

    // INSERT ELEMENT
    if (token.nodeType === XMLDiffTokenNodeType.ELEMENT && token.editType === XMLDiffTokenEditType.INSERT) {
      if (isColorable(newEl)) setColor(newEl, COLOR_INSERT);
      else unusedTokens.push(token);
      continue;
    }

    // DELETE ELEMENT
    if (token.nodeType === XMLDiffTokenNodeType.ELEMENT && token.editType === XMLDiffTokenEditType.DELETE) {
      if (isColorable(oldEl)) setColor(oldEl, COLOR_DELETE);
      else unusedTokens.push(token);
      continue;
    }

    // CHANGE / ATTRIBUTE / CONTENT
    const oldParent = findColorableParent(oldEl);
    const newParent = findColorableParent(newEl);

    let colored = false;
    if (oldParent) {
      setColor(oldParent, COLOR_CHANGE);
      colored = true;
    }
    if (newParent) {
      setColor(newParent, COLOR_CHANGE);
      colored = true;
    }
    if (!colored) unusedTokens.push(token);
  }

  return {
    oldXml: serializer.serializeToString(oldDoc),
    newXml: serializer.serializeToString(newDoc),
    unusedTokens,
  };
};
