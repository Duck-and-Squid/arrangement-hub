import { XMLDiffToken, XMLDiffTokenNodeType, XMLDiffTokenEditType } from "@/utils/xmldiff";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as xpath from "xpath";
import { COLOR_CHANGE, COLOR_DELETE, COLOR_INSERT, COLORABLE_ELEMENTS } from "@/utils/musicxmldiff-config";

export type MusicXMLDiffResult = {
  oldXml: string;
  newXml: string;
  unusedTokens: XMLDiffToken[];
};

const setColor = (el: Element | null, color: string) => {
  if (el) el.setAttribute("color", color);
};

const findColorableParent = (el: Node | null): Element | null => {
  let current: Node | null = el;
  while (current) {
    if (current.nodeType === 1 && COLORABLE_ELEMENTS.has((current as Element).nodeName)) {
      return current as Element;
    }
    current = current.parentNode;
  }
  return null;
};

const findElementFromXPath = (doc: Document, xpathStr: string): Element | null => {
  const cleanedPath = xpathStr.replace(/\/@[^/]+$/g, "").replace(/\/text\(\)$/g, "");
  const nodes = xpath.select(cleanedPath, doc) as Node[];
  for (const node of nodes) {
    if (node.nodeType === 1) return node as Element;
  }
  return null;
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

    // Determine the parent to color for all cases
    const oldParent = findColorableParent(oldEl) || (oldEl?.nodeType === 1 ? (oldEl as Element) : null);
    const newParent = findColorableParent(newEl) || (newEl?.nodeType === 1 ? (newEl as Element) : null);

    let colored = false;

    if (token.nodeType === XMLDiffTokenNodeType.ELEMENT) {
      if (token.editType === XMLDiffTokenEditType.INSERT) {
        if (newParent) {
          setColor(newParent, COLOR_INSERT);
          colored = true;
        }
      }
      if (token.editType === XMLDiffTokenEditType.DELETE) {
        if (oldParent) {
          setColor(oldParent, COLOR_DELETE);
          colored = true;
        }
      }
    } else {
      // CONTENT or ATTRIBUTE change
      if (oldParent) {
        setColor(oldParent, COLOR_CHANGE);
        colored = true;
      }
      if (newParent) {
        setColor(newParent, COLOR_CHANGE);
        colored = true;
      }
    }

    if (!colored) unusedTokens.push(token);
  }

  return {
    oldXml: serializer.serializeToString(oldDoc),
    newXml: serializer.serializeToString(newDoc),
    unusedTokens,
  };
};
