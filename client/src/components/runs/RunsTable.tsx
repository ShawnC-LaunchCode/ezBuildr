/**
 * Runs Table Component
 * Stage 8: Display runs with status, workflow, duration, and actions
 */

import { formatDistanceToNow } from 'date-fns';
import { Download, Eye, MoreVertical, PlayCircle, FileText } from 'lucide-react';
import React from 'react';
import { Link } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DocumentRun , documentRunsAPI } from '@/lib/vault-api';



interface RunsTableProps {
  runs: DocumentRun[];
}

export function RunsTable({ runs }: RunsTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) {return '-';}
    if (ms < 1000) {return `${ms}ms`;}
    if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Workflow</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>{getStatusBadge(run.status)}</TableCell>

              <TableCell className="font-medium">
                {run.workflowVersion?.workflow?.name || 'Unknown'}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {run.workflowVersion?.name || '-'}
              </TableCell>

              <TableCell>
                <div className="text-sm">
                  <div>{formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
              </TableCell>

              <TableCell>{formatDuration(run.durationMs)}</TableCell>

              <TableCell className="text-sm">
                {run.createdByUser?.email || run.createdBy}
              </TableCell>

              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/runs/${run.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Link>
                    </DropdownMenuItem>

                    {run.status === 'success' && run.outputRefs && (
                      <>
                        <DropdownMenuItem asChild>
                          <a
                            href={documentRunsAPI.downloadUrl(run.id, 'docx')}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download DOCX
                          </a>
                        </DropdownMenuItem>

                        <DropdownMenuItem asChild>
                          <a
                            href={documentRunsAPI.downloadUrl(run.id, 'pdf')}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Download PDF
                          </a>
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuItem asChild>
                      <Link href={`/runs/${run.id}/rerun`}>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Re-run
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
