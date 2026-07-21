import type { Row } from "./db.ts";

/** Map a single JS value (as returned over the JSON socket) to a TS type name. */
function tsTypeOfValue(v: unknown): "number" | "string" | "boolean" | "unknown" {
    switch (typeof v) {
        case "number":
        case "bigint":
            return "number";
        case "string":
            return "string";
        case "boolean":
            return "boolean";
        default:
            // objects (blobs arrive as {0:.., 1:..} over JSON), functions, symbols…
            return "unknown";
    }
}

/** Infer a column's TS type from its values across the sampled rows. */
export function inferColumnType(values: unknown[]): string {
    const nonNull = new Set<string>();
    let nullable = false;
    for (const v of values) {
        if (v === null || v === undefined) {
            nullable = true;
            continue;
        }
        nonNull.add(tsTypeOfValue(v));
    }
    if (nonNull.size === 0) return "unknown"; // only nulls sampled — can't tell the real type
    const base = [...nonNull].sort().join(" | ");
    return nullable ? `${base} | null` : base;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A property key, quoted only when it isn't a bare TS identifier (e.g. `COUNT(*)`). */
function keyToken(key: string): string {
    return IDENT.test(key) ? key : JSON.stringify(key);
}

/** Escape a raw SQL string for embedding in a `...` template literal. */
function escapeTemplate(sql: string): string {
    return sql
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${");
}

/**
 * Build a `db.run<T>(query)` TypeScript snippet. Column types are inferred from `rows`; the
 * query text is preserved verbatim (a single trailing `;` is trimmed). Single-line queries get
 * a compact inline type, multiline queries an expanded type block.
 */
export function generateRunSnippet(sql: string, rows: Row[]): string {
    const query = sql.replace(/;\s*$/, "").trimEnd();
    const literal = `\`${escapeTemplate(query)}\``;
    const multilineQuery = query.includes("\n");

    if (rows.length === 0) {
        const call = multilineQuery
            ? `db.run<Record<string, unknown>>(\n    ${literal},\n);`
            : `db.run<Record<string, unknown>>(${literal});`;
        return `// no rows sampled — could not infer column types\n${call}`;
    }

    const columns = Object.keys(rows[0]);
    const fields = columns.map((c) => {
        const type = inferColumnType(rows.map((r) => r[c]));
        return { key: keyToken(c), type };
    });

    if (multilineQuery) {
        const typeBlock = `{\n${fields.map((f) => `    ${f.key}: ${f.type};`).join("\n")}\n}`;
        return `db.run<${typeBlock}>(\n    ${literal},\n);`;
    }

    const inlineType = `{ ${fields.map((f) => `${f.key}: ${f.type}`).join("; ")} }`;
    return `db.run<${inlineType}>(${literal});`;
}
