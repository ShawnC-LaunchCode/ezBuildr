import { describe, it, expect } from 'vitest';
import expressions from 'angular-expressions';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { docxHelpers } from '../../../../server/services/docxHelpers';

interface DocxContext {
    scopeList: Record<string, unknown>[];
    num: number;
}

function spikeAngularParser(tag: string) {
    if (tag === '.') {
        return {
            get: (s: unknown) => s
        };
    }
    const expr = expressions.compile(
        tag.replace(/(’|‘)/g, "'").replace(/(“|”)/g, '"')
    );
    return {
        get: (scope: unknown, context: DocxContext) => {
            let obj: Record<string, unknown> = {};
            const scopeList = context.scopeList;
            const num = context.num;
            for (let i = 0, len = num + 1; i < len; i++) {
                obj = Object.assign(obj, scopeList[i]);
            }
            return expr(scope, obj) as unknown;
        }
    };
}

describe('TPL-1 expression spike: angular-expressions', () => {
    
    // Register docxHelpers to angular-expressions
    for (const [key, value] of Object.entries(docxHelpers)) {
        if (typeof value === 'function') {
            expressions.filters[key] = value as (...args: unknown[]) => unknown;
        }
    }

    // Helper to run docxtemplater and get text
    function render(templateContent: string, data: unknown, customFilters?: Record<string, (...args: unknown[]) => unknown>): string {
        if (customFilters) {
            for (const [k, v] of Object.entries(customFilters)) {
                expressions.filters[k] = v;
            }
        }
        const zip = new PizZip();
        zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body><w:p><w:r><w:t>${templateContent}</w:t></w:r></w:p></w:body>
        </w:document>`);
        zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`);
        
        let doc;
        try {
            doc = new Docxtemplater(zip, {
                parser: spikeAngularParser,
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{{', end: '}}' }
            });
        } catch (e: unknown) {
            if (e && typeof e === 'object' && 'properties' in e) {
                console.error(JSON.stringify(e.properties, null, 2));
            }
            throw e;
        }
        
        doc.render(data);
        const result = doc.getZip().files["word/document.xml"].asText();
        
        const matches = [...result.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)];
        return matches.map(m => m[1]).join('');
    }

    it('1. Filter in pipe position: {{ fee | currency }}', () => {
        const output = render('{{ fee | currency }}', { fee: 250 });
        expect(output).toBe('$250.00');
    });

    it('2. Chaining: {{ client_name | capitalize | upper }}', () => {
        const output = render('{{ client_name | capitalize | upper }}', { client_name: 'ada' });
        expect(output).toBe('ADA');
    });

    it('3. Comparison of two scope values', () => {
        const data = {
            Children: [{ guardian: 'Alan' }, { guardian: 'Ada' }],
            resp_full_name: 'Alan'
        };
        const output = render('{{# Children[0].guardian == resp_full_name }}X{{/ Children[0].guardian == resp_full_name }}', data);
        expect(output).toBe('X');
    });

    it('4. Array indexing', () => {
         const data = { Children: Array(10).fill({}).map((_, i) => ({ child_full_name: `Child ${i}` })) };
         const output = render('{{ Children[9].child_full_name }}', data);
         expect(output).toBe('Child 9');
    });

    it('a. Filter arguments', () => {
         const output = render('{{ date_val | date:"long" }}', { date_val: '2026-08-09T12:00:00Z' });
         expect(output).toBe('August 9, 2026');
    });

    it('b. Existing docxHelpers compatibility', () => {
        const output = render('{{ text | capitalize }}', { text: 'hello' });
        expect(output).toBe('Hello');
    });

    it('c. {{$index}} availability', () => {
         const data = { items: [ {name: 'A'}, {name: 'B'} ] };
         const output = render('{{#items}}{{$index}}: {{name}} {{/items}}', data);
         // Finding: $index is not automatically exposed to angular-expressions scope without custom mapping in the parser.
         expect(output).toBe('undefined: A undefined: B ');
    });

    it('d. Unparseable tag reporting', () => {
         let syntaxError;
         try {
             expressions.compile('a ==');
         } catch (e) {
             syntaxError = e;
         }
         expect(syntaxError).toBeDefined();
         expect((syntaxError as Error).message).toContain('[$parse:ueoe]');
    });
});
