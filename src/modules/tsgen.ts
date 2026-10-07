import type { Row } from "./db.ts";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function inferColumnType(values : unknown[]) : string {
    const nonNull = new Set<string>();
    let nullable = false;
    for(const v of values) {
        if(v == null) {
            nullable = true;
            continue;
        }
        const t = typeof v;
        // Blobs come over the socket as {0:.., 1:..}
        nonNull.add(t === "number" || t === "bigint" ? "number" : t === "string" || t === "boolean" ? t : "unknown");
    }
    // Only nulls sampled
    if(nonNull.size === 0) return "unknown";
    const base = [...nonNull].sort().join(" | ");
    return nullable ? `${base} | null` : base;
}

export function generateRunSnippet(sql : string, rows : Row[]) : string {
    const query = sql.replace(/;\s*$/, "").trimEnd();
    const literal = "`" + query.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
    const multilineQuery = query.includes("\n");

    if(rows.length === 0) {
        const call = multilineQuery ? `db.run<Record<string, unknown>>(\n    ${literal},\n);` : `db.run<Record<string, unknown>>(${literal});`;
        return `// no rows sampled — could not infer column types\n${call}`;
    }

    const fields = Object.keys(rows[0]).map(c => ({
        key: IDENT.test(c) ? c : JSON.stringify(c),
        type: inferColumnType(rows.map(x => x[c]))
    }));

    if(multilineQuery) {
        const typeBlock = `{\n${fields.map(x => `    ${x.key}: ${x.type};`).join("\n")}\n}`;
        return `db.run<${typeBlock}>(\n    ${literal},\n);`;
    }

    return `db.run<{ ${fields.map(x => `${x.key}: ${x.type}`).join("; ")} }>(${literal});`;
}
