/**
 * BuilderCanvas - Main React Flow canvas for visual workflow editing
 */
import { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useBuilderStore } from '../store/useBuilderStore';
import { nodeTypes } from './NodeCard';
interface BuilderCanvasProps {
  readOnly?: boolean;
}
export function BuilderCanvas({ readOnly = false }: BuilderCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
  } = useBuilderStore();
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );
  const handleConnect: OnConnect = useCallback(
    (connection) => {
      onConnect(connection);
    },
    [onConnect]
  );
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      selectNode(node.id);
    },
    [selectNode]
  );
  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);
  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900">
      <ReactFlow
        nodes={nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            nodeType: node.type,
          },
        }))}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        panOnScroll={true}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
        className={`bg-gray-50 dark:bg-gray-900 ${readOnly ? 'pointer-events-none' : ''} [&_.react-flow__node]:pointer-events-auto`}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="bg-gray-50 dark:bg-gray-900"
        />
        <Controls className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
        <MiniMap
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          nodeColor={(node: any) => {
            const colors = {
              question: '#3b82f6',
              compute: '#f59e0b',
              branch: '#a855f7',
              template: '#10b981',
            };
            return colors[node.type as keyof typeof colors] || '#6b7280';
          }}
        />
      </ReactFlow>
    </div>
  );
}