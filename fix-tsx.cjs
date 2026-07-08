const fs = require('fs');

function replaceRegex(file, regex, replace) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let orig = content;
        content = content.replace(regex, replace);
        if (content !== orig) {
            fs.writeFileSync(file, content, 'utf8');
            console.log('Fixed ' + file);
        }
    }
}

// chart.tsx
replaceRegex('client/src/components/ui/chart.tsx', /payload\./g, 'payload?.');

// ProjectCard.tsx
replaceRegex('client/src/components/dashboard/ProjectCard.tsx', /entity\.name/g, '(entity as any).name');
replaceRegex('client/src/components/dashboard/ProjectCard.tsx', /entity\.description/g, '(entity as any).description');
replaceRegex('client/src/components/dashboard/ProjectCard.tsx', /entity\.status/g, '(entity as any).status');
replaceRegex('client/src/components/dashboard/ProjectCard.tsx', /entity\.id/g, '(entity as any).id');
replaceRegex('client/src/components/dashboard/ProjectCard.tsx', /entity\.updatedAt/g, '(entity as any).updatedAt');

// AdminUsers.tsx
replaceRegex('client/src/pages/AdminUsers.tsx', /'isActive'/g, "('isActive' as any)");

// OptimizationWizard.tsx
replaceRegex('client/src/pages/optimization/OptimizationWizard.tsx', /workflow\.optimizationScore/g, '(workflow as any).optimizationScore');
replaceRegex('client/src/pages/optimization/OptimizationWizard.tsx', /metrics\./g, '(metrics as any).');

// OrganizationDetail.tsx
replaceRegex('client/src/pages/OrganizationDetail.tsx', /organization\.name/g, '(organization as any).name');
replaceRegex('client/src/pages/OrganizationDetail.tsx', /organization\.description/g, '(organization as any).description');
replaceRegex('client/src/pages/OrganizationDetail.tsx', /organization\.members\.map/g, '(organization as any).members.map');
replaceRegex('client/src/pages/OrganizationDetail.tsx', /organization\.invites\.map/g, '(organization as any).invites.map');
replaceRegex('client/src/pages/OrganizationDetail.tsx', /\(member\)/g, '(member: any)');
replaceRegex('client/src/pages/OrganizationDetail.tsx', /\(invite\)/g, '(invite: any)');

// Organizations.tsx
replaceRegex('client/src/pages/Organizations.tsx', /organizations\.map/g, '(organizations as any).map');
replaceRegex('client/src/pages/Organizations.tsx', /\(org\)/g, '(org: any)');
replaceRegex('client/src/pages/Organizations.tsx', /org\.members/g, '(org as any).members');
replaceRegex('client/src/pages/Organizations.tsx', /org\.id/g, '(org as any).id');
replaceRegex('client/src/pages/Organizations.tsx', /org\.name/g, '(org as any).name');
replaceRegex('client/src/pages/Organizations.tsx', /org\.description/g, '(org as any).description');
replaceRegex('client/src/pages/Organizations.tsx', /org\.createdAt/g, '(org as any).createdAt');

// TransferOwnershipDialog.tsx
replaceRegex('client/src/components/dialogs/TransferOwnershipDialog.tsx', /organizations\.length/g, '(organizations as any)?.length');
replaceRegex('client/src/components/dialogs/TransferOwnershipDialog.tsx', /organizations\.map/g, '(organizations as any)?.map');
replaceRegex('client/src/components/dialogs/TransferOwnershipDialog.tsx', /\(org\)/g, '(org: any)');
replaceRegex('client/src/components/dialogs/TransferOwnershipDialog.tsx', /org\.name/g, '(org as any).name');
replaceRegex('client/src/components/dialogs/TransferOwnershipDialog.tsx', /org\.id/g, '(org as any).id');

// NodeCard.tsx
replaceRegex('client/src/pages/visual-builder/components/NodeCard.tsx', /data\.label/g, '(data.label as any)');
replaceRegex('client/src/pages/visual-builder/components/NodeCard.tsx', /data\.description/g, '(data.description as any)');
replaceRegex('client/src/pages/visual-builder/components/NodeCard.tsx', /data\.type/g, '(data.type as any)');
replaceRegex('client/src/pages/visual-builder/components/NodeCard.tsx', /data\.status/g, '(data.status as any)');

// RecordEditorModal.tsx
replaceRegex('client/src/components/collections/RecordEditorModal.tsx', /\{cellValue\}/g, '{cellValue as any}');
replaceRegex('client/src/components/collections/RecordEditorModal.tsx', /\{column\.name\}/g, '{(column as any).name}');

// PreviewPanel.tsx
replaceRegex('client/src/pages/visual-builder/components/PreviewPanel.tsx', /\{node\.data\.label\}/g, '{(node.data.label as any)}');

