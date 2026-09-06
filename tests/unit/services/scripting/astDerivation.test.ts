import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { JsQuestionConfig } from '@shared/types/steps';

import { InputsPanel, OutputsPanel } from '../../../../client/src/components/builder/questions/js-question/CodeBlockPanels';
import { CodeBlockService } from '../../../../server/services/codeBlocks/CodeBlockService';
import { ASTValidator } from '../../../../server/services/scripting/ASTValidator';
import { ScriptEngine } from '../../../../server/services/scripting/ScriptEngine';

const validator = new ASTValidator();
const engine = new ScriptEngine();
const service = new CodeBlockService();
function config(code: string): JsQuestionConfig {
  return { code, inputs: [], outputs: [{ key: 'x', type: 'number' }] };
}

describe('CB-5 AST derivation', () => {
  it('AC 1: derives exactly a and b, deduplicating repeated reads', () => {
    expect(validator.validateJavaScript('emit({ x: input.a + input.b + input.a });').derivedInputs).toEqual(['a', 'b']);
  });
  it('AC 2: derives exactly the literal output keys', () => {
    expect(validator.validateJavaScript('emit({ x: 1, y: 2 });').derivedOutputs).toEqual(['x', 'y']);
  });
  it('AC 3: exposes derivation through ScriptEngine and renders editable persisted fields', async () => {
    const saved = config('emit({ x: input.a, y: 2 });');
    const result = await engine.validate({ language: 'javascript', code: saved.code });
    expect(result).toMatchObject({ valid: true, derivedInputs: ['a'], derivedOutputs: ['x', 'y'] });
    await service.validateForSave(saved);
    // CB-8 moved these controls out of the step card and into the editor
    // modal's rail. The property CB-5 cares about is unchanged and still
    // asserted here: a DERIVED key renders as an EDITABLE field, not a label.
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(InputsPanel, {
        inputs: saved.inputs, derivedKeys: ['a'], onChange: () => undefined,
      }),
      createElement(OutputsPanel, {
        outputs: saved.outputs, derivedKeys: ['x', 'y'], onChange: () => undefined,
      }),
    ));
    expect(html).toMatch(/aria-label="Input key 1"[^>]*value="a"/);
    expect(html).toMatch(/aria-label="Output key 2"[^>]*value="y"/);
    expect(html).toContain('aria-label="Required: a"');
    expect(html).toContain('aria-label="Type: y"');
    expect(html).not.toContain('readOnly');
    expect(html).not.toContain('readonly');
  });
  it('AC 4: preserves an unreferenced manual input and author settings across re-save', async () => {
    const saved = config('emit({ x: input.a, y: 2 });');
    saved.inputs = [{ key: 'manual_only', required: false }, { key: 'a', required: false }];
    expect(validator.validateJavaScript(saved.code).derivedInputs).toEqual(['a']);
    await service.validateForSave(saved);
    await service.validateForSave(saved);
    expect(saved.inputs).toEqual([{ key: 'manual_only', required: false }, { key: 'a', required: false }]);
    expect(saved.outputs).toEqual([{ key: 'x', type: 'number' }, { key: 'y', type: 'object' }]);
  });
  it('AC 5: dynamic input access warns, saves, and retains static keys', async () => {
    const saved = config('const someKey = "manual"; emit({ x: input.a + input[someKey] });');
    const result = await engine.validate({ language: 'javascript', code: saved.code });
    expect(result.warnings).toContain('Dynamic input access: declare input keys manually; they cannot all be derived from code.');
    expect(result.valid).toBe(true);
    expect(result.derivedInputs).toEqual(['a']);
    await expect(service.validateForSave(saved)).resolves.toBeUndefined();
    expect(saved.inputs).toEqual([{ key: 'a', required: true }]);
  });
  it('AC 6: non-literal emit warns, saves, and retains static output keys', async () => {
    const saved = config('const obj = {}; if (input.a) { emit({ x: 1, y: 2 }); } else { emit(obj); }');
    const result = await engine.validate({ language: 'javascript', code: saved.code });
    expect(result.warnings).toContain('Dynamic output access: declare output keys manually; they cannot all be derived from code.');
    expect(result.valid).toBe(true);
    expect(result.derivedOutputs).toEqual(['x', 'y']);
    await expect(service.validateForSave(saved)).resolves.toBeUndefined();
    expect(saved.outputs.map(output => output.key)).toEqual(['x', 'y']);
  });
  it('AC 7: nested member access derives a only', () => {
    expect(validator.validateJavaScript('emit({ x: input.a.b.c });').derivedInputs).toEqual(['a']);
  });
  it('handles shorthand, literal brackets, optional chains, spread and computed outputs honestly', () => {
    const result = validator.validateJavaScript('const x = input["a"]?.b; const obj = {}; const k = "z"; emit({ x, "y": 2, ...obj, [k]: 3 });');
    expect(result.valid).toBe(true);
    expect(result.derivedInputs).toEqual(['a']);
    expect(result.derivedOutputs).toEqual(['x', 'y']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toMatch(/Dynamic output access/);
  });
  it('does not mistake other objects and methods for input or emit', () => {
    const result = validator.validateJavaScript('const obj = { emit() {} }; obj.emit({ ignored: 1 }); emit({ x: other.a });');
    expect(result.derivedInputs).toEqual([]);
    expect(result.derivedOutputs).toEqual(['x']);
  });
  it('does not merge invalid scripts', async () => {
    const saved = config('emit({ y: input.a }); process.exit();');
    await expect(service.validateForSave(saved)).rejects.toThrow('Script validation failed');
    expect(saved.inputs).toEqual([]);
    expect(saved.outputs).toEqual([{ key: 'x', type: 'number' }]);
  });
});
