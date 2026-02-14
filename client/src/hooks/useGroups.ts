import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";

export interface RecipientGroup {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface GroupMember {
  recipientId: string;
  name: string;
  email: string;
  tags: string[] | null;
  addedAt: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useGroups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper for error handling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
  const handleMutationError = (error: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (isUnauthorizedError(error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
      return;
    }
    toast({
      title: "Error",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      description: error.message,
      variant: "destructive",
    });
  };

  // Queries
  const {
    data: groups,
    isLoading: groupsLoading
  // eslint-disable-next-line sonarjs/no-duplicate-string
  } = useQuery<RecipientGroup[]>({
    // eslint-disable-next-line sonarjs/no-duplicate-string
    queryKey: ["/api/recipient-groups"],
    retry: false,
  });

  // Get members of a specific group
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const useGroupMembers = (groupId?: string) => {
    return useQuery<GroupMember[]>({
      queryKey: ["/api/recipient-groups", groupId, "members"],
      enabled: !!groupId,
      retry: false,
    });
  };

  // Mutations
  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", "/api/recipient-groups", data);
    },
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups"] });
      toast({
        title: "Success",
        description: "Group created successfully",
      });
    },
    onError: handleMutationError,
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: { name?: string; description?: string };
    }) => {
      return apiRequest("PUT", `/api/recipient-groups/${id}`, data);
    },
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups"] });
      toast({
        title: "Success",
        description: "Group updated successfully",
      });
    },
    onError: handleMutationError,
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/recipient-groups/${id}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups"] });
      toast({
        title: "Success",
        description: "Group deleted successfully",
      });
    },
    onError: handleMutationError,
  });

  const addMembersMutation = useMutation({
    mutationFn: async ({
      groupId,
      recipientIds
    }: {
      groupId: string;
      recipientIds: string[];
    }) => {
      return apiRequest("POST", `/api/recipient-groups/${groupId}/members`, {
        recipientIds
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onSuccess: (_, variables) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups", variables.groupId, "members"] });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups"] });
      toast({
        title: "Success",
        description: "Members added to group successfully",
      });
    },
    onError: handleMutationError,
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({
      groupId,
      recipientId
    }: {
      groupId: string;
      recipientId: string;
    }) => {
      return apiRequest("DELETE", `/api/recipient-groups/${groupId}/members/${recipientId}`);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    },
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onSuccess: (_, variables) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups", variables.groupId, "members"] });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups"] });
      toast({
        title: "Success",
        description: "Member removed from group successfully",
      });
    },
    onError: handleMutationError,
  });

  return {
    // Data
    groups,
    groupsLoading,

    // Queries
    useGroupMembers,

    // Mutations
    createGroup: createGroupMutation.mutate,
    createGroupPending: createGroupMutation.isPending,
    updateGroup: updateGroupMutation.mutate,
    updateGroupPending: updateGroupMutation.isPending,
    deleteGroup: deleteGroupMutation.mutate,
    deleteGroupPending: deleteGroupMutation.isPending,
    addMembers: addMembersMutation.mutate,
    addMembersPending: addMembersMutation.isPending,
    removeMember: removeMemberMutation.mutate,
    removeMemberPending: removeMemberMutation.isPending,
  };
}
