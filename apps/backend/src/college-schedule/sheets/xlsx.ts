import JSZip from "jszip";
import { classifyWeekColor, type WeekColor } from "../util/tinyPng.js";

export interface WeekMarkers {
  // key: `${row}:${col}` (0-indexed, same space as the parsed grid) -> colors ordered top-to-bottom
  byCell: Map<string, WeekColor[]>;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1; // 0-indexed
}

/** Splits an XML document into top-level occurrences of a tag, each returned whole (open+content+close, or self-closing). */
function* iterTags(xml: string, tag: string): Generator<string> {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</${tag}>)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) yield m[0];
}

function attr(tagXml: string, name: string): string | null {
  const m = tagXml.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

export function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  for (const si of iterTags(xml, "si")) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]));
    result.push(texts.join(""));
  }
  return result;
}

/**
 * Parses a worksheet's <sheetData> into a dense 0-indexed string[][] grid.
 * Merged cells only carry a value in their top-left cell (as OOXML stores it),
 * matching how the rest of the parser already expects blank continuation cells.
 */
export function parseSheetGrid(xml: string, sharedStrings: string[]): string[][] {
  const grid: string[][] = [];
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(xml))) {
    const [, colLetters, rowStr, attrs, inner] = m;
    const row = Number(rowStr) - 1; // -> 0-indexed
    const col = colLetterToIndex(colLetters);
    const type = attr(attrs, "t");

    let value = "";
    if (inner) {
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unescapeXml(x[1])).join("");
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) {
          // Google's xlsx export writes plain integers as floats ("1" -> "1.0");
          // strip that back since nothing in this sheet actually needs decimals.
          value = type === "s" ? sharedStrings[Number(v[1])] ?? "" : v[1].replace(/^(-?\d+)\.0$/, "$1");
        }
      }
    }
    if (!value) continue;
    if (!grid[row]) grid[row] = [];
    grid[row][col] = value;
  }
  // fill gaps so every row is a dense array up to its own max column
  for (const row of grid) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
  }
  return grid;
}

interface RelEntry {
  id: string;
  target: string;
}

function parseRels(xml: string): RelEntry[] {
  return [...iterTags(xml, "Relationship")].map((tag) => ({
    id: attr(tag, "Id")!,
    target: attr(tag, "Target")!,
  }));
}

function resolveRelPath(basePath: string, target: string): string {
  // basePath like "xl/worksheets/sheet1.xml" + target "../drawings/drawing1.xml"
  const baseDir = basePath.split("/").slice(0, -1); // ["xl","worksheets"]
  const parts = target.split("/");
  const stack = [...baseDir];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== ".") stack.push(part);
  }
  return stack.join("/");
}

interface DrawingAnchor {
  row: number;
  col: number;
  rowOff: number;
  rId: string;
}

function parseDrawingAnchors(xml: string): DrawingAnchor[] {
  const anchors: DrawingAnchor[] = [];
  for (const block of iterTags(xml, "xdr:oneCellAnchor")) {
    const row = block.match(/<xdr:row>(\d+)<\/xdr:row>/);
    const col = block.match(/<xdr:col>(\d+)<\/xdr:col>/);
    const rowOff = block.match(/<xdr:rowOff>(\d+)<\/xdr:rowOff>/);
    const rId = block.match(/r:embed="([^"]+)"/);
    if (row && col && rId) {
      anchors.push({
        row: Number(row[1]),
        col: Number(col[1]),
        rowOff: rowOff ? Number(rowOff[1]) : 0,
        rId: rId[1],
      });
    }
  }
  return anchors;
}

/**
 * Caching this by path alone must never outlive a single `openWorkbook()` fetch: each
 * poll downloads a brand-new export from Google, and Google does not guarantee that a
 * given media filename (e.g. "xl/media/image12.png") stays mapped to the same physical
 * picture across separate export calls. A process-lifetime cache previously reused a
 * stale color for a same-named-but-different-content image on later polls, causing the
 * red/blue week markers to intermittently and silently come out wrong — reproduced by
 * fetching the same sheet three times in a row and seeing one come out corrupted.
 */
async function getImageColor(zip: JSZip, path: string, cache: Map<string, WeekColor | null>): Promise<WeekColor | null> {
  if (cache.has(path)) return cache.get(path)!;
  const file = zip.file(path);
  if (!file) return null;
  const buf = await file.async("nodebuffer");
  const color = classifyWeekColor(buf);
  cache.set(path, color);
  return color;
}

/** Loads the red/blue week-circle markers for one worksheet, keyed by the same (row,col) space as parseSheetGrid. */
export async function loadWeekMarkersForSheet(zip: JSZip, sheetPath: string): Promise<WeekMarkers> {
  const byCell = new Map<string, WeekColor[]>();
  const sheetName = sheetPath.split("/").pop()!; // "sheet4.xml"
  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) return { byCell };

  const relsXml = await relsFile.async("text");
  const drawingRel = parseRels(relsXml).find((r) => r.target.includes("drawing"));
  if (!drawingRel) return { byCell };

  const drawingPath = resolveRelPath(sheetPath, drawingRel.target);
  const drawingFile = zip.file(drawingPath);
  if (!drawingFile) return { byCell };

  const drawingXml = await drawingFile.async("text");
  const anchors = parseDrawingAnchors(drawingXml);
  if (anchors.length === 0) return { byCell };

  const drawingRelsPath = resolveRelPath(drawingPath, `_rels/${drawingPath.split("/").pop()}.rels`);
  const drawingRelsFile = zip.file(drawingRelsPath);
  const drawingRels = drawingRelsFile ? parseRels(await drawingRelsFile.async("text")) : [];
  const ridToMediaPath = new Map(drawingRels.map((r) => [r.id, resolveRelPath(drawingPath, r.target)]));

  const grouped = new Map<string, DrawingAnchor[]>();
  for (const a of anchors) {
    const key = `${a.row}:${a.col}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }

  const imageColorCache = new Map<string, WeekColor | null>();
  for (const [key, group] of grouped) {
    group.sort((a, b) => a.rowOff - b.rowOff);
    const colors: WeekColor[] = [];
    for (const a of group) {
      const mediaPath = ridToMediaPath.get(a.rId);
      const color = mediaPath ? await getImageColor(zip, mediaPath, imageColorCache) : null;
      if (color) colors.push(color);
    }
    if (colors.length) byCell.set(key, colors);
  }

  return { byCell };
}

export interface WorkbookSheetRef {
  name: string;
  path: string; // e.g. "xl/worksheets/sheet1.xml"
}

export async function openWorkbook(spreadsheetId: string) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch xlsx (${spreadsheetId}): HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);

  const workbookXml = await zip.file("xl/workbook.xml")!.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")!.async("text");
  const rels = new Map(parseRels(relsXml).map((r) => [r.id, r.target]));

  const sheets: WorkbookSheetRef[] = [];
  for (const tag of iterTags(workbookXml, "sheet")) {
    const name = unescapeXml(attr(tag, "name") || "");
    const rId = attr(tag, "r:id");
    if (!rId) continue;
    const target = rels.get(rId);
    if (!target) continue;
    sheets.push({ name, path: resolveRelPath("xl/workbook.xml", target) });
  }

  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsFile ? parseSharedStrings(await sharedStringsFile.async("text")) : [];

  return { zip, sheets, sharedStrings };
}

export async function loadSheetGrid(zip: JSZip, sheetPath: string, sharedStrings: string[]): Promise<string[][]> {
  const xml = await zip.file(sheetPath)!.async("text");
  return parseSheetGrid(xml, sharedStrings);
}
