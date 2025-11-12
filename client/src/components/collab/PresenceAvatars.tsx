import { Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { CollabUser } from '@/hooks/collab/useCollabClient';

interface PresenceAvatarsProps {
  users: CollabUser[];
  maxVisible?: number;
}

/**
 * Display avatars of users currently collaborating on the workflow
 */
export function PresenceAvatars({ users, maxVisible = 5 }: PresenceAvatarsProps) {
  const visibleUsers = users.slice(0, maxVisible);
  const hiddenCount = Math.max(0, users.length - maxVisible);

  if (users.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Users className="w-4 h-4 text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">{users.length} online</span>
        </div>

        <div className="flex -space-x-2">
          {visibleUsers.map((user) => (
            <Tooltip key={user.userId}>
              <TooltipTrigger asChild>
                <Avatar
                  className="w-8 h-8 border-2 border-background ring-2 ring-offset-0"
                  style={{ borderColor: user.color }}
                >
                  <AvatarFallback
                    className="text-xs font-semibold text-white"
                    style={{ backgroundColor: user.color }}
                  >
                    {getInitials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex flex-col gap-1">
                <div className="font-semibold">{user.displayName}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
                <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
              </TooltipContent>
            </Tooltip>
          ))}

          {hiddenCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="w-8 h-8 border-2 border-background">
                  <AvatarFallback className="text-xs font-semibold bg-muted">
                    +{hiddenCount}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-xs">
                  {hiddenCount} more {hiddenCount === 1 ? 'user' : 'users'}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Get initials from display name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
