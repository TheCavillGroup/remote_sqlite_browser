import { useEffect, useRef } from "preact/hooks";
import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { keymap, tooltips } from "@codemirror/view";
import { sql, SQLite } from "@codemirror/lang-sql";

interface Props {
    value: string;
    onChange(value: string): void;
    onRun(): void;
    /** table/view -> column names */
    schema: Record<string, string[]>;
}

const EDITOR_THEME = EditorView.theme({
    "&": { fontSize: "0.875rem" },
    ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
    // Fixed height, a growing editor forces the results grid to relayout every keystroke
    ".cm-scroller": { height: "240px" }
});

const sqlExtension = (schema : Record<string, string[]>) => sql({ dialect: SQLite, schema, upperCaseKeywords: true });

export default function SqlEditor({ value, onChange, onRun, schema } : Props) {
    const parentRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const langCompartment = useRef(new Compartment());
    const mounted = useRef(false);

    // Refs so the editor's listeners never see a stale closure
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun;

    // Empty deps on purpose, otherwise codemirror gets rebuilt every keystroke
    useEffect(() => {
        const view = new EditorView({
            parent: parentRef.current!,
            state: EditorState.create({
                doc: value,
                extensions: [
                    basicSetup,
                    Prec.highest(keymap.of([{
                        key: "Mod-Enter",
                        run: () => {
                            onRunRef.current();
                            return true;
                        }
                    }])),
                    // On body so tooltips aren't clipped by the editor's overflow
                    tooltips({ parent: document.body }),
                    langCompartment.current.of(sqlExtension(schema)),
                    EDITOR_THEME,
                    EditorView.updateListener.of(update => {
                        if(update.docChanged) onChangeRef.current(update.state.doc.toString());
                    })
                ]
            })
        });
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        }
    }, []);

    // Skip mount, the view was just built with this schema
    useEffect(() => {
        if(!mounted.current) {
            mounted.current = true;
            return;
        }
        viewRef.current?.dispatch({ effects: langCompartment.current.reconfigure(sqlExtension(schema)) });
    }, [schema]);

    useEffect(() => {
        const view = viewRef.current;
        if(!view) return;
        const current = view.state.doc.toString();
        if(value !== current) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }, [value]);

    return <div ref={parentRef} class="overflow-hidden rounded border border-gray-300 focus-within:border-blue-500"/>
}
