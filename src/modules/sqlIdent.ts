/** Double-quote a SQLite identifier, escaping embedded double quotes. */
export function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}
