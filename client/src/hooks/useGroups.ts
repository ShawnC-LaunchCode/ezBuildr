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

export function useGroups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper for error handling
  const handleMutationError = (error: any) => {
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
      description: error.message,
      variant: "destructive",
    });
  };

  // Queries
  const {
    data: groups,
    isLoading: groupsLoading
  } = useQuery<RecipientGroup[]>({
    queryKey: ["/api/recipient-groups"],
    retry: false,
  });

  // Get members of a specific group
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
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups", variables.groupId, "members"] });
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
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipient-groups", variables.groupId, "members"] });
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
