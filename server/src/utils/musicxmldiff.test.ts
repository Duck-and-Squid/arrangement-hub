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
    expect(result.unusedTokens.some((t) => t.xpath === "/score-partwise/part/@id")).toBe(true);
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
    expect(result.oldXml).not.toMatch(/color=/);
    expect(result.newXml).not.toMatch(/color=/);
    expect(result.unusedTokens.some((t) => t.xpath === "/score-partwise/part/@id")).toBe(true);
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
    expect(result.newXml).not.toMatch(/<measure[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens.length).toBeGreaterThan(0);
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
    expect(result.newXml).not.toMatch(/<measure[^>]*color="#FFFF00"[^>]*>/);
    expect(result.unusedTokens.length).toBeGreaterThan(0);
  });
});

describe("processMusicXMLDiff - regression tests on real examples", () => {
  test("detects note-level changes but ignores duration/type/measure diffs", () => {
    const aXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Untitled score</work-title>
    </work>
  <identification>
    <creator type="composer">Composer / arranger</creator>
    <encoding>
      <software>MuseScore 4.5.2</software>
      <encoding-date>2025-09-04</encoding-date>
      <supports element="accidental" type="yes"/>
      <supports element="beam" type="yes"/>
      <supports element="print" attribute="new-page" type="yes" value="yes"/>
      <supports element="print" attribute="new-system" type="yes" value="yes"/>
      <supports element="stem" type="yes"/>
      </encoding>
    </identification>
  <defaults>
    <scaling>
      <millimeters>6.99912</millimeters>
      <tenths>40</tenths>
      </scaling>
    <page-layout>
      <page-height>1596.77</page-height>
      <page-width>1233.87</page-width>
      <page-margins type="even">
        <left-margin>85.725</left-margin>
        <right-margin>85.725</right-margin>
        <top-margin>85.725</top-margin>
        <bottom-margin>85.725</bottom-margin>
        </page-margins>
      <page-margins type="odd">
        <left-margin>85.725</left-margin>
        <right-margin>85.725</right-margin>
        <top-margin>85.725</top-margin>
        <bottom-margin>85.725</bottom-margin>
        </page-margins>
      </page-layout>
    <appearance>
      <line-width type="light barline">1.8</line-width>
      <line-width type="heavy barline">5.5</line-width>
      <line-width type="beam">5</line-width>
      <line-width type="bracket">4.5</line-width>
      <line-width type="dashes">1</line-width>
      <line-width type="enclosure">1</line-width>
      <line-width type="ending">1.1</line-width>
      <line-width type="extend">1</line-width>
      <line-width type="leger">1.6</line-width>
      <line-width type="pedal">1.1</line-width>
      <line-width type="octave shift">1.1</line-width>
      <line-width type="slur middle">2.1</line-width>
      <line-width type="slur tip">0.5</line-width>
      <line-width type="staff">1.1</line-width>
      <line-width type="stem">1</line-width>
      <line-width type="tie middle">2.1</line-width>
      <line-width type="tie tip">0.5</line-width>
      <line-width type="tuplet bracket">1</line-width>
      <line-width type="wedge">1.2</line-width>
      <note-size type="cue">70</note-size>
      <note-size type="grace">70</note-size>
      <note-size type="grace-cue">49</note-size>
      </appearance>
    <music-font font-family="Leland"/>
    <word-font font-family="Edwin" font-size="10"/>
    <lyric-font font-family="Edwin" font-size="10"/>
    </defaults>
  <credit page="1">
    <credit-type>title</credit-type>
    <credit-words default-x="616.9347" default-y="1511.047129" justify="center" valign="top" font-size="22">Untitled score</credit-words>
    </credit>
  <credit page="1">
    <credit-type>subtitle</credit-type>
    <credit-words default-x="616.9347" default-y="1453.897088" justify="center" valign="top" font-size="14">Subtitle</credit-words>
    </credit>
  <credit page="1">
    <credit-type>composer</credit-type>
    <credit-words default-x="1148.144364" default-y="1411.047256" justify="right" valign="bottom">Composer / arranger</credit-words>
    </credit>
  <part-list>
    <score-part id="P1">
      <part-name>Voice</part-name>
      <part-abbreviation>Vo.</part-abbreviation>
      <score-instrument id="P1-I1">
        <instrument-name>Voice</instrument-name>
        <instrument-sound>voice.vocals</instrument-sound>
        </score-instrument>
      <midi-device id="P1-I1" port="1"></midi-device>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>53</midi-program>
        <volume>78.7402</volume>
        <pan>0</pan>
        </midi-instrument>
      </score-part>
    </part-list>
  <part id="P1">
    <measure number="1" width="661.82">
      <print>
        <system-layout>
          <system-margins>
            <left-margin>50</left-margin>
            <right-margin>0</right-margin>
            </system-margins>
          <top-system-distance>170</top-system-distance>
          </system-layout>
        </print>
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
          </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
          </clef>
        </attributes>
      <note default-x="80.21" default-y="-50">
        <pitch>
          <step>C</step>
          <octave>4</octave>
          </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="225.16" default-y="-45">
        <pitch>
          <step>D</step>
          <octave>4</octave>
          </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="370.11" default-y="-40">
        <pitch>
          <step>E</step>
          <octave>4</octave>
          </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="515.07" default-y="-35">
        <pitch>
          <step>F</step>
          <octave>4</octave>
          </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      </measure>
    <measure number="2" width="350.6">
      <note default-x="12.5" default-y="-30">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        </note>
      <barline location="right">
        <bar-style>light-heavy</bar-style>
        </barline>
      </measure>
    </part>
  </score-partwise>
`;
    const bXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Untitled score</work-title>
    </work>
  <identification>
    <creator type="composer">Composer / arranger</creator>
    <encoding>
      <software>MuseScore 4.5.2</software>
      <encoding-date>2025-09-04</encoding-date>
      <supports element="accidental" type="yes"/>
      <supports element="beam" type="yes"/>
      <supports element="print" attribute="new-page" type="yes" value="yes"/>
      <supports element="print" attribute="new-system" type="yes" value="yes"/>
      <supports element="stem" type="yes"/>
      </encoding>
    </identification>
  <defaults>
    <scaling>
      <millimeters>6.99912</millimeters>
      <tenths>40</tenths>
      </scaling>
    <page-layout>
      <page-height>1596.77</page-height>
      <page-width>1233.87</page-width>
      <page-margins type="even">
        <left-margin>85.725</left-margin>
        <right-margin>85.725</right-margin>
        <top-margin>85.725</top-margin>
        <bottom-margin>85.725</bottom-margin>
        </page-margins>
      <page-margins type="odd">
        <left-margin>85.725</left-margin>
        <right-margin>85.725</right-margin>
        <top-margin>85.725</top-margin>
        <bottom-margin>85.725</bottom-margin>
        </page-margins>
      </page-layout>
    <appearance>
      <line-width type="light barline">1.8</line-width>
      <line-width type="heavy barline">5.5</line-width>
      <line-width type="beam">5</line-width>
      <line-width type="bracket">4.5</line-width>
      <line-width type="dashes">1</line-width>
      <line-width type="enclosure">1</line-width>
      <line-width type="ending">1.1</line-width>
      <line-width type="extend">1</line-width>
      <line-width type="leger">1.6</line-width>
      <line-width type="pedal">1.1</line-width>
      <line-width type="octave shift">1.1</line-width>
      <line-width type="slur middle">2.1</line-width>
      <line-width type="slur tip">0.5</line-width>
      <line-width type="staff">1.1</line-width>
      <line-width type="stem">1</line-width>
      <line-width type="tie middle">2.1</line-width>
      <line-width type="tie tip">0.5</line-width>
      <line-width type="tuplet bracket">1</line-width>
      <line-width type="wedge">1.2</line-width>
      <note-size type="cue">70</note-size>
      <note-size type="grace">70</note-size>
      <note-size type="grace-cue">49</note-size>
      </appearance>
    <music-font font-family="Leland"/>
    <word-font font-family="Edwin" font-size="10"/>
    <lyric-font font-family="Edwin" font-size="10"/>
    </defaults>
  <credit page="1">
    <credit-type>title</credit-type>
    <credit-words default-x="616.9347" default-y="1511.047129" justify="center" valign="top" font-size="22">Untitled score</credit-words>
    </credit>
  <credit page="1">
    <credit-type>subtitle</credit-type>
    <credit-words default-x="616.9347" default-y="1453.897088" justify="center" valign="top" font-size="14">Subtitle</credit-words>
    </credit>
  <credit page="1">
    <credit-type>composer</credit-type>
    <credit-words default-x="1148.144364" default-y="1411.047256" justify="right" valign="bottom">Composer / arranger</credit-words>
    </credit>
  <part-list>
    <score-part id="P1">
      <part-name>Voice</part-name>
      <part-abbreviation>Vo.</part-abbreviation>
      <score-instrument id="P1-I1">
        <instrument-name>Voice</instrument-name>
        <instrument-sound>voice.vocals</instrument-sound>
        </score-instrument>
      <midi-device id="P1-I1" port="1"></midi-device>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>53</midi-program>
        <volume>78.7402</volume>
        <pan>0</pan>
        </midi-instrument>
      </score-part>
    </part-list>
  <part id="P1">
    <measure number="1" width="176.48">
      <print>
        <system-layout>
          <system-margins>
            <left-margin>50</left-margin>
            <right-margin>0</right-margin>
            </system-margins>
          <top-system-distance>170</top-system-distance>
          </system-layout>
        </print>
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
          </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
          </clef>
        </attributes>
      <note default-x="80.21" default-y="-50">
        <pitch>
          <step>C</step>
          <octave>4</octave>
          </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="107.2" default-y="-45">
        <pitch>
          <step>D</step>
          <octave>4</octave>
          </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="134.19" default-y="-40">
        <pitch>
          <step>E</step>
          <octave>4</octave>
          </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>up</stem>
        </note>
      </measure>
    <measure number="2" width="85.19">
      <note default-x="12.5" default-y="-30">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        </note>
      <barline location="right">
        <bar-style>light-heavy</bar-style>
        </barline>
      </measure>
    </part>
  </score-partwise>
`;

    const diffTokens = new XMLDiff().computeXMLDiffTokens(aXML, bXML);
    const { oldXml, newXml, unusedTokens } = processMusicXMLDiff(aXML, bXML, diffTokens);
    expect(oldXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>\s*<pitch>\s*<step>E<\/step>/);
    expect(newXml).toMatch(/<note[^>]*color="#FFFF00"[^>]*>\s*<pitch>\s*<step>E<\/step>/);
    expect(newXml).not.toMatch(/<duration[^>]*color=/);
    expect(newXml).not.toMatch(/<type[^>]*color=/);
    expect(newXml).not.toMatch(/<measure[^>]*color=/);
    expect(unusedTokens.length).toBeGreaterThan(0);
  });
});
