interface Block {
  id: string;
  type: string;
  children?: Block[];
  props?: Record<string, any>;
}
interface AuditResult {
  passed: boolean;
  issues: string[];
}
const MAX_NESTING_DEPTH = 10;
const MAX_BLOCK_COUNT = 500;
export class BlockAudit {
  static audit(blocks: Block[]): AuditResult {
    const issues: string[] = [];
    let totalBlocks = 0;
    const traverse = (nodes: Block[], depth: number) => {
      for (const node of nodes) {
        totalBlocks++;
        if (depth > MAX_NESTING_DEPTH) {
          // We only report once per deep branch to avoid spam
          if (issues.length < 50) {
            issues.push(`Block ${node.id} exceeds max nesting depth of ${MAX_NESTING_DEPTH}`);
          }
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children, depth + 1);
        }
      }
    };
    traverse(blocks, 1);
    if (totalBlocks > MAX_BLOCK_COUNT) {
      issues.push(`Total block count ${totalBlocks} exceeds limit of ${MAX_BLOCK_COUNT}`);
    }
    return {
      passed: issues.length === 0,
      issues
    };
  }
}