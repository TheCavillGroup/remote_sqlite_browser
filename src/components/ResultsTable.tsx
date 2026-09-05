import { useMemo } from "preact/hooks";
import { columnWidths } from "../modules/colWidths.ts";
import { selectCell, useStore } from "../state/store.ts";

interface Props {
    columns: string[];
    rows: Record<string, unknown>[];
}

// Cells are clipped to their column width anyway, so there's no point putting a long string into a
// text node — the full value still reaches the inspector via selectCell.
const MAX_CELL_CHARS = 80;

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return "NULL";
    if (v instanceof Uint8Array) return `<blob ${v.length}b>`;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) + "…" : s;
}

export function ResultsTable({ columns, rows }: Props) {
    const selectedCell = useStore((s) => s.selectedCell);

    const cols = columns.length ? columns : rows.length ? Object.keys(rows[0]) : [];
    const widths = useMemo(() => columnWidths(cols, rows, formatCell), [cols, rows]);

    if (rows.length === 0) {
        return <p class="p-4 text-sm text-gray-400">No rows.</p>;
    }

    const total = widths.reduce((a, b) => a + b, 0);

    return (
        // contain keeps the grid's layout from being redone whenever something outside it (the SQL
        // editor growing a scrollbar, say) dirties the page.
        <div class="overflow-auto [contain:layout_paint]">
            {/* font-mono on the table so the ch units below resolve against the cells' own font. */}
            <table
                class="min-w-full table-fixed divide-y divide-gray-200 text-left font-mono text-sm"
                style={{ width: `${total}ch` }}
            >
                <colgroup>
                    {cols.map((c, i) => <col key={c} style={{ width: `${widths[i]}ch` }} />)}
                </colgroup>
                <thead class="sticky top-0 bg-gray-100">
                    <tr>
                        {cols.map((c) => (
                            <th
                                key={c}
                                title={c}
                                class="truncate px-3 py-1.5 font-sans font-semibold text-gray-700"
                            >
                                {c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                        <tr key={i} class="even:bg-gray-50">
                            {cols.map((c) => {
                                const isSelected = selectedCell?.column === c &&
                                    selectedCell?.value === row[c];
                                return (
                                    <td
                                        key={c}
                                        onClick={() => selectCell(c, row[c])}
                                        title="Click to inspect"
                                        class={`cursor-pointer truncate px-3 py-1 text-gray-800 ${
                                            isSelected ? "bg-blue-100 ring-1 ring-inset ring-blue-400" : ""
                                        }`}
                                    >
                                        {formatCell(row[c])}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
