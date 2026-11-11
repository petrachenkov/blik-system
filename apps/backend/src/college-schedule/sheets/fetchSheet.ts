import Papa from "papaparse";

/**
 * Downloads a single tab of a public Google Sheet as CSV via the gviz endpoint
 * (works by sheet *name*, so we don't need to know internal gids).
 */
export async function fetchSheetTabCsv(spreadsheetId: string, sheetName: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet "${sheetName}" (${spreadsheetId}): HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) return []; // an empty/unused tab returns an empty body

  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  if (parsed.errors.length) {
    // papaparse reports some benign warnings (row-length mismatches, delimiter
    // guessing on tiny/empty content); only bail on genuinely fatal issues
    const fatal = parsed.errors.filter((e) => e.type !== "FieldMismatch" && e.code !== "UndetectableDelimiter");
    if (fatal.length) throw new Error(`CSV parse error for "${sheetName}": ${fatal[0].message}`);
  }
  return parsed.data as string[][];
}

/** Fetches the workbook's tab names by reading the xlsx package's workbook.xml is overkill at runtime;
 * instead tab names are configured explicitly per-spreadsheet since they rarely change. */
