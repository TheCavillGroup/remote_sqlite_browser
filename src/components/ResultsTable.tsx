import { columnWidths } from "../modules/colWidths.ts";
import { selectCell, useStore } from "../state/store.ts";

// Cells get clipped anyway, the full value still goes to the inspector
const MAX_CELL_CHARS = 80;

interface Props {
    columns: string[];
    rows: Record<string, unknown>[];
}

function formatCell(v : unknown) : string {
    if(v == null) return "NULL";
    if(v instanceof Uint8Array) return `<blob ${v.length}b>`;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) + "…" : s;
}

export default function ResultsTable({ columns, rows } : Props) {
    const selectedCell = useStore(s => s.selectedCell);

    const cols = columns.length ? columns : rows.length ? Object.keys(rows[0]) : [];
    const widths = columnWidths(cols, rows, formatCell);

    if(rows.length === 0) return <p class="p-4 text-sm text-gray-400">No rows.</p>

    const total = widths.reduce((a, b) => a + b, 0);

    // contain stops outside layout changes (editor scrollbar etc) from relaying out the grid.
    // font-mono is on the table so ch resolves against the cell font
    return <div class="overflow-auto [contain:layout_paint]">
        <table
            class="min-w-full table-fixed divide-y divide-gray-200 text-left font-mono text-sm"
            style={{ width: `${total}ch` }}
        >
            <colgroup>
                {
                    cols.map((c, i) => <col key={c} style={{ width: `${widths[i]}ch` }}/>)
                }
            </colgroup>
            <thead class="sticky top-0 bg-gray-100">
                <tr>
                    {
                        cols.map(c => <th key={c} title={c} class="truncate px-3 py-1.5 font-sans font-semibold text-gray-700">
                            {c}
                        </th>)
                    }
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                {
                    rows.map((row, i) => <tr key={i} class="even:bg-gray-50">
                        {
                            cols.map(c => <td
                                key={c}
                                onClick={() => selectCell(c, row[c])}
                                title="Click to inspect"
                                class={`cursor-pointer truncate px-3 py-1 text-gray-800 ${selectedCell?.column === c && selectedCell?.value === row[c] ? "bg-blue-100 ring-1 ring-inset ring-blue-400" : ""}`}
                            >
                                {formatCell(row[c])}
                            </td>)
                        }
                    </tr>)
                }
            </tbody>
        </table>
    </div>
}
