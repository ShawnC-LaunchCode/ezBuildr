import { createHash } from 'node:crypto';

import type { CodeBlockRun, Step } from '@shared/schema';
import {
  isJsQuestionConfig,
  LEGACY_JS_QUESTION_ADAPTER,
  type CodeBlockOutput,
  type JsQuestionConfig,
} from '@shared/types/steps';

import { logger } from '../../logger';
import { stepRepository, stepValueRepository } from '../../repositories';
import type { DbTransaction } from '../../repositories/BaseRepository';
import { codeBlockRunRepository } from '../../repositories/CodeBlockRunRepository';
import { getCurrentTenantId, withCurrentTenant } from '../../utils/rlsContext';
import { getVisibleStepIds } from '../runs/RunVisibility';
import { scriptEngine } from '../scripting/ScriptEngine';
import { validateAliasFormat } from '../stepAlias';

type CodeBlockDependencies = {
  stepRepo?: typeof stepRepository;
  valueRepo?: typeof stepValueRepository;
  engine?: typeof scriptEngine;
  stateRepo?: typeof codeBlockRunRepository;
};

type CodeBlockStepIdentity = Pick<Step, 'id' | 'workflowId' | 'pageId' | 'title' | 'config' | 'alias'>;
type CodeBlockOutputStep = Pick<Step, 'id' | 'alias'>;

type ExecuteCodeBlockParams = {
  step: CodeBlockStepIdentity;
  runId: string;
  workflowId: string;
  userId?: string;
  data: Record<string, unknown>;
  aliasMap?: Record<string, string>;
};

export type CodeBlockExecutionResult = {
  success: boolean;
  error?: string;
};

export type CodeBlockEvaluationResult = CodeBlockExecutionResult & { state: CodeBlockRun };

/** JSON object order is immaterial, including inside object/list inputs. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) { return value.map(canonicalize); }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value ?? null;
}

function resolveConfig(rawConfig: unknown): JsQuestionConfig | undefined {
  const adapted = LEGACY_JS_QUESTION_ADAPTER.resolveConfig(rawConfig);
  return isJsQuestionConfig(adapted) ? adapted : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueMatchesDeclaredType(value: unknown, output: CodeBlockOutput): boolean {
  if (value === null) { return true; }
  switch (output.type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'date': return value instanceof Date || typeof value === 'string';
    case 'object': return isRecord(value);
    case 'list': return Array.isArray(value);
  }
}

/** Owns Code Block validation, virtual-output steps, execution, and persistence. */
export class CodeBlockService {
  private readonly stepRepo: typeof stepRepository;
  private readonly valueRepo: typeof stepValueRepository;
  private readonly engine: typeof scriptEngine;
  private readonly stateRepo: typeof codeBlockRunRepository;

  constructor(dependencies: CodeBlockDependencies = {}) {
    this.stepRepo = dependencies.stepRepo ?? stepRepository;
    this.valueRepo = dependencies.valueRepo ?? stepValueRepository;
    this.engine = dependencies.engine ?? scriptEngine;
    this.stateRepo = dependencies.stateRepo ?? codeBlockRunRepository;
  }

  /** Evaluate one block. Eligibility/trigger selection belongs to the caller. */
  async evaluate(
    runId: string,
    definition: Pick<Step, 'id' | 'workflowId'>,
    data: Record<string, unknown>
  ): Promise<CodeBlockEvaluationResult> {
    const ownership = await withCurrentTenant(tx => this.stateRepo.findRunOwnership(runId, tx));
    if (!ownership) { throw new Error('Run not found'); }
    const tenantId = getCurrentTenantId();
    if (tenantId && ownership.tenantId !== tenantId) {
      throw new Error('Access denied - run belongs to different tenant');
    }
    if (ownership.run.workflowId !== definition.workflowId) {
      throw new Error('Access denied - Code Block belongs to different workflow');
    }
    const { runDefinitionProvider } = await import('../workflow-runs/RunDefinitionProvider');
    const runtime = await runDefinitionProvider.getDefinition(ownership.run);
    const step = runtime.steps.find(candidate => candidate.id === definition.id && candidate.type === 'js_question');
    if (!step) { throw new Error('Code Block not found in run definition'); }
    const config = resolveConfig(step.config);
    if (!config) { throw new Error(`Code Block "${step.title}" has an invalid configuration`); }

    const rows = await withCurrentTenant(tx => this.valueRepo.findByRunId(runId, tx));
    const byStepId = new Map(rows.map(row => [row.stepId, row.value]));
    const persistedData = Object.fromEntries(byStepId);
    const visible = new Set(getVisibleStepIds(runtime, persistedData));
    const pendingInputs: string[] = [];
    const entries = config.inputs.map(input => {
      const inputStep = runtime.steps.find(candidate => candidate.alias === input.key || candidate.id === input.key);
      const resolved = inputStep !== undefined && (byStepId.has(inputStep.id) || !visible.has(inputStep.id));
      if (input.required && !resolved) { pendingInputs.push(input.key); }
      return [input.key, inputStep ? byStepId.get(inputStep.id) ?? null : null] as const;
    });
    const previous = await withCurrentTenant(tx => this.stateRepo.findByRunAndStep(runId, step.id, tx));
    const base = { runId, stepId: step.id, firedAt: previous?.firedAt ?? null, errorMessage: null };
    if (pendingInputs.length > 0) {
      const state = await withCurrentTenant(tx => this.stateRepo.upsert({
        ...base, status: 'skipped_unready', pendingInputs, inputHash: previous?.inputHash ?? null,
      }, tx));
      return { success: true, state };
    }
    const inputs = Object.fromEntries(entries);
    const inputHash = createHash('sha256').update(JSON.stringify(canonicalize(inputs))).digest('hex');
    if (previous?.inputHash === inputHash && previous.firedAt !== null && previous.status !== 'error') {
      const state = await withCurrentTenant(tx => this.stateRepo.upsert({
        ...base, status: 'skipped_unchanged', pendingInputs: [], inputHash,
      }, tx));
      return { success: true, state };
    }
    const executionData = { ...inputs };
    const result = await this.execute({ step, runId, workflowId: ownership.run.workflowId, data: executionData });
    // execute adds virtual output IDs to its data map; expose them to subsequent evaluations.
    for (const [key, value] of Object.entries(executionData)) {
      if (!Object.hasOwn(inputs, key)) { data[key] = value; }
    }
    const state = await withCurrentTenant(tx => this.stateRepo.upsert({
      ...base,
      status: result.success ? 'fired' : 'error',
      inputHash: result.success ? inputHash : null,
      pendingInputs: [],
      errorMessage: result.error ?? null,
      firedAt: result.success ? new Date() : base.firedAt,
    }, tx));
    return { ...result, state };
  }

  async validateForSave(config: JsQuestionConfig): Promise<void> {
    for (const output of config.outputs) {
      validateAliasFormat(output.key);
    }
    const validation = await this.engine.validate({ language: 'javascript', code: config.code });
    if (!validation.valid) {
      throw new Error(`Script validation failed: ${validation.error ?? 'unknown reason'}`);
    }
  }

  async syncVirtualSteps(
    step: CodeBlockStepIdentity,
    previousConfig: unknown,
    nextConfig: JsQuestionConfig | undefined,
    tx: DbTransaction
  ): Promise<void> {
    const oldConfig = isJsQuestionConfig(previousConfig) ? previousConfig : undefined;
    const oldKeys = new Set((oldConfig?.outputs ?? []).map(output => output.key.toLowerCase()));
    const pageSteps = await this.stepRepo.findByPageId(step.pageId, tx, true);
    const oldVirtualSteps = pageSteps.filter(candidate => (
      candidate.isVirtual &&
      candidate.type === 'computed' &&
      candidate.alias !== null &&
      oldKeys.has(candidate.alias.toLowerCase())
    ));
    const oldVirtualByKey = new Map(
      oldVirtualSteps.map(candidate => [candidate.alias?.toLowerCase() ?? '', candidate])
    );
    const nextKeys = new Set((nextConfig?.outputs ?? []).map(output => output.key.toLowerCase()));

    for (const virtualStep of oldVirtualSteps) {
      if (virtualStep.alias !== null && !nextKeys.has(virtualStep.alias.toLowerCase())) {
        await this.stepRepo.softDelete(virtualStep.id, tx);
      }
    }

    if (!nextConfig) { return; }

    const workflowSteps = await this.stepRepo.findByWorkflowIdWithAliases(step.workflowId, tx);
    for (const output of nextConfig.outputs) {
      const normalizedKey = output.key.toLowerCase();
      const existingVirtual = oldVirtualByKey.get(normalizedKey);
      const aliasConflict = workflowSteps.find(candidate => (
        candidate.alias?.toLowerCase() === normalizedKey && candidate.id !== existingVirtual?.id
      ));
      if (aliasConflict) {
        throw Object.assign(
          new Error(`Output key "${output.key}" is already in use by another step in this workflow.`),
          { statusCode: 400 }
        );
      }

      const virtualData = {
        alias: output.key,
        title: `Computed: ${step.title} — ${output.key}`,
        description: output.description ?? `Virtual output for Code Block: ${step.title}`,
      };
      if (existingVirtual) {
        await this.stepRepo.update(existingVirtual.id, virtualData, tx);
      } else {
        await this.stepRepo.create({
          workflowId: step.workflowId,
          pageId: step.pageId,
          type: 'computed',
          required: false,
          order: -1,
          isVirtual: true,
          ...virtualData,
        }, tx);
      }
    }
  }

  async execute(params: ExecuteCodeBlockParams): Promise<CodeBlockExecutionResult> {
    const { step, runId, workflowId, userId, data, aliasMap } = params;
    const config = resolveConfig(step.config);
    if (!config) {
      return { success: false, error: `Code Block "${step.title}" has an invalid configuration` };
    }

    const usesLegacyMainOutput = !isJsQuestionConfig(step.config);
    const virtualSteps = await withCurrentTenant(async (tx) => {
      return this.resolveVirtualSteps(step, config, tx, usesLegacyMainOutput);
    });
    if (virtualSteps instanceof Error) {
      return { success: false, error: virtualSteps.message };
    }

    const preparedData = { ...data };
    const missingRequired = config.inputs.filter(input => {
      const dataKey = aliasMap?.[input.key] ?? input.key;
      if (dataKey in preparedData) { return false; }
      if (!input.required) {
        preparedData[dataKey] = null;
        return false;
      }
      return true;
    });
    if (missingRequired.length > 0) {
      return { success: true };
    }

    const result = await this.engine.execute({
      language: 'javascript',
      code: config.code,
      inputKeys: config.inputs.map(input => input.key),
      data: preparedData,
      context: {
        workflowId,
        runId,
        phase: 'question_execution',
        metadata: { stepId: step.id },
        userId,
      },
      timeoutMs: config.timeoutMs ?? 1000,
      aliasMap,
    });

    if (!result.ok) {
      await this.clearValues(runId, virtualSteps);
      return { success: false, error: `Code Block "${step.title}" failed: ${result.error ?? 'Unknown error'}` };
    }

    const outputValues = this.resolveOutputValues(result.output, config.outputs, usesLegacyMainOutput);
    if (outputValues instanceof Error) {
      await this.clearValues(runId, virtualSteps);
      return { success: false, error: `Code Block "${step.title}" failed: ${outputValues.message}` };
    }

    await this.persistValues(runId, virtualSteps, config.outputs, outputValues);
    for (const virtualStep of virtualSteps) {
      data[virtualStep.id] = outputValues[virtualStep.alias ?? ''] ?? null;
    }
    return { success: true };
  }

  private async resolveVirtualSteps(
    step: CodeBlockStepIdentity,
    config: JsQuestionConfig,
    tx: DbTransaction,
    usesLegacyMainOutput: boolean
  ): Promise<CodeBlockOutputStep[] | Error> {
    const pageSteps = await this.stepRepo.findByPageId(step.pageId, tx, true);
    const byAlias = new Map<string, CodeBlockOutputStep>(
      pageSteps
        .filter(candidate => candidate.isVirtual && candidate.type === 'computed' && candidate.alias !== null)
        .map(candidate => [candidate.alias as string, candidate])
    );
    const legacyOutput = config.outputs[0];
    if (usesLegacyMainOutput && legacyOutput !== undefined) {
      byAlias.set(legacyOutput.key, { id: step.id, alias: legacyOutput.key });
    }
    const virtualSteps: CodeBlockOutputStep[] = [];
    for (const output of config.outputs) {
      const virtualStep = byAlias.get(output.key);
      if (!virtualStep) {
        return new Error(`Code Block "${step.title}" output "${output.key}" has no virtual step`);
      }
      virtualSteps.push(virtualStep);
    }
    return virtualSteps;
  }

  private resolveOutputValues(
    emitted: unknown,
    outputs: CodeBlockOutput[],
    usesLegacyMainOutput: boolean
  ): Record<string, unknown> | Error {
    const firstOutput = outputs[0];
    if (usesLegacyMainOutput) {
      return firstOutput === undefined ? {} : { [firstOutput.key]: emitted ?? null };
    }
    if (!isRecord(emitted)) {
      if (firstOutput === undefined) { return {}; }
      return { [firstOutput.key]: emitted ?? null };
    }

    const declaredKeys = new Set(outputs.map(output => output.key));
    const undeclaredKeys = Object.keys(emitted).filter(key => !declaredKeys.has(key));
    if (undeclaredKeys.length > 0) {
      return new Error(`emitted undeclared output key(s): ${undeclaredKeys.join(', ')}`);
    }
    return emitted;
  }

  private async persistValues(
    runId: string,
    virtualSteps: CodeBlockOutputStep[],
    outputs: CodeBlockOutput[],
    values: Record<string, unknown>
  ): Promise<void> {
    for (const output of outputs) {
      const value = values[output.key] ?? null;
      if (!valueMatchesDeclaredType(value, output)) {
        logger.warn(
          { outputKey: output.key, declaredType: output.type, actualType: typeof value },
          'Code Block output did not match its declared authoring type'
        );
      }
    }
    await withCurrentTenant(tx => this.valueRepo.upsertMany(virtualSteps.map(virtualStep => ({
        runId,
        stepId: virtualStep.id,
        value: values[virtualStep.alias ?? ''] ?? null,
      })), tx));
  }

  private async clearValues(runId: string, virtualSteps: CodeBlockOutputStep[]): Promise<void> {
    await withCurrentTenant(async (tx) => {
      const outputStepIds = new Set(virtualSteps.map(step => step.id));
      const existing = await this.valueRepo.findByRunId(runId, tx);
      const valueIds = existing.filter(value => outputStepIds.has(value.stepId)).map(value => value.id);
      await this.valueRepo.deleteByIdsForRun(runId, valueIds, tx);
    });
  }
}

export const codeBlockService = new CodeBlockService();
