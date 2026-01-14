import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

interface Template {
  id: string;
  name: string;
  description: string | null;
  content: any;
  creatorId: string;
  isSystem: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface InsertTemplateVariables {
  templateId: string;
  surveyId: string;
}

interface SaveTemplateVariables {
  surveyId: string;
  name: string;
  description?: string;
}

interface UpdateTemplateVariables {
  id: string;
  data: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}

interface TemplateShare {
  id: string;
  templateId: string;
  userId: string | null;
  userEmail: string | null;
  pendingEmail: string | null;
  access: "use" | "edit";
  invitedAt: string;
  acceptedAt: string | null;
}

interface ShareTemplateVariables {
  templateId: string;
  userId?: string;
  email?: string;
  access: "use" | "edit";
}

interface UpdateShareVariables {
  shareId: string;
  access: "use" | "edit";
}

export function useTemplates() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const response = await axios.get<Template[]>("/api/templates");
      return response.data;
    },
    staleTime: 60_000, // 1 minute
  });

  const insert = useMutation({
    mutationFn: async ({ templateId, surveyId }: InsertTemplateVariables) => {
      const response = await axios.post(
        `/api/templates/${templateId}/insert/${surveyId}`
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate survey queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ["survey", variables.surveyId] });
      queryClient.invalidateQueries({ queryKey: ["surveyPages", variables.surveyId] });
    },
  });

  const saveFromSurvey = useMutation({
    mutationFn: async ({ surveyId, name, description }: SaveTemplateVariables) => {
      const response = await axios.post(`/api/templates/from-survey/${surveyId}`, {
        name,
        description,
      });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate templates list to show new template
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: UpdateTemplateVariables) => {
      const response = await axios.put(`/api/templates/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate templates list to show updated data
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/templates/${id}`);
    },
    onSuccess: () => {
      // Invalidate templates list to remove deleted template
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  return { list, insert, saveFromSurvey, update, remove };
}

export function useTemplateSharing(templateId?: string) {
  const queryClient = useQueryClient();

  const listShares = useQuery({
    queryKey: ["templateShares", templateId],
    queryFn: async () => {
      if (!templateId) {return [];}
      const response = await axios.get<TemplateShare[]>(`/api/templates/${templateId}/shares`);
      return response.data;
    },
    enabled: !!templateId,
    staleTime: 30_000, // 30 seconds
  });

  const share = useMutation({
    mutationFn: async (variables: ShareTemplateVariables) => {
      const response = await axios.post(`/api/templates/${variables.templateId}/share`, {
        userId: variables.userId,
        email: variables.email,
        access: variables.access,
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["templateShares", variables.templateId] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const updateAccess = useMutation({
    mutationFn: async ({ shareId, access }: UpdateShareVariables) => {
      const response = await axios.put(`/api/template-shares/${shareId}`, { access });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templateShares"] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (shareId: string) => {
      await axios.delete(`/api/template-shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templateShares"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const listSharedWithMe = useQuery({
    queryKey: ["templatesSharedWithMe"],
    queryFn: async () => {
      const response = await axios.get(`/api/templates-shared-with-me`);
      return response.data;
    },
    staleTime: 60_000, // 1 minute
  });

  return { listShares, share, updateAccess, revoke, listSharedWithMe };
}
