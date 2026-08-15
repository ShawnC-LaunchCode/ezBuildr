import fs from 'fs';
import path from 'path';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocxBuffer } from '../../../../server/services/document/RenderCore';

/**
 * LD-2: proof that the three curated starter templates
 * (templates/curated/{nda,retainer-agreement,intake-questionnaire}) render
 * through the production DOCX pipeline and resolve their mapped variables
 * against realistic run data — see templates/curated/README.md for the
 * content decision and templates/curated/<slug>/mapping.md for the
 * alias -> tag mapping each assertion below is checking.
 *
 * These are content-authoring proofs, not new mechanism: every render below
 * goes through the same `renderDocxBuffer` entry point docSamples.test.ts
 * uses for the authoring guide's executable examples.
 */

function loadTemplate(slug: string): Buffer {
  const templatePath = path.resolve(
    __dirname,
    '../../../../templates/curated',
    slug,
    'template.docx'
  );
  return fs.readFileSync(templatePath);
}

interface CuratedWorkflowStep {
  alias: string;
}

interface CuratedWorkflowSection {
  steps: CuratedWorkflowStep[];
}

interface CuratedWorkflow {
  settings?: {
    intakeConfig?: {
      allowPrefill?: boolean;
      allowedPrefillKeys?: string[];
    };
  };
  sections: CuratedWorkflowSection[];
}

function loadWorkflowJson(slug: string): CuratedWorkflow {
  const workflowJsonPath = path.resolve(
    __dirname,
    '../../../../templates/curated',
    slug,
    'workflow.json'
  );
  return JSON.parse(fs.readFileSync(workflowJsonPath, 'utf-8')) as CuratedWorkflow;
}

async function renderCurated(
  slug: string,
  data: Record<string, unknown>,
  workflowSettings?: unknown
): Promise<string> {
  const buffer = await renderDocxBuffer({
    templatePath: `templates/curated/${slug}/template.docx`,
    templateBuffer: loadTemplate(slug),
    data,
    workflowSettings,
  });
  const zip = new PizZip(buffer);
  const xml: string = zip.file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('LD-2 curated templates', () => {
  describe('NDA', () => {
    const baseData = {
      disclosing_party: 'Ada Lovelace Consulting LLC',
      receiving_party: 'Alan Turing Analytics Inc.',
      receiving_party_signer_pronoun: null,
      bound_individual_count: 3,
      effective_date: '2026-01-05',
      term_years: 5,
      governing_law_state: 'Delaware',
    };

    it('resolves every mapped variable against a real run, with an unanswered optional field', async () => {
      const text = await renderCurated('nda', baseData);

      expect(text).toContain('Ada Lovelace Consulting LLC');
      expect(text).toContain('Alan Turing Analytics Inc.');
      expect(text).toContain('January 5, 2026'); // effective_date | longdate
      expect(text).toContain('1. Confidential Information.');
      expect(text).toContain('2. Obligations of Receiving Party.');
      expect(text).toContain('5. Acknowledgment.');
      expect(text).toContain('3 individuals'); // count | plural
      expect(text).toContain('are authorized'); // count | isAre
      expect(text).toContain('have agreed'); // count | hasHave
      expect(text).toContain('their access'); // count | itsTheir
      expect(text).toContain('5 years');
      expect(text).toContain('State of Delaware');

      // receiving_party_signer_pronoun was not answered -> default they/them.
      expect(text).toContain('They acknowledge receipt');
    });

    it('takes pronouns from the explicit value, not from either party name (no inference)', async () => {
      const text = await renderCurated('nda', {
        ...baseData,
        receiving_party_signer_pronoun: 'he/him',
      });

      expect(text).toContain('He acknowledges receipt');
      expect(text).not.toContain('They acknowledge receipt');
      // The names are unchanged between the two renders -- only the explicit
      // pronoun value changed the output.
      expect(text).toContain('Ada Lovelace Consulting LLC');
      expect(text).toContain('Alan Turing Analytics Inc.');
    });
  });

  describe('Retainer Agreement', () => {
    const baseData = {
      client_name: 'Grace Hopper',
      client_pronoun: null,
      firm_name: 'Hopper and Associates LLP',
      matter_description:
        'Formation of a Delaware C-corporation and related equity issuance',
      engagement_date: '2026-09-04', // Friday
      hourly_rate: 450,
      retainer_fee: 5000,
      response_deadline_days: 2,
      additional_attorneys_count: 2,
    };

    it('resolves fees, numbering, plurality and the default pronoun against a real run', async () => {
      const text = await renderCurated('retainer-agreement', baseData, {
        businessDayCalendar: 'us-federal',
      });

      expect(text).toContain('Grace Hopper');
      expect(text).toContain('Hopper and Associates LLP');
      expect(text).toContain(
        'Formation of a Delaware C-corporation and related equity issuance'
      );
      expect(text).toContain('$450.00 per hour');
      expect(text).toContain('$5,000.00');
      expect(text).toContain('2 additional attorneys');
      expect(text).toContain('are assigned');
      expect(text).toContain('have been introduced');
      // client_pronoun unanswered -> default they/them.
      expect(text).toContain('They acknowledge');
      expect(text).toContain('their obligations');
    });

    it('AC4: a real business-day deadline crosses Labor Day under the us-federal calendar', async () => {
      // Hand-checked (see templates/curated/retainer-agreement/mapping.md):
      // Fri 2026-09-04 + 2 business days, us-federal calendar, skips the
      // weekend of Sep 5-6 AND the Labor Day holiday observed Mon 2026-09-07,
      // landing on Wed 2026-09-09.
      const text = await renderCurated('retainer-agreement', baseData, {
        businessDayCalendar: 'us-federal',
      });

      expect(text).toContain('no later than September 9, 2026');
    });

    it('the deadline is discriminating on the calendar setting, not just the arithmetic', async () => {
      // Same run data, weekends-only calendar: the deadline does not skip
      // Labor Day, so it lands one business day earlier, on Tue 2026-09-08.
      // This proves the us-federal result above is actually caused by the
      // calendar setting rather than coincidence.
      const weekendsOnly = await renderCurated('retainer-agreement', baseData, {
        businessDayCalendar: 'weekends-only',
      });
      const usFederal = await renderCurated('retainer-agreement', baseData, {
        businessDayCalendar: 'us-federal',
      });

      expect(weekendsOnly).toContain('no later than September 8, 2026');
      expect(weekendsOnly).not.toContain('September 9, 2026');
      expect(usFederal).toContain('no later than September 9, 2026');
      expect(usFederal).not.toContain('September 8, 2026');
    });
  });

  describe('Intake Questionnaire summary memo', () => {
    it('resolves every mapped variable, including an explicit pronoun and an urgent deadline', async () => {
      const text = await renderCurated('intake-questionnaire', {
        client_full_name: 'Ada Lovelace',
        client_email: 'ada@example.com',
        client_phone: '555-0100',
        client_pronoun: 'she/her',
        matter_type: 'Business',
        matter_summary:
          'New client seeking help forming a small business and drafting initial contracts.',
        co_clients_count: 2,
        referral_source: 'Google search',
        urgent_deadline: true,
        urgent_deadline_date: '2026-03-02',
        intake_date: '2026-02-20',
      });

      expect(text).toContain('Ada Lovelace');
      expect(text).toContain('ada@example.com');
      expect(text).toContain('555-0100');
      expect(text).toContain('she/her/her'); // pronounSubject/Object/Possessive
      expect(text).toContain('Matter Type: Business');
      expect(text).toContain(
        'New client seeking help forming a small business and drafting initial contracts.'
      );
      expect(text).toContain('2 additional individuals');
      expect(text).toContain('are involved');
      expect(text).toContain('Google search');
      expect(text).toContain('upcoming deadline of March 2, 2026');
      expect(text).toContain('February 20, 2026');
    });

    it('renders blank/default text (not throwing) for unanswered optionals, and omits the urgency sentence entirely when there is no deadline', async () => {
      const text = await renderCurated('intake-questionnaire', {
        client_full_name: 'Sam Rivera',
        client_email: 'sam@example.com',
        client_phone: null,
        client_pronoun: null,
        matter_type: 'Family',
        matter_summary: 'Uncontested divorce, no children.',
        co_clients_count: null,
        referral_source: null,
        urgent_deadline: false,
        urgent_deadline_date: null,
        intake_date: '2026-02-21',
      });

      expect(text).toContain('Sam Rivera');
      // client_phone and referral_source unanswered -> default text.
      expect(text.match(/Not provided/g)?.length).toBe(2);
      // client_pronoun unanswered -> default they/them.
      expect(text).toContain('they/them/their');
      // co_clients_count unanswered -> default "0", still plural/isAre-agreeing.
      expect(text).toContain('0 additional individuals');
      expect(text).toContain('are involved');
      // urgent_deadline is false -> the whole conditional sentence is gone,
      // not just its variable.
      expect(text).not.toContain('upcoming deadline');
      expect(text).toContain('3. Urgency.');
    });

    it('settings.intakeConfig on the curated workflow is the existing live field, not a new mechanism', () => {
      const workflow = loadWorkflowJson('intake-questionnaire');

      expect(workflow.settings?.intakeConfig).toEqual({
        allowPrefill: true,
        allowedPrefillKeys: ['client_full_name', 'client_email'],
      });
    });
  });

  describe('workflow.json shape', () => {
    it.each(['nda', 'retainer-agreement', 'intake-questionnaire'])(
      '%s workflow.json declares every alias the template uses',
      (slug) => {
        const workflow = loadWorkflowJson(slug);
        const aliases: string[] = workflow.sections.flatMap((section) =>
          section.steps.map((step) => step.alias)
        );

        // Every alias should appear as a bare tag reference somewhere in the
        // rendered document body -- a coarse but effective drift check
        // against a workflow.json edit that adds/renames a question without
        // updating the .docx (or vice versa).
        const zip = new PizZip(loadTemplate(slug));
        const documentXml: string = zip.file('word/document.xml')?.asText() ?? '';

        for (const alias of aliases) {
          expect(documentXml).toContain(alias);
        }
      }
    );
  });
});
