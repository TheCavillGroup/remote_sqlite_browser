interface Props {
    columns: string[];
    rows: Record<string, unknown>[];
}

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return "NULL";
    if (v instanceof Uint8Array) return `<blob ${v.length}b>`;
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

export function ResultsTable({ columns, rows }: Props) {
    if (rows.length === 0) {
        return <p class="p-4 text-sm text-gray-400">No rows.</p>;
    }

    const cols = columns.length ? columns : Object.keys(rows[0]);

    return (
        <div class="overflow-auto">
            <table class="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead class="sticky top-0 bg-gray-100">
                    <tr>
                        {cols.map((c) => (
                            <th key={c} class="whitespace-nowrap px-3 py-1.5 font-semibold text-gray-700">
                                {c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                        <tr key={i} class="even:bg-gray-50">
                            {cols.map((c) => (
                                <td key={c} class="whitespace-nowrap px-3 py-1 font-mono text-gray-800">
                                    {formatCell(row[c])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
