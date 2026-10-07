import type { Row } from "./db.ts";

const SAMPLE_ROWS = 50;
const MIN_COL_CH = 6;
const MAX_COL_CH = 40;

// For a table-layout:fixed colgroup, otherwise the browser measures every cell whenever the editor dirties layout
export function columnWidths(columns : string[], rows : Row[], format : (v : unknown) => string) : number[] {
    const sample = rows.slice(0, SAMPLE_ROWS);
    return columns.map(c => {
        let widest = c.length;
        for(const row of sample) {
            const len = format(row[c]).length;
            if(len > widest) widest = len;
        }
        return Math.min(MAX_COL_CH, Math.max(MIN_COL_CH, widest));
    });
}
