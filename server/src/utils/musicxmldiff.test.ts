import { describe, expect, test } from "@jest/globals";
import { processMusicXMLDiff } from "@/utils/musicxmldiff";
import { XMLDiff, XMLDiffToken, XMLDiffTokenNodeType, XMLDiffTokenEditType } from "@/utils/xmldiff";

const BASE_OLD_XML = `
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>
`;

const BASE_NEW_XML = `
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>
`;

describe("processMusicXMLDiff - basic coverage", () => {
  test("inserts and deletions colored correctly", () => {
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.INSERT,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[3]",
        name: "note",
      },
      {
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[2]",
        name: "note",
      },
    ];

    const result = processMusicXMLDiff(BASE_OLD_XML, BASE_NEW_XML, tokens);
    expect(result.newXml).toMatch(/<note[^>]*color="#00FF00"[^>]*>/);
    expect(result.oldXml).toMatch(/<note[^>]*color="#FF0000"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("content and attribute changes colored yellow", () => {
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: "/score-partwise/part/measure/note[2]/pitch/step/text()",
        oldValue: "D",
        newValue: "E",
      },
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
        xpath: "/score-partwise/part/@id",
        name: "id",
        oldValue: "P1",
        newValue: "P1A",
      },
    ];

    const result = processMusicXMLDiff(BASE_OLD_XML, BASE_NEW_XML, tokens);
    expect(result.oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.oldXml).toMatch(/<part[^>]*color="#FFFF00"[^>]*>/);
    expect(result.newXml).toMatch(/<part[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("fallback to parent when child not colorable", () => {
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: "/score-partwise/part/measure/note[1]/pitch/octave/text()",
        oldValue: "4",
        newValue: "5",
      },
    ];

    const result = processMusicXMLDiff(BASE_OLD_XML, BASE_NEW_XML, tokens);
    expect(result.oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("unused tokens tracked correctly", () => {
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: "/score-partwise/part/measure/nonexistent/text()",
        oldValue: "x",
        newValue: "y",
      },
    ];

    const result = processMusicXMLDiff(BASE_OLD_XML, BASE_NEW_XML, tokens);
    expect(result.unusedTokens).toHaveLength(1);
    expect(result.unusedTokens[0].xpath).toBe("/score-partwise/part/measure/nonexistent/text()");
  });

  test("mixed insert, change, delete applied correctly", () => {
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.INSERT,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[3]",
        name: "note",
      },
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: "/score-partwise/part/measure/note[2]/pitch/step/text()",
        oldValue: "D",
        newValue: "E",
      },
      {
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[1]",
        name: "note",
      },
    ];

    const result = processMusicXMLDiff(BASE_OLD_XML, BASE_NEW_XML, tokens);
    expect(result.newXml).toMatch(/<note[^>]*color="#00FF00"[^>]*>/);
    expect(result.newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.oldXml).toMatch(/<note[^>]*color="#FF0000"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });
});

describe("processMusicXMLDiff - edge case coverage", () => {
  test("empty measure insert colors inserted note only", () => {
    const oldXml = `<score-partwise><part id="P1"><measure number="1"></measure></part></score-partwise>`;
    const newXml = `<score-partwise><part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part></score-partwise>`;
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.INSERT,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[1]",
        name: "note",
      },
    ];

    const result = processMusicXMLDiff(oldXml, newXml, tokens);

    // Only inserted note is colored
    expect(result.newXml).toMatch(/<note[^>]*color="#00FF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("nested chord note change colors only the changed note", () => {
    const oldXml = `
      <score-partwise>
        <part id="P1">
          <measure number="1">
            <chord>
              <note><pitch><step>C</step></pitch></note>
              <note><pitch><step>D</step></pitch></note>
            </chord>
          </measure>
        </part>
      </score-partwise>
    `;

    const newXml = `
      <score-partwise>
        <part id="P1">
          <measure number="1">
            <chord>
              <note><pitch><step>C</step></pitch></note>
              <note><pitch><step>E</step></pitch></note>
            </chord>
          </measure>
        </part>
      </score-partwise>
    `;

    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: "/score-partwise/part/measure/chord/note[2]/pitch/step/text()",
        oldValue: "D",
        newValue: "E",
      },
    ];

    const result = processMusicXMLDiff(oldXml, newXml, tokens);

    // Only changed note is colored
    expect(result.oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("multiple consecutive deletions", () => {
    const oldXml = `<score-partwise><part id="P1"><measure><note/><note/><note/></measure></part></score-partwise>`;
    const newXml = `<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>`;
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[2]",
        name: "note",
      },
      {
        editType: XMLDiffTokenEditType.DELETE,
        nodeType: XMLDiffTokenNodeType.ELEMENT,
        xpath: "/score-partwise/part/measure/note[3]",
        name: "note",
      },
    ];

    const result = processMusicXMLDiff(oldXml, newXml, tokens);

    expect(result.oldXml).toMatch(/<note[^>]*color="#FF0000"[^>]*>/g);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("attribute-only change applied", () => {
    const oldXml = `<score-partwise><part id="P1"/></score-partwise>`;
    const newXml = `<score-partwise><part id="P2"/></score-partwise>`;
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.ATTRIBUTE,
        xpath: "/score-partwise/part/@id",
        name: "id",
        oldValue: "P1",
        newValue: "P2",
      },
    ];

    const result = processMusicXMLDiff(oldXml, newXml, tokens);

    expect(result.oldXml).toMatch(/<part[^>]*id="P1"[^>]*color="#FFFF00"[^>]*>/);
    expect(result.newXml).toMatch(/<part[^>]*id="P2"[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("text-only node change colors first colorable parent", () => {
    const oldXml = `<score-partwise><part id="P1"><lyric><syllabic>single</syllabic></lyric></part></score-partwise>`;
    const newXml = `<score-partwise><part id="P1"><lyric><syllabic>double</syllabic></lyric></part></score-partwise>`;
    const tokens: XMLDiffToken[] = [
      {
        editType: XMLDiffTokenEditType.CHANGE,
        nodeType: XMLDiffTokenNodeType.CONTENT,
        xpath: "/score-partwise/part/lyric/syllabic/text()",
        oldValue: "single",
        newValue: "double",
      },
    ];

    const result = processMusicXMLDiff(oldXml, newXml, tokens);

    // Color applied to first colorable parent (<lyric>)
    expect(result.oldXml).toMatch(/<lyric[^>]*color="#FFFF00"[^>]*>/);
    expect(result.newXml).toMatch(/<lyric[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });
});

describe("processMusicXMLDiff - integration via XMLDiff", () => {
  test("full diff from XMLDiff produces correct colored output", () => {
    const xmlDiff = new XMLDiff();
    const tokens = xmlDiff.computeXMLDiffTokens(BASE_OLD_XML, BASE_NEW_XML);
    const result = processMusicXMLDiff(BASE_OLD_XML, BASE_NEW_XML, tokens);

    expect(result.oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>\s*<pitch><step>D<\/step>/);
    expect(result.newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>\s*<pitch><step>E<\/step>/);
    expect(result.newXml).toMatch(/<measure[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });

  test("handles multiple simultaneous inserts, deletes, changes", () => {
    const OLD = `
      <score-partwise>
        <part id="P1">
          <measure number="1">
            <note><pitch><step>C</step></pitch></note>
            <note><pitch><step>D</step></pitch></note>
          </measure>
        </part>
      </score-partwise>`;
    const NEW = `
      <score-partwise>
        <part id="P1">
          <measure number="1">
            <note><pitch><step>C</step></pitch></note>
            <note><pitch><step>E</step></pitch></note>
            <note><pitch><step>F</step></pitch></note>
          </measure>
        </part>
      </score-partwise>`;

    const xmlDiff = new XMLDiff();
    const tokens = xmlDiff.computeXMLDiffTokens(OLD, NEW);
    const result = processMusicXMLDiff(OLD, NEW, tokens);

    expect(result.oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>\s*<pitch><step>D<\/step>/);
    expect(result.newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>\s*<pitch><step>E<\/step>/);
    expect(result.newXml).toMatch(/<measure[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens).toHaveLength(0);
  });
});
