import type { BlockPhase } from "@/lib/vault-api";

import type {
    ExternalSendBlockConfig,
    ListToolsConfig,
    ReadTableConfig,
    WriteBlockConfig,
} from "@shared/types/blocks";

/** The block types the page canvas's Add Action menu can add. */
export type LogicBlockType = "read_table" | "write" | "external_send" | "list_tools";

/**
 * The config a freshly-added block starts with, and the phase it starts in.
 *
 * LIST-B16: `list_tools` used to seed `{ inputKey, operation, outputKey }`, and
 * not one of those is a `ListToolsConfig` field. So a block added from the menu
 * opened with an empty Output List Variable — despite the seed plainly meaning
 * to supply one — and then carried three dead keys for the rest of its life.
 * Worse, `ListToolsBlockService.createBlock` uses `config.outputListVar` as its
 * virtual step's alias, so the block's output started with **no alias** and was
 * not addressable as a variable until the author saved a real output name
 * (`updateBlock` re-aliases the step at that point, which is why this healed
 * rather than staying broken).
 *
 * The seeds live here, each annotated with its own config type, because the old
 * ones were built inline into a `Record<string, unknown>` where no amount of
 * type-checking could see the drift. Keep the annotations: they are the fix, not
 * the corrected values. A new entry in the menu with no entry here is a compile
 * error at the lookup site.
 */
const READ_TABLE_DEFAULTS: { config: ReadTableConfig; phase: BlockPhase } = {
    config: { dataSourceId: "", tableId: "", outputKey: "list_data", filters: [] },
    phase: "onPageEnter",
};

const WRITE_DEFAULTS: { config: WriteBlockConfig; phase: BlockPhase } = {
    config: {
        mode: "upsert",
        dataSourceId: "",
        tableId: "",
        columnMappings: [],
        matchStrategy: undefined,
    },
    phase: "onPageSubmit",
};

const EXTERNAL_SEND_DEFAULTS: { config: ExternalSendBlockConfig; phase: BlockPhase } = {
    config: { destinationId: "", payloadMappings: [] },
    phase: "onPageSubmit",
};

const LIST_TOOLS_DEFAULTS: { config: ListToolsConfig; phase: BlockPhase } = {
    config: { sourceListVar: "", outputListVar: "processed_list" },
    phase: "onPageSubmit",
};

export const NEW_BLOCK_DEFAULTS = {
    read_table: READ_TABLE_DEFAULTS,
    write: WRITE_DEFAULTS,
    external_send: EXTERNAL_SEND_DEFAULTS,
    list_tools: LIST_TOOLS_DEFAULTS,
} satisfies Record<LogicBlockType, { config: object; phase: BlockPhase }>;
