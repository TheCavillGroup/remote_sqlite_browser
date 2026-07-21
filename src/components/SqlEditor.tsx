import { useEffect, useRef } from "preact/hooks";
import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { keymap, tooltips } from "@codemirror/view";
import { sql, SQLite } from "@codemirror/lang-sql";

interface Props {
    value: string;
    onChange: (value: string) => void;
    onRun: () => void;
    /** table/view name -> column names, for autocomplete. */
    schema: Record<string, string[]>;
}

function sqlExtension(schema: Record<string, string[]>) {
    return sql({ dialect: SQLite, schema, upperCaseKeywords: true });
}

const editorTheme = EditorView.theme({
    "&": { fontSize: "0.875rem" },
    ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        minHeight: "8rem",
    },
    ".cm-scroller": { maxHeight: "240px" },
});

export function SqlEditor({ value, onChange, onRun, schema }: Props) {
    const parentRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const langCompartment = useRef(new Compartment());

    // Keep the latest callbacks in refs so the persistent editor keymap/listener never
    // capture a stale closure.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun;

    // Create the editor once.
    useEffect(() => {
        const runKeymap = Prec.highest(
            keymap.of([
                {
                    key: "Mod-Enter",
                    run: () => {
                        onRunRef.current();
                        return true;
                    },
                },
            ]),
        );

        const view = new EditorView({
            parent: parentRef.current!,
            state: EditorState.create({
                doc: value,
                extensions: [
                    basicSetup,
                    runKeymap,
                    // Render completion/hover tooltips on <body> so they aren't clipped by the
                    // editor's own overflow (or its short height on the first line).
                    tooltips({ parent: document.body }),
                    langCompartment.current.of(sqlExtension(schema)),
                    editorTheme,
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            onChangeRef.current(update.state.doc.toString());
                        }
                    }),
                ],
            }),
        });
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    // Reconfigure autocomplete when the schema changes (e.g. after connecting).
    useEffect(() => {
        viewRef.current?.dispatch({
            effects: langCompartment.current.reconfigure(sqlExtension(schema)),
        });
    }, [schema]);

    // Push external value changes into the editor without clobbering user edits.
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (value !== current) {
            view.dispatch({
                changes: { from: 0, to: current.length, insert: value },
            });
        }
    }, [value]);

    return (
        <div
            ref={parentRef}
            class="overflow-hidden rounded border border-gray-300 focus-within:border-blue-500"
        />
    );
}
