/**
 * The Monaco instance itself, isolated behind a lazy boundary.
 *
 * Nothing here is imported eagerly: `JSCodeEditor` pulls this module in with
 * `React.lazy`, so the ~1MB Monaco chunk is fetched the first time an author
 * opens a code editor and never on a cold builder load.
 *
 * Monaco is wired to the LOCAL `monaco-editor` package rather than
 * `@monaco-editor/react`'s default CDN loader. The default fetches a pinned,
 * different version from jsdelivr at runtime, which makes the core authoring
 * surface fail on a locked-down network and silently drift from the version in
 * `package.json`.
 */
import { loader, Editor, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { useCallback } from "react";

import type { CodeEditorHandle, CodeEditorMarker } from "./codeEditorTypes";

// Without workers Monaco keeps highlighting but loses diagnostics and
// completion — the two things that make it worth having over a textarea.
// Monaco reads this off the global by name; `Reflect.set` writes it without
// declaring a PascalCase property on `Window`, which the repo's
// naming-convention rule rejects. The value is still typed.
const monacoEnvironment: monaco.Environment = {
  getWorker(_workerId: string, label: string) {
    return label === "javascript" || label === "typescript" ? new tsWorker() : new editorWorker();
  },
};
Reflect.set(globalThis, "MonacoEnvironment", monacoEnvironment);
loader.config({ monaco });

/** Cool-tinted near-black / warm-white, derived from the app's own tokens. */
const DARK_THEME = "ezbuildr-dark";
const LIGHT_THEME = "ezbuildr-light";
let themesDefined = false;

function defineThemes(instance: typeof monaco): void {
  if (themesDefined) { return; }
  themesDefined = true;
  instance.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6B7385", fontStyle: "italic" },
      { token: "keyword", foreground: "7EA8FF" },
      { token: "string", foreground: "7FD1B9" },
      { token: "number", foreground: "E5A663" },
      { token: "delimiter", foreground: "A8B0C0" },
      { token: "identifier", foreground: "F4F5F6" },
    ],
    colors: {
      "editor.background": "#1C1F26",
      "editor.foreground": "#F4F5F6",
      "editorLineNumber.foreground": "#5A6273",
      "editorLineNumber.activeForeground": "#8F96A3",
      "editor.lineHighlightBackground": "#22262F",
      "editor.selectionBackground": "#2F4B85",
      "editorIndentGuide.background1": "#2B303B",
      "editorGutter.background": "#1C1F26",
      "editorError.foreground": "#E75555",
    },
  });
  instance.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6B7385", fontStyle: "italic" },
      { token: "keyword", foreground: "0C56E9" },
      { token: "string", foreground: "0E7A5F" },
      { token: "number", foreground: "A85A00" },
      { token: "delimiter", foreground: "5C6370" },
      { token: "identifier", foreground: "17191C" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#17191C",
      "editorLineNumber.foreground": "#A0A6B2",
      "editorLineNumber.activeForeground": "#5C6370",
      "editor.lineHighlightBackground": "#F3F5F8",
      "editorIndentGuide.background1": "#E4E7EC",
      "editorGutter.background": "#FFFFFF",
      "editorError.foreground": "#BC1B1B",
    },
  });
}

interface MonacoCodeFieldProps {
  code: string;
  onChange: (code: string) => void;
  isDark: boolean;
  ariaLabel: string;
  markers: CodeEditorMarker[];
  onReady?: (handle: CodeEditorHandle) => void;
}

export default function MonacoCodeField({
  code, onChange, isDark, ariaLabel, markers, onReady,
}: MonacoCodeFieldProps): JSX.Element {
  const handleMount = useCallback<OnMount>((editor, instance) => {
    defineThemes(instance as unknown as typeof monaco);
    instance.editor.setTheme(isDark ? DARK_THEME : LIGHT_THEME);
    // The block body is a function body, not a module: `emit`, `input` and
    // `helpers` are injected by the sandbox and would otherwise be flagged as
    // undefined on every single line.
    instance.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
    editor.updateOptions({ ariaLabel });
    onReady?.({
      insertAtCursor(text: string) {
        const selection = editor.getSelection();
        if (!selection) { return; }
        editor.executeEdits("variable-picker", [{ range: selection, text, forceMoveMarkers: true }]);
        editor.focus();
      },
      focus() { editor.focus(); },
      isFocused: () => editor.hasTextFocus(),
    });
    const model = editor.getModel();
    if (model) { instance.editor.setModelMarkers(model, "code-block", markers); }
  }, [ariaLabel, isDark, markers, onReady]);

  return (
    <Editor
      language="javascript"
      value={code}
      theme={isDark ? DARK_THEME : LIGHT_THEME}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        fontLigatures: true,
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        smoothScrolling: true,
        cursorBlinking: "smooth",
        tabSize: 2,
        bracketPairColorization: { enabled: true },
        matchBrackets: "always",
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        overviewRulerLanes: 0,
      }}
    />
  );
}
