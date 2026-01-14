/**
 * ConnectionsPanel - View and manage edges/connections between nodes
 */

import { ArrowRight, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useBuilderStore } from '../store/useBuilderStore';

export function ConnectionsPanel() {
  const { nodes, edges, setEdges } = useBuilderStore();

  const handleDeleteEdge = (edgeId: string) => {
    if (confirm('Are you sure you want to delete this connection?')) {
      setEdges(edges.filter(e => e.id !== edgeId));
    }
  };

  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data.label || nodeId;
  };

  const getNodeType = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.type || 'unknown';
  };

  const nodeTypeColors = {
    question: 'bg-blue-500',
    compute: 'bg-amber-500',
    branch: 'bg-purple-500',
    template: 'bg-green-500',
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">Connections</CardTitle>
        <p className="text-sm text-muted-foreground">
          {edges.length} connection{edges.length !== 1 ? 's' : ''}
        </p>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {edges.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No connections yet. Connect nodes by dragging from output to input handles.
            </div>
          ) : (
            <div className="space-y-2">
              {edges.map((edge) => (
                <Card key={edge.id} className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`${
                          nodeTypeColors[getNodeType(edge.source) as keyof typeof nodeTypeColors] || 'bg-gray-500'
                        } text-white text-xs`}
                      >
                        {getNodeType(edge.source)}
                      </Badge>
                      <span className="text-sm truncate flex-1">
                        {getNodeLabel(edge.source)}
                      </span>
                    </div>

                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        className={`${
                          nodeTypeColors[getNodeType(edge.target) as keyof typeof nodeTypeColors] || 'bg-gray-500'
                        } text-white text-xs`}
                      >
                        {getNodeType(edge.target)}
                      </Badge>
                      <span className="text-sm truncate flex-1">
                        {getNodeLabel(edge.target)}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteEdge(edge.id)}
                      className="w-full"
                    >
                      <Trash2 className="w-3 h-3 mr-2" />
                      Remove
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
