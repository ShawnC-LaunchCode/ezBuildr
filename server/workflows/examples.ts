/**
 * Condition System Examples
 *
 * Practical examples of using the condition system for common scenarios
 * in Intake Runner 2.0.
 */

import {
  evaluateCondition,
  varRef,
  value,
  type ConditionExpression,
  type EvaluationContext,
} from './conditions';

// ========================================================================
// EXAMPLE 1: Simple Visibility Based on Single Answer
// ========================================================================

/**
 * Show employment details page only if user is employed
 */
export const example1EmploymentVisibility = (): boolean => {
  const condition: ConditionExpression = {
    op: 'equals',
    left: varRef('employmentStatus'),
    right: value('employed'),
  };

  const context: EvaluationContext = {
    variables: {
      employmentStatus: 'employed',
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 2: Multiple Criteria (AND)
// ========================================================================

/**
 * Show investment options only if user is:
 * - 18 or older
 * - Has income over $50,000
 * - Is a US citizen
 */
export const example2InvestmentEligibility = (): boolean => {
  const condition: ConditionExpression = {
    and: [
      { op: 'gte', left: varRef('age'), right: value(18) },
      { op: 'gt', left: varRef('annualIncome'), right: value(50000) },
      { op: 'equals', left: varRef('citizenship'), right: value('US') },
    ],
  };

  const context: EvaluationContext = {
    variables: {
      age: 25,
      annualIncome: 75000,
      citizenship: 'US',
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 3: Alternative Paths (OR)
// ========================================================================

/**
 * Show VIP benefits if user is:
 * - Explicitly marked as VIP
 * OR has made 10+ purchases
 * OR has spent $1000+
 */
export const example3VipBenefits = (): boolean => {
  const condition: ConditionExpression = {
    or: [
      { op: 'equals', left: varRef('vipStatus'), right: value(true) },
      { op: 'gte', left: varRef('purchaseCount'), right: value(10) },
      { op: 'gte', left: varRef('totalSpent'), right: value(1000) },
    ],
  };

  const context: EvaluationContext = {
    variables: {
      vipStatus: false,
      purchaseCount: 15,
      totalSpent: 500,
    },
  };

  return evaluateCondition(condition, context); // true (purchaseCount >= 10)
};

// ========================================================================
// EXAMPLE 4: Exclusion Logic (NOT)
// ========================================================================

/**
 * Show standard signup form if user is NOT banned
 */
export const example4NotBanned = (): boolean => {
  const condition: ConditionExpression = {
    not: {
      op: 'in',
      left: varRef('status'),
      right: value(['banned', 'suspended']),
    },
  };

  const context: EvaluationContext = {
    variables: {
      status: 'active',
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 5: Conditional Required Fields
// ========================================================================

/**
 * SSN is required only for US citizens
 */
export const example5ConditionalRequired = (): boolean => {
  const condition: ConditionExpression = {
    op: 'equals',
    left: varRef('country'),
    right: value('USA'),
  };

  const context: EvaluationContext = {
    variables: {
      country: 'USA',
    },
  };

  return evaluateCondition(condition, context); // true = field is required
};

// ========================================================================
// EXAMPLE 6: Array Contains
// ========================================================================

/**
 * Show medical questions if user selected health concerns that include "diabetes"
 */
export const example6ArrayContains = (): boolean => {
  const condition: ConditionExpression = {
    op: 'contains',
    left: varRef('healthConcerns'),
    right: value('diabetes'),
  };

  const context: EvaluationContext = {
    variables: {
      healthConcerns: ['diabetes', 'high-blood-pressure'],
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 7: String Pattern Matching
// ========================================================================

/**
 * Show international shipping options if phone number is not US format
 */
export const example7InternationalShipping = (): boolean => {
  const condition: ConditionExpression = {
    not: {
      op: 'matches',
      left: varRef('phone'),
      right: value('^\\+1'),
    },
  };

  const context: EvaluationContext = {
    variables: {
      phone: '+44 20 1234 5678', // UK number
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 8: Nested Object Access
// ========================================================================

/**
 * Show local tax questions if user's address is in California
 */
export const example8NestedAccess = (): boolean => {
  const condition: ConditionExpression = {
    op: 'equals',
    left: varRef('address.state'),
    right: value('CA'),
  };

  const context: EvaluationContext = {
    variables: {
      address: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
      },
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 9: List Array Access
// ========================================================================

/**
 * Show additional questions if first dependent is under 18
 */
export const example9ListArrayAccess = (): boolean => {
  const condition: ConditionExpression = {
    op: 'lt',
    left: varRef('dependents[0].age'),
    right: value(18),
  };

  const context: EvaluationContext = {
    variables: {
      dependents: [
        { name: 'Child 1', age: 12 },
        { name: 'Child 2', age: 15 },
      ],
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 10: Collection Record Prefill
// ========================================================================

/**
 * Show update form if record status is 'pending'
 * Uses collection record data as context
 */
export const example10RecordPrefill = (): boolean => {
  const condition: ConditionExpression = {
    op: 'equals',
    left: varRef('status'),
    right: value('pending'),
  };

  const context: EvaluationContext = {
    variables: {},
    record: {
      id: 'record-123',
      status: 'pending',
      createdAt: '2025-01-01',
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 11: Complex Business Logic
// ========================================================================

/**
 * Show loan application if:
 * - (Age >= 21 AND income >= $30k) OR
 * - (Has cosigner AND cosigner income >= $50k)
 * - AND NOT (credit score < 600 OR bankruptcy in last 7 years)
 */
export const example11LoanEligibility = (): boolean => {
  const condition: ConditionExpression = {
    and: [
      // Primary qualification
      {
        or: [
          // Qualify on own
          {
            and: [
              { op: 'gte', left: varRef('age'), right: value(21) },
              { op: 'gte', left: varRef('income'), right: value(30000) },
            ],
          },
          // Qualify with cosigner
          {
            and: [
              { op: 'equals', left: varRef('hasCosigner'), right: value(true) },
              { op: 'gte', left: varRef('cosignerIncome'), right: value(50000) },
            ],
          },
        ],
      },
      // Disqualification criteria (must NOT meet these)
      {
        not: {
          or: [
            { op: 'lt', left: varRef('creditScore'), right: value(600) },
            { op: 'equals', left: varRef('bankruptcyRecent'), right: value(true) },
          ],
        },
      },
    ],
  };

  const context: EvaluationContext = {
    variables: {
      age: 25,
      income: 45000,
      hasCosigner: false,
      cosignerIncome: 0,
      creditScore: 680,
      bankruptcyRecent: false,
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 12: Skip Logic
// ========================================================================

/**
 * Skip to final page if user selected "Not interested"
 */
export const example12SkipLogic = (): boolean => {
  const condition: ConditionExpression = {
    op: 'equals',
    left: varRef('interest'),
    right: value('not-interested'),
  };

  const context: EvaluationContext = {
    variables: {
      interest: 'not-interested',
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 13: Empty Value Checks
// ========================================================================

/**
 * Show reminder message if optional field was left empty
 */
export const example13EmptyCheck = (): boolean => {
  const condition: ConditionExpression = {
    op: 'isEmpty',
    left: varRef('referralSource'),
    right: value(null), // Right operand ignored for isEmpty
  };

  const context: EvaluationContext = {
    variables: {
      referralSource: '',
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 14: Multi-Select Questions
// ========================================================================

/**
 * Show additional questions if user selected multiple options
 */
export const example14MultiSelect = (): boolean => {
  const condition: ConditionExpression = {
    and: [
      { op: 'contains', left: varRef('interests'), right: value('technology') },
      { op: 'contains', left: varRef('interests'), right: value('finance') },
    ],
  };

  const context: EvaluationContext = {
    variables: {
      interests: ['technology', 'finance', 'healthcare'],
    },
  };

  return evaluateCondition(condition, context); // true
};

// ========================================================================
// EXAMPLE 15: Date-Based Conditions
// ========================================================================

/**
 * Show early bird pricing if registration date is before deadline
 * Note: Dates as ISO strings for comparison
 */
export const example15DateCondition = (): boolean => {
  const condition: ConditionExpression = {
    op: 'lt',
    left: varRef('registrationDate'),
    right: value('2025-12-31'),
  };

  const context: EvaluationContext = {
    variables: {
      registrationDate: '2025-11-15',
    },
  };

  return evaluateCondition(condition, context); // true (string comparison works for ISO dates)
};
