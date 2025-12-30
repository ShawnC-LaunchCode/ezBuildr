import { describe, it, expect } from 'vitest';
import { evaluateConditionExpression } from '../../../shared/conditionEvaluator';
import { conditionExpressionSchema } from '../../../shared/types/conditions';

/**
 * Integration test proving AI-generated conditions work end-to-end
 */
describe('AI-Generated Condition Evaluation (Round-Trip Compatibility)', () => {
  /**
   * Simulates AI parser output (same format as WorkflowPatchService.parseConditionToExpression)
   */
  function createConditionExpression(variable: string, operator: string, value?: any, valueType: 'constant' | 'variable' = 'constant') {
    return {
      type: 'group' as const,
      id: `cond_${Date.now()}_test`,
      operator: 'AND' as const,
      conditions: [{
        type: 'condition' as const,
        id: `cond_${Date.now()}_test2`,
        variable,
        operator,
        value,
        valueType,
      }],
    };
  }

  describe('Basic Operators', () => {
    it('should evaluate "email equals test@example.com" correctly', () => {
      const expression = createConditionExpression('email', 'equals', 'test@example.com');

      // Validate schema first
      expect(conditionExpressionSchema.safeParse(expression).success).toBe(true);

      // Test evaluation
      expect(evaluateConditionExpression(expression, { email: 'test@example.com' })).toBe(true);
      expect(evaluateConditionExpression(expression, { email: 'other@example.com' })).toBe(false);
      expect(evaluateConditionExpression(expression, {})).toBe(false);
    });

    it('should evaluate "age greater_than 18" correctly', () => {
      const expression = createConditionExpression('age', 'greater_than', 18);

      expect(evaluateConditionExpression(expression, { age: 25 })).toBe(true);
      expect(evaluateConditionExpression(expression, { age: 18 })).toBe(false);
      expect(evaluateConditionExpression(expression, { age: 10 })).toBe(false);
      expect(evaluateConditionExpression(expression, { age: '25' })).toBe(true); // String coercion
    });

    it('should evaluate "optional_notes is_empty" correctly', () => {
      const expression = createConditionExpression('optional_notes', 'is_empty');

      expect(evaluateConditionExpression(expression, { optional_notes: '' })).toBe(true);
      expect(evaluateConditionExpression(expression, {})).toBe(true);
      expect(evaluateConditionExpression(expression, { optional_notes: null })).toBe(true);
      expect(evaluateConditionExpression(expression, { optional_notes: 'Some text' })).toBe(false);
    });

    it('should evaluate "status not_equals pending" correctly', () => {
      const expression = createConditionExpression('status', 'not_equals', 'pending');

      expect(evaluateConditionExpression(expression, { status: 'approved' })).toBe(true);
      expect(evaluateConditionExpression(expression, { status: 'pending' })).toBe(false);
    });

    it('should evaluate "description contains urgent" correctly', () => {
      const expression = createConditionExpression('description', 'contains', 'urgent');

      expect(evaluateConditionExpression(expression, { description: 'This is urgent!' })).toBe(true);
      expect(evaluateConditionExpression(expression, { description: 'URGENT: Please review' })).toBe(true); // Case-insensitive
      expect(evaluateConditionExpression(expression, { description: 'Normal task' })).toBe(false);
    });
  });

  describe('Variable References', () => {
    it('should evaluate "confirm_email equals email" correctly', () => {
      const expression = createConditionExpression('confirm_email', 'equals', 'email', 'variable');

      // Validate variable reference support
      expect(expression.conditions[0].valueType).toBe('variable');

      // Both match
      expect(evaluateConditionExpression(expression, {
        email: 'test@example.com',
        confirm_email: 'test@example.com'
      })).toBe(true);

      // Mismatch
      expect(evaluateConditionExpression(expression, {
        email: 'test@example.com',
        confirm_email: 'other@example.com'
      })).toBe(false);

      // Case-insensitive
      expect(evaluateConditionExpression(expression, {
        email: 'Test@Example.com',
        confirm_email: 'test@example.com'
      })).toBe(true);
    });
  });

  describe('Database Round-Trip', () => {
    it('should survive JSON serialization/deserialization (JSONB storage)', () => {
      const original = createConditionExpression('email', 'equals', 'test@example.com');

      // Simulate database storage
      const jsonString = JSON.stringify(original);
      const retrieved = JSON.parse(jsonString);

      // Verify structure preserved
      expect(retrieved.type).toBe('group');
      expect(retrieved.operator).toBe('AND');
      expect(retrieved.conditions).toHaveLength(1);
      expect(retrieved.conditions[0].variable).toBe('email');
      expect(retrieved.conditions[0].operator).toBe('equals');
      expect(retrieved.conditions[0].value).toBe('test@example.com');

      // Verify still evaluates correctly
      expect(evaluateConditionExpression(retrieved, { email: 'test@example.com' })).toBe(true);
      expect(evaluateConditionExpression(retrieved, { email: 'other@example.com' })).toBe(false);
    });
  });

  describe('UI Compatibility', () => {
    it('should pass Zod schema validation (same validation used by UI)', () => {
      const expression = createConditionExpression('email', 'equals', 'test@example.com');

      const result = conditionExpressionSchema.safeParse(expression);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('group');
        expect(result.data.conditions[0].variable).toBe('email');
      }
    });

    it('should handle all common operators used by UI', () => {
      const operators = [
        { op: 'equals', value: 'test', data: { field: 'test' }, expected: true },
        { op: 'not_equals', value: 'test', data: { field: 'other' }, expected: true },
        { op: 'contains', value: 'sub', data: { field: 'substring' }, expected: true },
        { op: 'not_contains', value: 'xyz', data: { field: 'abc' }, expected: true },
        { op: 'greater_than', value: 10, data: { field: 15 }, expected: true },
        { op: 'less_than', value: 20, data: { field: 10 }, expected: true },
        { op: 'is_empty', value: undefined, data: { field: '' }, expected: true },
        { op: 'is_not_empty', value: undefined, data: { field: 'value' }, expected: true },
      ];

      operators.forEach(({ op, value, data, expected }) => {
        const expr = createConditionExpression('field', op, value);
        expect(evaluateConditionExpression(expr, data)).toBe(expected);
      });
    });
  });

  describe('Complete Round-Trip Test', () => {
    it('should handle full lifecycle: Create → Validate → Store → Retrieve → Evaluate → Edit', () => {
      // STEP 1: AI creates condition
      const aiGenerated = createConditionExpression('email', 'equals', 'test@example.com');

      // STEP 2: Validate against schema (same as backend does)
      const validation1 = conditionExpressionSchema.safeParse(aiGenerated);
      expect(validation1.success).toBe(true);

      // STEP 3: Store in database (JSONB)
      const stored = JSON.stringify(aiGenerated);

      // STEP 4: Retrieve from database
      const retrieved = JSON.parse(stored);

      // STEP 5: UI loads and validates
      const validation2 = conditionExpressionSchema.safeParse(retrieved);
      expect(validation2.success).toBe(true);

      // STEP 6: Runtime evaluation works
      expect(evaluateConditionExpression(retrieved, { email: 'test@example.com' })).toBe(true);

      // STEP 7: User edits in UI (change value)
      const edited = {
        ...retrieved,
        conditions: [{
          ...retrieved.conditions[0],
          value: 'new@example.com'
        }]
      };

      // STEP 8: Edited version validates
      const validation3 = conditionExpressionSchema.safeParse(edited);
      expect(validation3.success).toBe(true);

      // STEP 9: Edited version evaluates correctly
      expect(evaluateConditionExpression(edited, { email: 'new@example.com' })).toBe(true);
      expect(evaluateConditionExpression(edited, { email: 'test@example.com' })).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null vs empty string correctly', () => {
      const expr = createConditionExpression('notes', 'is_empty');

      expect(evaluateConditionExpression(expr, { notes: null })).toBe(true);
      expect(evaluateConditionExpression(expr, { notes: '' })).toBe(true);
      expect(evaluateConditionExpression(expr, { notes: '  ' })).toBe(true); // Whitespace
      expect(evaluateConditionExpression(expr, { notes: 'text' })).toBe(false);
      expect(evaluateConditionExpression(expr, {})).toBe(true); // Missing key
    });

    it('should handle case-insensitive string comparison', () => {
      const expr = createConditionExpression('status', 'equals', 'Active');

      expect(evaluateConditionExpression(expr, { status: 'Active' })).toBe(true);
      expect(evaluateConditionExpression(expr, { status: 'active' })).toBe(true);
      expect(evaluateConditionExpression(expr, { status: 'ACTIVE' })).toBe(true);
      expect(evaluateConditionExpression(expr, { status: 'inactive' })).toBe(false);
    });

    it('should handle number coercion', () => {
      const expr = createConditionExpression('age', 'greater_than', 18);

      expect(evaluateConditionExpression(expr, { age: 25 })).toBe(true); // Number
      expect(evaluateConditionExpression(expr, { age: '25' })).toBe(true); // String
      expect(evaluateConditionExpression(expr, { age: '18' })).toBe(false); // Equal, not greater
      expect(evaluateConditionExpression(expr, { age: 'invalid' })).toBe(false); // NaN
    });

    it('should handle array includes operations', () => {
      const expr = createConditionExpression('tags', 'includes', 'urgent');

      expect(evaluateConditionExpression(expr, { tags: ['urgent', 'high-priority'] })).toBe(true);
      expect(evaluateConditionExpression(expr, { tags: ['normal'] })).toBe(false);
      expect(evaluateConditionExpression(expr, { tags: 'urgent' })).toBe(true); // Single value
    });

    it('should handle boolean operators', () => {
      const exprTrue = createConditionExpression('is_active', 'is_true');
      const exprFalse = createConditionExpression('is_archived', 'is_false');

      expect(evaluateConditionExpression(exprTrue, { is_active: true })).toBe(true);
      expect(evaluateConditionExpression(exprTrue, { is_active: false })).toBe(false);
      expect(evaluateConditionExpression(exprTrue, { is_active: 'true' })).toBe(true); // String coercion
      expect(evaluateConditionExpression(exprTrue, { is_active: 1 })).toBe(true); // Number coercion

      expect(evaluateConditionExpression(exprFalse, { is_archived: false })).toBe(true);
      expect(evaluateConditionExpression(exprFalse, { is_archived: true })).toBe(false);
      expect(evaluateConditionExpression(exprFalse, { is_archived: 'false' })).toBe(true);
      expect(evaluateConditionExpression(exprFalse, { is_archived: 0 })).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle emergency contact visibility (has_emergency_contact equals true)', () => {
      const expr = createConditionExpression('has_emergency_contact', 'equals', true);

      // Section visible when checkbox checked
      expect(evaluateConditionExpression(expr, { has_emergency_contact: true })).toBe(true);
      expect(evaluateConditionExpression(expr, { has_emergency_contact: 'true' })).toBe(true);

      // Section hidden when checkbox unchecked
      expect(evaluateConditionExpression(expr, { has_emergency_contact: false })).toBe(false);
      expect(evaluateConditionExpression(expr, { has_emergency_contact: 'false' })).toBe(false);
      expect(evaluateConditionExpression(expr, {})).toBe(false);
    });

    it('should handle age-gated content (age greater_or_equal 18)', () => {
      const expr = createConditionExpression('age', 'greater_or_equal', 18);

      expect(evaluateConditionExpression(expr, { age: 18 })).toBe(true); // Exactly 18
      expect(evaluateConditionExpression(expr, { age: 25 })).toBe(true); // Over 18
      expect(evaluateConditionExpression(expr, { age: 17 })).toBe(false); // Under 18
      expect(evaluateConditionExpression(expr, { age: '21' })).toBe(true); // String
    });

    it('should handle conditional required field (email is_not_empty)', () => {
      const expr = createConditionExpression('email', 'is_not_empty');

      expect(evaluateConditionExpression(expr, { email: 'test@example.com' })).toBe(true);
      expect(evaluateConditionExpression(expr, { email: '' })).toBe(false);
      expect(evaluateConditionExpression(expr, { email: null })).toBe(false);
      expect(evaluateConditionExpression(expr, {})).toBe(false);
    });
  });
});
