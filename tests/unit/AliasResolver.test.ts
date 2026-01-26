/**
 * Tests for AliasResolver utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AliasResolver,
  AliasResolutionError,
  AliasResolverUtils,
} from '../../server/services/AliasResolver';

describe('AliasResolver', () => {
  describe('fromSteps', () => {
    it('should create resolver from steps array', () => {
      const steps = [
        { id: 'step-1', alias: 'firstName' },
        { id: 'step-2', alias: 'lastName' },
        { id: 'step-3', alias: 'emailAddress' },
      ];

      const resolver = AliasResolver.fromSteps(steps);

      expect(resolver.resolve('firstName')).toBe('step-1');
      expect(resolver.resolve('lastName')).toBe('step-2');
      expect(resolver.resolve('emailAddress')).toBe('step-3');
    });

    it('should resolve by ID as well as alias', () => {
      const steps = [
        { id: 'step-1', alias: 'firstName' },
      ];

      const resolver = AliasResolver.fromSteps(steps);

      expect(resolver.resolve('step-1')).toBe('step-1');
      expect(resolver.resolve('firstName')).toBe('step-1');
    });

    it('should handle case-insensitive alias lookup', () => {
      const steps = [
        { id: 'step-1', alias: 'emailAddress' },
      ];

      const resolver = AliasResolver.fromSteps(steps);

      expect(resolver.resolve('emailAddress')).toBe('step-1');
      expect(resolver.resolve('EMAILADDRESS')).toBe('step-1');
      expect(resolver.resolve('EmailAddress')).toBe('step-1');
    });

    it('should handle steps without aliases', () => {
      const steps = [
        { id: 'step-1', alias: 'hasAlias' },
        { id: 'step-2', alias: null },
        { id: 'step-3' }, // No alias property
      ];

      const resolver = AliasResolver.fromSteps(steps);

      expect(resolver.resolve('hasAlias')).toBe('step-1');
      expect(resolver.resolve('step-2')).toBe('step-2');
      expect(resolver.resolve('step-3')).toBe('step-3');
    });

    it('should track duplicate aliases as errors', () => {
      const steps = [
        { id: 'step-1', alias: 'duplicateAlias' },
        { id: 'step-2', alias: 'duplicateAlias' },
      ];

      const resolver = AliasResolver.fromSteps(steps);
      const errors = resolver.getErrors();

      expect(errors.length).toBe(1);
      expect(errors[0].reason).toBe('ambiguous');
      expect(errors[0].aliasOrId).toBe('duplicateAlias');
    });

    it('should track steps without IDs as errors', () => {
      const steps = [
        { id: '', alias: 'noId' },
        { id: 'step-1', alias: 'hasId' },
      ] as any;

      const resolver = AliasResolver.fromSteps(steps);
      const errors = resolver.getErrors();

      expect(errors.length).toBe(1);
      expect(errors[0].reason).toBe('invalid_input');
    });
  });

  describe('fromWorkflow', () => {
    it('should create resolver from workflow with sections and steps', () => {
      const workflow = {
        sections: [
          {
            id: 'section-1',
            alias: 'personalInfo',
            title: 'Personal Information',
            steps: [
              { id: 'step-1', alias: 'firstName' },
              { id: 'step-2', alias: 'lastName' },
            ],
          },
          {
            id: 'section-2',
            alias: 'contactInfo',
            title: 'Contact Information',
            steps: [
              { id: 'step-3', alias: 'email' },
            ],
          },
        ],
      };

      const resolver = AliasResolver.fromWorkflow(workflow);

      // Steps
      expect(resolver.resolve('firstName')).toBe('step-1');
      expect(resolver.resolve('lastName')).toBe('step-2');
      expect(resolver.resolve('email')).toBe('step-3');

      // Sections
      expect(resolver.resolve('personalInfo')).toBe('section-1');
      expect(resolver.resolve('contactInfo')).toBe('section-2');
      expect(resolver.resolve('section-1')).toBe('section-1');
    });

    it('should handle empty workflow', () => {
      const resolver = AliasResolver.fromWorkflow({});
      expect(resolver.getAllAliases()).toEqual([]);
    });
  });

  describe('resolve methods', () => {
    let resolver: AliasResolver;

    beforeEach(() => {
      const steps = [
        { id: 'step-1', alias: 'firstName', title: 'First Name' },
        { id: 'step-2', alias: 'lastName', title: 'Last Name' },
      ];
      resolver = AliasResolver.fromSteps(steps);
    });

    it('should return undefined for non-existent alias', () => {
      expect(resolver.resolve('nonExistent')).toBeUndefined();
    });

    it('should resolve with details', () => {
      const result = resolver.resolveWithDetails('firstName');

      expect(result).toBeDefined();
      expect(result?.id).toBe('step-1');
      expect(result?.type).toBe('step');
      expect(result?.alias).toBe('firstName');
      expect(result?.title).toBe('First Name');
    });

    it('should throw on resolveOrThrow for non-existent alias', () => {
      expect(() => resolver.resolveOrThrow('nonExistent')).toThrow(AliasResolutionError);
    });

    it('should include suggestions in error for similar aliases', () => {
      try {
        resolver.resolveOrThrow('firstNam'); // Missing 'e'
      } catch (error) {
        expect(error).toBeInstanceOf(AliasResolutionError);
        const resError = error as AliasResolutionError;
        expect(resError.resolutionError.suggestions).toContain('firstName');
      }
    });

    it('should resolve many aliases at once', () => {
      const { resolved, errors } = resolver.resolveMany(['firstName', 'lastName', 'nonExistent']);

      expect(resolved.get('firstName')).toBe('step-1');
      expect(resolved.get('lastName')).toBe('step-2');
      expect(errors.length).toBe(1);
      expect(errors[0].aliasOrId).toBe('nonExistent');
    });
  });

  describe('utility methods', () => {
    it('should check existence with has()', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'exists' },
      ]);

      expect(resolver.has('exists')).toBe(true);
      expect(resolver.has('step-1')).toBe(true);
      expect(resolver.has('notThere')).toBe(false);
    });

    it('should get alias from ID with getAlias()', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'firstName' },
        { id: 'step-2' }, // No alias
      ]);

      expect(resolver.getAlias('step-1')).toBe('firstName');
      expect(resolver.getAlias('step-2')).toBeUndefined();
    });

    it('should return all aliases', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'a' },
        { id: 'step-2', alias: 'b' },
        { id: 'step-3', alias: 'c' },
      ]);

      const aliases = resolver.getAllAliases();
      expect(aliases).toContain('a');
      expect(aliases).toContain('b');
      expect(aliases).toContain('c');
    });

    it('should convert to alias map', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'firstName' },
        { id: 'step-2', alias: 'lastName' },
      ]);

      const map = resolver.toAliasMap();

      expect(map['firstName']).toBe('step-1');
      expect(map['lastName']).toBe('step-2');
      expect(map['step-1']).toBe('step-1');
    });

    it('should convert to resolver function', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'firstName' },
      ]);

      const fn = resolver.toResolverFn();

      expect(fn('firstName')).toBe('step-1');
      expect(fn('nonExistent')).toBeUndefined();
    });
  });

  describe('static helper methods', () => {
    it('should create inline resolver function', () => {
      const steps = [
        { id: 'step-1', alias: 'email' },
      ];

      const resolverFn = AliasResolver.createInlineResolver(steps);

      expect(resolverFn('email')).toBe('step-1');
      expect(resolverFn('notFound')).toBeUndefined();
    });

    it('should create alias map directly', () => {
      const steps = [
        { id: 'step-1', alias: 'firstName' },
        { id: 'step-2', alias: 'lastName' },
      ];

      const map = AliasResolver.createAliasMap(steps);

      expect(map['firstName']).toBe('step-1');
      expect(map['lastName']).toBe('step-2');
    });
  });
});

describe('AliasResolverUtils', () => {
  describe('resolveLogicRules', () => {
    it('should resolve aliases in logic rules', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'hasInsurance' },
        { id: 'step-2', alias: 'insuranceProvider' },
      ]);

      const rules = [
        {
          conditionStepAlias: 'hasInsurance',
          targetAlias: 'insuranceProvider',
          action: 'show',
        },
      ];

      const { resolved, errors } = AliasResolverUtils.resolveLogicRules(rules, resolver);

      expect(errors.length).toBe(0);
      expect(resolved.length).toBe(1);
      expect((resolved[0] as any).conditionStepId).toBe('step-1');
      expect((resolved[0] as any).targetId).toBe('step-2');
    });

    it('should report errors for unresolved aliases', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'hasInsurance' },
      ]);

      const rules = [
        {
          conditionStepAlias: 'hasInsurance',
          targetAlias: 'nonExistent',
          action: 'show',
        },
      ];

      const { resolved, errors } = AliasResolverUtils.resolveLogicRules(rules, resolver);

      expect(errors.length).toBe(1);
      expect(errors[0].aliasOrId).toBe('nonExistent');
      expect(resolved.length).toBe(0); // Rule excluded due to error
    });
  });

  describe('buildDualKeyContext', () => {
    it('should build context with both ID and alias keys', () => {
      const resolver = AliasResolver.fromSteps([
        { id: 'step-1', alias: 'firstName' },
        { id: 'step-2', alias: 'lastName' },
        { id: 'step-3' }, // No alias
      ]);

      const stepValues = [
        { stepId: 'step-1', value: 'John' },
        { stepId: 'step-2', value: 'Doe' },
        { stepId: 'step-3', value: 'test' },
      ];

      const context = AliasResolverUtils.buildDualKeyContext(stepValues, resolver);

      expect(context['step-1']).toBe('John');
      expect(context['firstName']).toBe('John');
      expect(context['step-2']).toBe('Doe');
      expect(context['lastName']).toBe('Doe');
      expect(context['step-3']).toBe('test');
    });
  });
});
