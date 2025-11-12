/**
 * ExpressionEditor - Monaco-based expression editor with autocomplete and diagnostics
 */

import { useRef, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAvailableVars } from '../hooks/useAvailableVars';
import { useHelpers } from '../hooks/useHelpers';
import { useExpressionValidation } from '../hooks/useExpressionValidation';

export interface ExpressionEditorProps {
  value: string;
  onChange: (value: string) => void;
  nodeId: string;
  workflowId: string;
  placeholder?: string;
  height?: string;
  language?: string;
}

export function ExpressionEditor({
  value,
  onChange,
  nodeId,
  workflowId,
  placeholder = 'Enter expression...',
  height = '100px',
  language = 'plaintext',
}: ExpressionEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  // Fetch available vars and helpers
  const { data: availableVarsData } = useAvailableVars(workflowId, nodeId);
  const { data: helpersData } = useHelpers();

  // Validation
  const { validate, validationResult, isValidating } = useExpressionValidation(
    workflowId,
    nodeId,
    300 // 300ms debounce
  );

  // Update validation when value changes
  useEffect(() => {
    if (value) {
      validate(value);
    }
  }, [value, validate]);

  // Update Monaco markers when validation result changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    // Clear previous markers
    monaco.editor.setModelMarkers(model, 'vl-expr', []);

    // Add new markers if there are errors
    if (validationResult && !validationResult.ok && validationResult.errors) {
      const markers = validationResult.errors.map((error) => ({
        severity: monaco.MarkerSeverity.Error,
        message: error.message,
        startLineNumber: error.start?.line ?? 1,
        startColumn: error.start?.col ?? 1,
        endLineNumber: error.end?.line ?? 1,
        endColumn: error.end?.col ?? 1000,
      }));

      monaco.editor.setModelMarkers(model, 'vl-expr', markers);
    }
  }, [validationResult]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register completion provider
    const disposable = monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];

        // Add variable suggestions
        if (availableVarsData?.vars) {
          for (const varName of availableVarsData.vars) {
            suggestions.push({
              label: varName,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: varName,
              range,
              detail: 'Variable',
            });
          }
        }

        // Add helper function suggestions
        if (helpersData?.helpers) {
          for (const helper of helpersData.helpers) {
            // Create snippet with placeholders
            const insertText = `${helper.name}(\${1:arg})`;

            suggestions.push({
              label: helper.name,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              detail: helper.signature,
              documentation: helper.doc,
            });
          }
        }

        return { suggestions };
      },
    });

    // Cleanup on unmount
    return () => {
      disposable.dispose();
    };
  };

  const handleChange = (value: string | undefined) => {
    onChange(value || '');
  };

  return (
    <div className="relative border rounded-md overflow-hidden">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          wordWrap: 'on',
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          padding: { top: 8, bottom: 8 },
          suggest: {
            showWords: false,
          },
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
        }}
        theme="vs-light"
      />
      {isValidating && (
        <div className="absolute top-2 right-2 text-xs text-muted-foreground">
          Validating...
        </div>
      )}
    </div>
  );
}
