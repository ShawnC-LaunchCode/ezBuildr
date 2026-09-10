/**
 * Friendly names for block types, for the block editor dialog's read-only
 * Block Type field.
 *
 * The copy for the four types the old type-picker could name is preserved
 * verbatim ("Prefill (Deprecated)", "Read Data (Legacy)", ...); the rest reuse
 * the wording already shown on the page canvas (`BlockCard`) and in the sidebar
 * tree (`BlockTreeItem`).
 */
const BLOCK_TYPE_LABELS: Record<string, string> = {
    prefill: "Prefill (Deprecated)",
    validate: "Validate (Deprecated)",
    branch: "Branch (Deprecated)",
    query: "Read Data (Legacy)",
    list_tools: "List Tools",
    js: "Script",
    transform: "Transform",
    read_table: "Read from Table",
    write: "Send Data to Table",
    send_table: "Send Data to Table",
    external_send: "Send Data to API",
    create_record: "Create Record",
    update_record: "Update Record",
    find_record: "Find Record",
    delete_record: "Delete Record",
};

/**
 * LIST-B2: this must never return empty. The field it feeds used to be a
 * `Select` whose options were filtered by the workflow's mode, so any type the
 * mode did not offer — `list_tools` in Easy mode, and `js`/`transform` in both
 * — rendered as a blank control with a value set, which reads as a broken
 * dialog. An unrecognised type falls back to its raw name, which is ugly but
 * honest and, unlike a blank, tells you what you are looking at.
 */
export function blockTypeLabel(type: string): string {
    return BLOCK_TYPE_LABELS[type] ?? type;
}
