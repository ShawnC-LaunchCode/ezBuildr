/**
 * Event bus for Dev Window panel
 * Handles Insert actions and workflow update notifications
 */

type InsertHandler = (key: string) => void;
type UpdateHandler = () => void;

const insertListeners = new Set<InsertHandler>();
const updateListeners = new Set<UpdateHandler>();

export const DevPanelBus = {
  /**
   * Register a listener for Insert events
   * Returns an unsubscribe function
   */
  onInsert(fn: InsertHandler): () => void {
    insertListeners.add(fn);
    return () => insertListeners.delete(fn);
  },

  /**
   * Emit an Insert event with a variable key
   * Active JS editors will receive this and insert the key
   */
  emitInsert(key: string): void {
    insertListeners.forEach((fn) => fn(key));
  },

  /**
   * Register a listener for workflow update events
   * Returns an unsubscribe function
   */
  onWorkflowUpdate(fn: UpdateHandler): () => void {
    updateListeners.add(fn);
    return () => updateListeners.delete(fn);
  },

  /**
   * Emit a workflow update event
   * This triggers variable list refetch
   */
  emitWorkflowUpdate(): void {
    updateListeners.forEach((fn) => fn());
  },
};
