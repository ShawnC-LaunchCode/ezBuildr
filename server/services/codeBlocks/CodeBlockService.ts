import type { Step } from '@shared/schema';
import {
  isJsQuestionConfig,
  LEGACY_JS_QUESTION_ADAPTER,
  type CodeBlockOutput,
  type JsQuestionConfig,
} from '@shared/types/steps';

import { logger } from '../../logger';
import { stepRepository, stepValueRepository } from '../../repositories';
import type { DbTransaction } from '../../repositories/BaseRepository';
import { withCurrentTenant } from '../../utils/rlsContext';
import { scriptEngine } from '../scripting/ScriptEngine';
import { validateAliasFormat } from '../stepAlias';

type CodeBlockDependencies = {
  stepRepo?: typeof stepRepository;
  valueRepo?: typeof stepValueRepository;
  engine?: typeof scriptEngine;
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

  constructor(dependencies: CodeBlockDependencies = {}) {
    this.stepRepo = dependencies.stepRepo ?? stepRepository;
    this.valueRepo = dependencies.valueRepo ?? stepValueRepository;
    this.engine = dependencies.engine ?? scriptEngine;
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
