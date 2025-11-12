# Real-Time Collaboration Integration Guide

This guide explains how to integrate the real-time collaboration features into the WorkflowBuilder component.

## Overview

The collaboration system provides:
- **Multi-user editing** via Yjs CRDT
- **Presence tracking** (avatars, cursors, selection)
- **Node-level comments**
- **Conflict-free merges**
- **Secure, tenant-scoped rooms with RBAC**

## Architecture

### Server-Side
- **WebSocket Server** (`server/realtime/collabServer.ts`) - Manages connections and rooms
- **Persistence** (`server/realtime/persistence.ts`) - Handles Yjs document storage, snapshots, Redis pub/sub
- **Auth** (`server/realtime/auth.ts`) - JWT validation and RBAC checks
- **Awareness** (`server/realtime/awareness.ts`) - Presence protocol integration

### Client-Side
- **useCollabClient** hook - Connects to WebSocket server and syncs with React Flow
- **PresenceAvatars** - Shows online users
- **LiveCursorsLayer** - Renders remote cursors
- **CommentsPanel** - Node-level comments UI
- **useComments** hook - Manages comments

## Integration Example

### 1. Add Collaboration to WorkflowBuilder

```typescript
// client/src/pages/WorkflowBuilder.tsx
import { useState, useCallback } from 'react';
import { useCollabClient } from '@/hooks/collab/useCollabClient';
import { useComments } from '@/hooks/collab/useComments';
import { PresenceAvatars } from '@/components/collab/PresenceAvatars';
import { LiveCursorsLayer } from '@/components/collab/LiveCursorsLayer';
import { CommentsPanel } from '@/components/collab/CommentsPanel';
import { useAuth } from '@/hooks/useAuth';

export default function WorkflowBuilder() {
  const { user } = useAuth();
  const { workflowId, tenantId } = useParams();

  // React Flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Collaboration state
  const collab = useCollabClient({
    workflowId,
    tenantId: user.tenantId,
    token: user.token, // JWT token
    onNodesChange: setNodes,
    onEdgesChange: setEdges,
    enabled: true,
  });

  // Comments
  const comments = useComments({
    doc: collab.doc,
    nodeId: selectedNodeId,
  });

  // Handle node changes
  const handleNodesChange = useCallback((changes) => {
    const updatedNodes = applyNodeChanges(changes, nodes);
    setNodes(updatedNodes);
    collab.updateNodes(updatedNodes);
  }, [nodes, collab]);

  // Handle edge changes
  const handleEdgesChange = useCallback((changes) => {
    const updatedEdges = applyEdgeChanges(changes, edges);
    setEdges(updatedEdges);
    collab.updateEdges(updatedEdges);
  }, [edges, collab]);

  // Handle node selection
  const handleNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
    collab.updateSelectedNode(node.id);
  }, [collab]);

  // Handle canvas mouse move (for cursor tracking)
  const handlePaneMouseMove = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    collab.updateCursor(x, y);
  }, [collab]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header with presence */}
      <div className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1>Workflow Builder</h1>

          {/* Connection status */}
          {collab.connected && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                {collab.synced ? 'Synced' : 'Syncing...'}
              </span>
            </div>
          )}
        </div>

        {/* Presence avatars */}
        <PresenceAvatars users={collab.users} />
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneMouseMove={handlePaneMouseMove}
        >
          <Background />
          <Controls />

          {/* Live cursors overlay */}
          <LiveCursorsLayer
            users={collab.users}
            viewport={{ x: 0, y: 0, zoom: 1 }} // Get from ReactFlow viewport
          />
        </ReactFlow>

        {/* Comments panel (when node is selected) */}
        {selectedNodeId && (
          <div className="absolute right-4 top-4 bottom-4 w-96 z-10">
            <CommentsPanel
              comments={comments.comments}
              currentUserId={user.id}
              currentUserName={user.displayName}
              nodeName={nodes.find(n => n.id === selectedNodeId)?.data?.label}
              onAddComment={(text) => comments.addComment(text, user.id, user.displayName)}
              onDeleteComment={comments.deleteComment}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2. Enable Collaboration in Existing Workflow Routes

The collaboration system is tenant-scoped and uses room keys in the format:
```
tenant:{tenantId}:workflow:{workflowId}
```

The WebSocket server is available at:
```
ws://localhost:5000/collab?room=tenant:abc:workflow:xyz&token=JWT_TOKEN
```

### 3. Environment Variables

Add these to your `.env` file:

```bash
# Redis for multi-instance collaboration (optional)
REDIS_URL=redis://localhost:6379

# Collaboration settings
COLLAB_SNAPSHOT_INTERVAL=200  # Create snapshot every N updates
COLLAB_UPDATES_TO_KEEP=1000   # Keep last N updates in database
```

## RBAC Permissions

The collaboration server enforces role-based access:

- **owner** / **builder**: Full edit access
- **runner**: Read-only access (can see changes, cannot mutate)
- **viewer**: Read-only access

Users with read-only access will see an error if they attempt to make changes.

## API Endpoints

### Metrics (Development Only)

```
GET /api/realtime/metrics
```

Returns:
```json
{
  "activeRooms": 2,
  "activeConnections": 5,
  "totalMessages": 1523,
  "totalUpdates": 342,
  "roomDetails": [
    {
      "name": "tenant:abc:workflow:xyz",
      "activeUsers": 3,
      "documentSize": 45231
    }
  ]
}
```

### Room Stats (Development Only)

```
GET /api/realtime/rooms/:roomId/stats
```

Returns:
```json
{
  "name": "tenant:abc:workflow:xyz",
  "activeUsers": 3,
  "users": [
    {
      "userId": "user123",
      "displayName": "John Doe",
      "role": "builder"
    }
  ],
  "documentSize": 45231,
  "awarenessStates": 3
}
```

## Database Schema

### Tables Created

1. **collab_docs** - Collaboration documents
   - Links to workflow and tenant
   - Optional version ID for versioned editing

2. **collab_updates** - Append-only update log
   - Sequential updates with base64-encoded Yjs data
   - Used for replay and sync

3. **collab_snapshots** - Periodic snapshots
   - Full document state at specific clock values
   - Speeds up initial load

### Migrations

Run database migrations:
```bash
npm run db:push
```

## Testing

### Server-Side Tests

Create tests in `tests/collab.server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';

describe('Collaboration Server', () => {
  it('should authenticate connection with valid JWT', async () => {
    const ws = new WebSocket('ws://localhost:5000/collab?room=tenant:test:workflow:123', {
      headers: { Authorization: `Bearer ${validJWT}` }
    });

    await new Promise((resolve) => ws.once('open', resolve));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('should reject connection with invalid JWT', async () => {
    const ws = new WebSocket('ws://localhost:5000/collab?room=tenant:test:workflow:123', {
      headers: { Authorization: 'Bearer invalid' }
    });

    await new Promise((resolve) => ws.once('close', resolve));
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it('should sync updates between two clients', async () => {
    // Test implementation...
  });
});
```

### Client-Side Tests

Create tests in `tests/collab.client.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useCollabClient } from '@/hooks/collab/useCollabClient';

describe('useCollabClient', () => {
  it('should connect and sync', async () => {
    const { result } = renderHook(() => useCollabClient({
      workflowId: 'test',
      tenantId: 'tenant-test',
      token: validJWT,
      onNodesChange: vi.fn(),
      onEdgesChange: vi.fn(),
    }));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
      expect(result.current.synced).toBe(true);
    });
  });
});
```

## Performance Optimization

### Client-Side

1. **Throttle cursor updates**: Already implemented at ~30fps
2. **Debounce React Flow → Yjs sync**: Use 16ms debounce for smooth 60fps updates
3. **Batch apply updates**: Group incoming updates to avoid layout thrash

### Server-Side

1. **Use Redis** for multi-instance deployments
2. **Create snapshots** every 200 updates (configurable)
3. **Trim old updates** to keep last 1000 (configurable)
4. **Use binary encoding** for Yjs updates (already implemented)

## Troubleshooting

### Connection Issues

1. Check JWT token is valid and not expired
2. Verify user has correct tenantId
3. Check WebSocket server is running (`/api/health`)
4. Verify firewall allows WebSocket connections

### Sync Issues

1. Check Redis connection if using multi-instance
2. Verify database has collab tables
3. Check browser console for errors
4. Use `/api/realtime/metrics` to monitor state

### Permission Errors

1. Verify user role in JWT payload
2. Check workflow access permissions
3. Ensure tenantId matches between user and workflow

## Next Steps

1. Add conflict resolution UI for rare edge cases
2. Implement activity log for audit trail
3. Add notification system for @mentions in comments
4. Implement rich text editor for comments
5. Add file attachments to comments
