import { describe, expect, test } from "@jest/globals";
import { XMLDiffTokenEditType, XMLDiffTokenNodeType, computeXMLDiffTokens } from "@/utils/xmldiff";

describe("no change", () => {
  test("no op", () => {
    expect(computeXMLDiffTokens("<foo />", "<foo />")).toStrictEqual([]);
  });

  test("no op nested", () => {
    expect(computeXMLDiffTokens("<foo><bar /></foo>", "<foo><bar /></foo>")).toStrictEqual([]);
  });

  test("no op order", () => {
    expect(computeXMLDiffTokens("<foo><bar /><qux /></foo>", "<foo><qux /><bar /></foo>")).toStrictEqual([]);
  });

  test("no op order nested", () => {
    expect(computeXMLDiffTokens("<foo><bar>a</bar><qux /></foo>", "<foo><qux /><bar>a</bar></foo>")).toStrictEqual([]);
  });
});

describe("only one insert", () => {
  test("insert element", () => {
    const result = computeXMLDiffTokens("<foo></foo>", "<foo><bar /></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.INSERT);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ELEMENT);
    expect(token.xpath).toStrictEqual("/foo/bar");
  });

  test("insert attribute", () => {
    const result = computeXMLDiffTokens("<foo></foo>", '<foo bar="qux"></foo>');
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.INSERT);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ATTRIBUTE);
    expect(token.xpath).toStrictEqual("/foo/@bar");
  });

  test("insert content", () => {
    const result = computeXMLDiffTokens("<foo></foo>", "<foo>a</foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.INSERT);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.CONTENT);
    expect(token.xpath).toStrictEqual("/foo/text()");
  });
});

describe("only one change", () => {
  test("change attribute", () => {
    const result = computeXMLDiffTokens('<foo bar="old"></foo>', '<foo bar="new"></foo>');
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.CHANGE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ATTRIBUTE);
    expect(token.xpath).toStrictEqual("/foo/@bar");
  });

  test("change content", () => {
    const result = computeXMLDiffTokens("<foo>a</foo>", "<foo>b</foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.CHANGE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.CONTENT);
    expect(token.xpath).toStrictEqual("/foo/text()");
  });
});

describe("only one delete", () => {
  test("delete element", () => {
    const result = computeXMLDiffTokens("<foo><bar /></foo>", "<foo></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.DELETE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ELEMENT);
    expect(token.xpath).toStrictEqual("/foo/bar");
  });

  test("delete attribute", () => {
    const result = computeXMLDiffTokens('<foo bar="qux"></foo>', "<foo></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.DELETE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ATTRIBUTE);
    expect(token.xpath).toStrictEqual("/foo/@bar");
  });

  test("delete content", () => {
    const result = computeXMLDiffTokens("<foo>a</foo>", "<foo></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.DELETE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.CONTENT);
    expect(token.xpath).toStrictEqual("/foo/text()");
  });
});

describe("complex diffs", () => {
  test("element renamed (delete+insert)", () => {
    const result = computeXMLDiffTokens("<foo><bar /></foo>", "<foo><baz /></foo>");
    expect(result).toHaveLength(2);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/bar",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/baz",
        }),
      ]),
    );
  });

  test("parent and child both changed", () => {
    const result = computeXMLDiffTokens(
      '<foo bar="old"><child>keep</child></foo>',
      '<foo bar="new"><child>changed</child></foo>',
    );
    expect(result).toHaveLength(2);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: "/foo/@bar",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.CONTENT,
          xpath: "/foo/child/text()",
        }),
      ]),
    );
  });

  test("sibling changed but other sibling untouched", () => {
    const result = computeXMLDiffTokens("<foo><a>same</a><b>old</b></foo>", "<foo><a>same</a><b>new</b></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.CHANGE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.CONTENT);
    expect(token.xpath).toStrictEqual("/foo/b/text()");
  });

  test("insert new sibling while others unchanged", () => {
    const result = computeXMLDiffTokens("<foo><a>1</a></foo>", "<foo><a>1</a><b>2</b></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.INSERT);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ELEMENT);
    expect(token.xpath).toStrictEqual("/foo/b");
  });

  test("delete one child but keep others", () => {
    const result = computeXMLDiffTokens("<foo><a /><b /></foo>", "<foo><a /></foo>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.DELETE);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ELEMENT);
    expect(token.xpath).toStrictEqual("/foo/b");
  });

  test("attribute deleted on parent while child inserted", () => {
    const result = computeXMLDiffTokens('<foo bar="x"></foo>', "<foo><child /></foo>");
    expect(result).toHaveLength(2);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: "/foo/@bar",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/child",
        }),
      ]),
    );
  });

  test("content deleted and attribute changed", () => {
    const result = computeXMLDiffTokens('<foo bar="a">hello</foo>', '<foo bar="b"></foo>');
    expect(result).toHaveLength(2);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
          xpath: "/foo/@bar",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.CONTENT,
          xpath: "/foo/text()",
        }),
      ]),
    );
  });

  test("nested insertion: parent inserted with child inside", () => {
    const result = computeXMLDiffTokens("<root></root>", "<root><parent><child /></parent></root>");
    expect(result).toHaveLength(1);

    const token = result[0];
    expect(token.editType).toStrictEqual(XMLDiffTokenEditType.INSERT);
    expect(token.nodeType).toStrictEqual(XMLDiffTokenNodeType.ELEMENT);
    expect(token.xpath).toStrictEqual("/root/parent");
  });

  test("mixed: one sibling changed, another deleted, another inserted", () => {
    const result = computeXMLDiffTokens("<foo><a>old</a><b /><c /></foo>", "<foo><a>new</a><c /><d /></foo>");
    expect(result).toHaveLength(3);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          editType: XMLDiffTokenEditType.CHANGE,
          nodeType: XMLDiffTokenNodeType.CONTENT,
          xpath: "/foo/a/text()",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.DELETE,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/b",
        }),
        expect.objectContaining({
          editType: XMLDiffTokenEditType.INSERT,
          nodeType: XMLDiffTokenNodeType.ELEMENT,
          xpath: "/foo/d",
        }),
      ]),
    );
  });
});
