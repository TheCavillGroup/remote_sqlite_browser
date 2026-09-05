import type { Row } from "./db.ts";

const SAMPLE_ROWS = 50;
const MIN_COL_CH = 6;
const MAX_COL_CH = 40;

/**
 * Character width per column, sampled from the header and the first SAMPLE_ROWS values. Feeding
 * these to a table-layout:fixed <colgroup> is what keeps the browser from measuring every cell to
 * size the columns — that measurement is what makes a large grid expensive to lay out, and it gets
 * forced synchronously every time anything else on the page (i.e. the SQL editor) dirties layout.
 */
export function columnWidths(
    columns: string[],
    rows: Row[],
    format: (v: unknown) => string,
): number[] {
    const sample = rows.slice(0, SAMPLE_ROWS);
    return columns.map((c) => {
        let widest = c.length;
        for (const row of sample) {
            const len = format(row[c]).length;
            if (len > widest) widest = len;
        }
        return Math.min(MAX_COL_CH, Math.max(MIN_COL_CH, widest));
    });
}
