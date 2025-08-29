import { describe, expect, test } from "@jest/globals";
import {
  XMLDiffTokenEditType,
  XMLDiffTokenNodeType,
  XMLDiff,
  type XMLDiffToken,
  type ElementToken,
  type AttributeToken,
  type ContentToken,
} from "@/utils/xmldiff";

/* ----------------------------- Type guards ----------------------------- */
const assertElementToken = (token: XMLDiffToken): ElementToken => {
  expect(token.nodeType).toBe(XMLDiffTokenNodeType.ELEMENT);
  const t = token as ElementToken;
  expect(typeof t.name).toBe("string");
  expect(t.name.length).toBeGreaterThanOrEqual(0);
  return t;
};

const assertAttributeToken = (token: XMLDiffToken): AttributeToken => {
  expect(token.nodeType).toBe(XMLDiffTokenNodeType.ATTRIBUTE);
  const t = token as AttributeToken;
  expect(typeof t.name).toBe("string");
  return t;
};

const assertContentToken = (token: XMLDiffToken): ContentToken => {
  expect(token.nodeType).toBe(XMLDiffTokenNodeType.CONTENT);
  return token as ContentToken;
};

/* ----------------------------- Basic no-change ----------------------------- */
describe("no change", () => {
  test("empty element", () => {
    expect(new XMLDiff().computeXMLDiffTokens("<foo />", "<foo />")).toStrictEqual([]);
  });

  test("nested element", () => {
    expect(new XMLDiff().computeXMLDiffTokens("<foo><bar /></foo>", "<foo><bar /></foo>")).toStrictEqual([]);
  });
});

/* ----------------------------- Statefulness ----------------------------- */
describe("statefulness", () => {
  test("internal state reset", () => {
    const xmlDiff = new XMLDiff();

    const tokens1 = xmlDiff.computeXMLDiffTokens("<root><a>1</a></root>", "<root><a>2</a></root>");
    expect(tokens1).toHaveLength(1);
    {
      const ct = assertContentToken(tokens1[0]);
      expect(ct.xpath).toBe("/root/a/text()");
      expect(ct.oldValue).toBe("1");
      expect(ct.newValue).toBe("2");
    }

    const tokens2 = xmlDiff.computeXMLDiffTokens("<root><b>hello</b></root>", "<root><b>world</b></root>");
    expect(tokens2).toHaveLength(1);
    {
      const ct = assertContentToken(tokens2[0]);
      expect(ct.xpath).toBe("/root/b/text()");
      expect(ct.oldValue).toBe("hello");
      expect(ct.newValue).toBe("world");
    }
  });
});

/* ----------------------------- Insertions ----------------------------- */
describe("insertions", () => {
  test("element", () => {
    const token = new XMLDiff().computeXMLDiffTokens("<foo></foo>", "<foo><bar /></foo>")[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.INSERT);
    const et = assertElementToken(token);
    expect(et.xpath).toBe("/foo/bar");
    expect(et.name).toBe("bar");
  });

  test("attribute", () => {
    const token = new XMLDiff().computeXMLDiffTokens("<foo></foo>", '<foo bar="qux"></foo>')[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.INSERT);
    const at = assertAttributeToken(token);
    expect(at.xpath).toBe("/foo/@bar");
    expect(at.name).toBe("bar");
    expect(at.newValue).toBe("qux");
  });

  test("content", () => {
    const token = new XMLDiff().computeXMLDiffTokens("<foo></foo>", "<foo>a</foo>")[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.INSERT);
    const ct = assertContentToken(token);
    expect(ct.xpath).toBe("/foo/text()");
    expect(ct.newValue).toBe("a");
  });
});

/* ----------------------------- Changes ----------------------------- */
describe("changes", () => {
  test("attribute change", () => {
    const token = new XMLDiff().computeXMLDiffTokens('<foo bar="old"></foo>', '<foo bar="new"></foo>')[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.CHANGE);
    const at = assertAttributeToken(token);
    expect(at.xpath).toBe("/foo/@bar");
    expect(at.oldValue).toBe("old");
    expect(at.newValue).toBe("new");
  });

  test("content change", () => {
    const token = new XMLDiff().computeXMLDiffTokens("<foo>a</foo>", "<foo>b</foo>")[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.CHANGE);
    const ct = assertContentToken(token);
    expect(ct.xpath).toBe("/foo/text()");
    expect(ct.oldValue).toBe("a");
    expect(ct.newValue).toBe("b");
  });
});

/* ----------------------------- Deletions ----------------------------- */
describe("deletions", () => {
  test("element", () => {
    const token = new XMLDiff().computeXMLDiffTokens("<foo><bar /></foo>", "<foo></foo>")[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.DELETE);
    const et = assertElementToken(token);
    expect(et.xpath).toBe("/foo/bar");
    expect(et.name).toBe("bar");
  });

  test("attribute", () => {
    const token = new XMLDiff().computeXMLDiffTokens('<foo bar="qux"></foo>', "<foo></foo>")[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.DELETE);
    const at = assertAttributeToken(token);
    expect(at.xpath).toBe("/foo/@bar");
    expect(at.oldValue).toBe("qux");
  });

  test("content", () => {
    const token = new XMLDiff().computeXMLDiffTokens("<foo>a</foo>", "<foo></foo>")[0];
    expect(token.editType).toBe(XMLDiffTokenEditType.DELETE);
    const ct = assertContentToken(token);
    expect(ct.xpath).toBe("/foo/text()");
    expect(ct.oldValue).toBe("a");
  });
});

/* ----------------------------- Complex diffs ----------------------------- */
describe("complex diffs", () => {
  test("rename element triggers delete+insert", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens("<foo><bar /></foo>", "<foo><baz /></foo>");
    expect(tokens).toHaveLength(2);
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/bar",
          name: "bar",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/baz",
          name: "baz",
        }),
      ]),
    );
  });

  test("attribute + child content change", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens(
      '<foo bar="old"><child>keep</child></foo>',
      '<foo bar="new"><child>changed</child></foo>',
    );
    expect(tokens).toHaveLength(2);
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: "/foo/@bar",
          oldValue: "old",
          newValue: "new",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.CONTENT,
          xpath: "/foo/child/text()",
          oldValue: "keep",
          newValue: "changed",
        }),
      ]),
    );
  });

  test("mixed insert/delete/change with siblings", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens(
      "<foo><a>old</a><b /><c /></foo>",
      "<foo><a>new</a><c /><d /></foo>",
    );
    expect(tokens).toHaveLength(3);
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.CONTENT,
          xpath: "/foo/a/text()",
          oldValue: "old",
          newValue: "new",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/b",
          name: "b",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/d",
          name: "d",
        }),
      ]),
    );
  });

  test("nested insertions: parent with child", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens("<root></root>", "<root><parent><child /></parent></root>");
    expect(tokens).toHaveLength(1);
    const et = assertElementToken(tokens[0]);
    expect(et.editType).toBe(XMLDiffTokenEditType.INSERT);
    expect(et.xpath).toBe("/root/parent");
    expect(et.name).toBe("parent");
  });

  test("attribute deleted while child inserted", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens('<foo bar="x"></foo>', "<foo><child /></foo>");
    expect(tokens).toHaveLength(2);
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: "/foo/@bar",
          oldValue: "x",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/child",
          name: "child",
        }),
      ]),
    );
  });

  test("content deleted and attribute changed", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens('<foo bar="a">hello</foo>', '<foo bar="b"></foo>');
    expect(tokens).toHaveLength(2);
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: "/foo/@bar",
          oldValue: "a",
          newValue: "b",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.CONTENT,
          xpath: "/foo/text()",
          oldValue: "hello",
        }),
      ]),
    );
  });
});

describe("indexed children", () => {
  test("change content in second child", () => {
    const xml1 = "<root><note>A</note><note>B</note></root>";
    const xml2 = "<root><note>A</note><note>C</note></root>";
    const tokens = new XMLDiff().computeXMLDiffTokens(xml1, xml2);

    expect(tokens).toHaveLength(1);
    const ct = assertContentToken(tokens[0]);
    expect(ct.editType).toBe(XMLDiffTokenEditType.CHANGE);
    expect(ct.xpath).toBe("/root/note[2]/text()");
    expect(ct.oldValue).toBe("B");
    expect(ct.newValue).toBe("C");
  });

  test("insert second child", () => {
    const xml1 = "<root><note>A</note></root>";
    const xml2 = "<root><note>A</note><note>B</note></root>";
    const tokens = new XMLDiff().computeXMLDiffTokens(xml1, xml2);

    expect(tokens).toHaveLength(1);
    const et = assertElementToken(tokens[0]);
    expect(et.editType).toBe(XMLDiffTokenEditType.INSERT);
    expect(et.xpath).toBe("/root/note[2]");
    expect(et.name).toBe("note");
  });

  test("delete first of multiple children", () => {
    const xml1 = "<root><note>A</note><note>B</note></root>";
    const xml2 = "<root><note>B</note></root>";
    const tokens = new XMLDiff().computeXMLDiffTokens(xml1, xml2);

    expect(tokens).toHaveLength(1);
    const et = assertElementToken(tokens[0]);
    expect(et.editType).toBe(XMLDiffTokenEditType.DELETE);
    expect(et.xpath).toBe("/root/note[1]");
    expect(et.name).toBe("note");
  });

  test("complex nested multiple children", () => {
    const xml1 = "<root><bar><note>A</note><note>B</note></bar></root>";
    const xml2 = "<root><bar><note>B</note><note>C</note></bar></root>";
    const tokens = new XMLDiff().computeXMLDiffTokens(xml1, xml2);

    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.xpath)).toEqual(
      expect.arrayContaining(["/root/bar/note[1]/text()", "/root/bar/note[2]/text()"]),
    );
  });
});

describe("edge cases", () => {
  test("empty vs self-closing", () => {
    const tokens = new XMLDiff().computeXMLDiffTokens("<foo></foo>", "<foo />");
    expect(tokens).toStrictEqual([]);
  });

  test("element with multiple attributes changed", () => {
    const xml1 = '<foo a="1" b="2" c="3"/>';
    const xml2 = '<foo a="1" b="X" c="3"/>';
    const tokens = new XMLDiff().computeXMLDiffTokens(xml1, xml2);
    expect(tokens).toHaveLength(1);
    const at = assertAttributeToken(tokens[0]);
    expect(at.xpath).toBe("/foo/@b");
    expect(at.oldValue).toBe("2");
    expect(at.newValue).toBe("X");
  });
});
