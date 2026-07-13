import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { sections, steps, logicRules, transformBlocks, lifecycleHooks, documentHooks } from "../../shared/schema";
import { normalizeWorkflowTypes, validateWorkflowStructure } from "./ai/AIServiceUtils";
import { createLogger } from '../logger';
import { generateUniqueAliasFromTaken } from "./stepAlias";

import type { InsertStep, InsertLogicRule, InsertTransformBlock, InsertLifecycleHook, InsertDocumentHook } from "../../shared/schema";
import type { AIGeneratedWorkflow } from "./ai/types";

const logger = createLogger({ module: 'WorkflowContentIngestService' });

export interface WorkflowStepData {
  id?: string;
  type: string;
  title: string;
  description?: string;
  required?: boolean;
  config?: Record<string, unknown>;
  options?: string[];
  order?: number;
  alias?: string;
  visibleIf?: string;
  repeaterConfig?: Record<string, unknown>;
  defaultValue?: Record<string, unknown>;
}

function normalizeStepConfig(stepData: WorkflowStepData): Record<string, unknown> | null {
  if (stepData.config !== undefined) {
    return stepData.config;
  }
  if (stepData.options !== undefined) {
    return { options: stepData.options };
  }
  return null;
}

export interface WorkflowSectionData {
  id?: string;
  title: string;
  description?: string;
  order?: number;
  alias?: string;
  visibleIf?: string;
  config?: Record<string, unknown>;
  steps?: WorkflowStepData[];
}

export interface WorkflowContentData {
  title?: string;
  description?: string;
  sections?: WorkflowSectionData[];
  logicRules?: Array<{
    conditionStepAlias: string;
    conditionStepId?: string;
    operator: string;
    conditionValue: string;
    value?: string;
    targetType: string;
    targetAlias: string;
    targetId?: string;
    action: string;
  }>;
  transformBlocks?: Array<any>;
  lifecycleHooks?: Array<any>;
  documentHooks?: Array<any>;
}

export class WorkflowContentIngestService {
  /**
   * Apply a full structural workflow definition (from AI, templates, or manual deep-update)
   */
  // eslint-disable-next-line complexity, sonarjs/cognitive-complexity, max-lines-per-function
  async apply(
    workflowId: string,
    data: WorkflowContentData,
    options: { source: 'ai' | 'template' | 'manual' }
  ): Promise<void> {
    logger.info({ workflowId, source: options.source }, "Applying workflow content");

    // 1. Normalize and Validate
    // This expects AIGeneratedWorkflow but WorkflowContentData is structurally compatible enough 
    // for what validateWorkflowStructure checks (sections/steps/logicRules/transformBlocks).
    const normalizedData = JSON.parse(JSON.stringify(data)) as WorkflowContentData;
    
    // Ensure arrays exist for validation
    normalizedData.sections = normalizedData.sections || [];
    normalizedData.logicRules = normalizedData.logicRules || [];
    normalizedData.transformBlocks = normalizedData.transformBlocks || [];
    
    // Validate
    normalizeWorkflowTypes(normalizedData as unknown as AIGeneratedWorkflow);
    validateWorkflowStructure(normalizedData as unknown as AIGeneratedWorkflow);

    return db.transaction(async (tx) => {
      // 2. Sync Sections
      const existingSections = await tx
        .select()
        .from(sections)
        .where(eq(sections.workflowId, workflowId));
        
      const existingSectionIds = new Set(existingSections.map(s => s.id));
      const incomingSectionIds = new Set<string>();
      const aliasMap = new Map<string, string>();
      const existingWorkflowSteps = await tx
        .select({
          id: steps.id,
          alias: steps.alias,
        })
        .from(steps)
        .innerJoin(sections, eq(steps.sectionId, sections.id))
        .where(eq(sections.workflowId, workflowId));
      const existingAliasByStepId = new Map(existingWorkflowSteps.map((step) => [step.id, step.alias]));
      const takenAliases = new Set(
        existingWorkflowSteps
          .map((step) => step.alias?.toLowerCase())
          .filter((alias): alias is string => alias !== undefined && alias !== null && alias !== '')
      );

      for (const [index, sectionData] of (normalizedData.sections || []).entries()) {
        sectionData.order = sectionData.order ?? index;
        
        let sectionId = sectionData.id;
        const isExisting = (sectionId !== undefined && sectionId !== null) && existingSectionIds.has(sectionId);
        
        if (isExisting) {
          incomingSectionIds.add(sectionId!);
          await tx
            .update(sections)
            .set({
              title: sectionData.title,
              description: sectionData.description,
              order: sectionData.order,
              visibleIf: sectionData.visibleIf,
            })
            .where(eq(sections.id, sectionId!));
        } else {
          const [newSection] = await tx
            .insert(sections)
            .values({
              workflowId,
              title: sectionData.title ?? "Untitled",
              description: sectionData.description ?? null,
              order: sectionData.order ?? 0,
              visibleIf: sectionData.visibleIf as unknown as Record<string, unknown>,
              config: sectionData.config ?? {},
            })
            .returning();
            
          if (newSection === undefined) {
            throw new Error("Failed to create section while applying workflow content");
          }
          sectionId = newSection.id;
        }
        
        if (sectionData.id) {
          aliasMap.set(sectionData.id, sectionId!);
        }
        if (sectionData.alias) {
          aliasMap.set(sectionData.alias, sectionId!);
        }

        // 3. Sync Steps
        if (Array.isArray(sectionData.steps)) {
          let existingStepIds = new Set<string>();
          if (isExisting) {
            const dbSteps = await tx.select().from(steps).where(eq(steps.sectionId, sectionId!));
            existingStepIds = new Set(dbSteps.map(s => s.id));
          }
          
          const incomingStepIds = new Set<string>();
          
          for (const [stepIndex, stepData] of sectionData.steps.entries()) {
            let effectiveStepId = stepData.id;
            const isStepExisting = (effectiveStepId !== undefined && effectiveStepId !== null) && existingStepIds.has(effectiveStepId);
            const previousAlias = effectiveStepId ? existingAliasByStepId.get(effectiveStepId) : null;
            if (previousAlias) {
              takenAliases.delete(previousAlias.toLowerCase());
            }
            let alias = stepData.alias ?? generateUniqueAliasFromTaken(stepData.title, takenAliases);
            if (alias && takenAliases.has(alias.toLowerCase())) {
              alias = generateUniqueAliasFromTaken(alias, takenAliases);
            }
            if (alias) {
              takenAliases.add(alias.toLowerCase());
            }
            const config = normalizeStepConfig(stepData);
            
            if (isStepExisting) {
              if (effectiveStepId) { incomingStepIds.add(effectiveStepId); }
              await tx.update(steps).set({
                workflowId,
                title: stepData.title,
                description: stepData.description,
                type: stepData.type as InsertStep['type'],
                required: stepData.required,
                config,
                order: stepData.order ?? stepIndex,
                sectionId: sectionId!,
                alias,
                visibleIf: stepData.visibleIf,
                repeaterConfig: stepData.repeaterConfig,
                defaultValue: stepData.defaultValue,
              }).where(eq(steps.id, effectiveStepId!));
            } else {
              const [newStep] = await tx.insert(steps).values({
                workflowId,
                sectionId: sectionId!,
                type: stepData.type as InsertStep['type'],
                title: stepData.title,
                description: stepData.description,
                required: stepData.required ?? false,
                config,
                order: stepData.order ?? stepIndex,
                alias,
                visibleIf: stepData.visibleIf,
                repeaterConfig: stepData.repeaterConfig,
                defaultValue: stepData.defaultValue,
              }).returning();
              
              if (newStep === undefined) {
                throw new Error("Failed to create step while applying workflow content");
              }
              effectiveStepId = newStep.id;
            }
            
            if (effectiveStepId) {
              if (stepData.alias) { aliasMap.set(stepData.alias, effectiveStepId); }
              if (stepData.id) { aliasMap.set(stepData.id, effectiveStepId); }
            }
          }
          
          if (isExisting) {
            const stepsToDelete = [...existingStepIds].filter(id => !incomingStepIds.has(id));
            if (stepsToDelete.length > 0) {
              await tx.delete(steps).where(inArray(steps.id, stepsToDelete));
            }
          }
        }
      }
      
      const sectionsToDelete = [...existingSectionIds].filter(id => !incomingSectionIds.has(id));
      if (sectionsToDelete.length > 0) {
        await tx.delete(sections).where(inArray(sections.id, sectionsToDelete));
      }

      // 4. Logic Rules
      await tx.delete(logicRules).where(eq(logicRules.workflowId, workflowId));
      if (normalizedData.logicRules && normalizedData.logicRules.length > 0) {
        const mappedRules = normalizedData.logicRules.map((rule: any) => {
            const conditionStepId = aliasMap.get(rule.conditionStepAlias) ?? rule.conditionStepId;
            const targetId = aliasMap.get(rule.targetAlias) ?? rule.targetId;
            
            return {
              workflowId,
              conditionStepId,
              operator: rule.operator,
              value: rule.value || rule.conditionValue,
              action: rule.action,
              targetId,
              targetType: rule.targetType,
            } as InsertLogicRule;
        });
        // Remove rules where resolution failed
        const validRules = mappedRules.filter((r: any) => r.conditionStepId && r.targetId);
        if (validRules.length > 0) {
          await tx.insert(logicRules).values(validRules);
        }
      }

      // 5. Transform Blocks
      await tx.delete(transformBlocks).where(eq(transformBlocks.workflowId, workflowId));
      if (normalizedData.transformBlocks && normalizedData.transformBlocks.length > 0) {
        const mappedBlocks = normalizedData.transformBlocks.map((block: any) => {
          return {
            workflowId,
            phase: block.phase,
            name: block.name,
            code: block.code,
            language: block.language,
            inputKeys: block.inputKeys,
            outputKey: block.outputAlias || block.outputKey,
            order: block.order,
          } as InsertTransformBlock;
        });
        await tx.insert(transformBlocks).values(mappedBlocks);
      }
      
      // 6. Lifecycle Hooks
      if (normalizedData.lifecycleHooks) {
        await tx.delete(lifecycleHooks).where(eq(lifecycleHooks.workflowId, workflowId));
        if (normalizedData.lifecycleHooks.length > 0) {
          const mappedHooks = normalizedData.lifecycleHooks.map((hook: any) => ({
            workflowId,
            phase: hook.phase,
            name: hook.name,
            code: hook.code,
            language: hook.language,
            inputKeys: hook.inputKeys,
            outputAlias: hook.outputAlias,
            order: hook.order,
            config: hook.config,
            isEnabled: hook.isEnabled ?? true,
          } as InsertLifecycleHook));
          await tx.insert(lifecycleHooks).values(mappedHooks);
        }
      }

      // 7. Document Hooks
      if (normalizedData.documentHooks) {
        await tx.delete(documentHooks).where(eq(documentHooks.workflowId, workflowId));
        if (normalizedData.documentHooks.length > 0) {
          const mappedHooks = normalizedData.documentHooks.map((hook: any) => ({
            workflowId,
            phase: hook.phase,
            name: hook.name,
            code: hook.code,
            language: hook.language,
            inputKeys: hook.inputKeys,
            outputAlias: hook.outputAlias,
            order: hook.order,
            config: hook.config,
            isEnabled: hook.isEnabled ?? true,
          } as InsertDocumentHook));
          await tx.insert(documentHooks).values(mappedHooks);
        }
      }
    });
  }
}

export const workflowContentIngestService = new WorkflowContentIngestService();
