import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type Project,
  projectsQueryKey,
  type Repository,
} from "@/features/projects/hooks";
import { eventToRepository } from "@/features/projects/projectModels";
import { buildRepositoryCloneUrlUpdateTemplate } from "@/features/projects/projectRepositoryCreation";
import { inheritProjectDataProvenance } from "@/features/projects/projectSnapshot";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { getCachedRelayOrigin } from "@/shared/lib/mediaUrl";

type UpdateRepositoryCloneUrlInput = {
  cloneUrl: string;
  repository: Repository;
};

async function updateRepositoryCloneUrl({
  cloneUrl,
  repository,
}: UpdateRepositoryCloneUrlInput): Promise<Repository> {
  const identity = await getIdentity();
  const template = buildRepositoryCloneUrlUpdateTemplate({
    cloneUrl,
    ownerPubkey: identity.pubkey,
    repository,
  });
  const event = await signRelayEvent({
    ...template,
    createdAt: Math.max(
      Math.floor(Date.now() / 1_000),
      repository.createdAt + 1,
    ),
  });
  await relayClient.publishEvent(
    event,
    "Timed out updating the clone URL.",
    "Failed to update the clone URL.",
  );

  const updated = eventToRepository(event, getCachedRelayOrigin());
  if (!updated) {
    throw new Error(
      "Clone URL was updated but the repository could not be read.",
    );
  }
  return updated;
}

export function useUpdateRepositoryCloneUrlMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateRepositoryCloneUrl,
    onSuccess: (repository) => {
      queryClient.setQueryData<Project[]>(projectsQueryKey, (current = []) =>
        current.map((project) => {
          if (
            !project.repositories.some(
              (candidate) => candidate.repoAddress === repository.repoAddress,
            )
          ) {
            return project;
          }
          const updatedProject = {
            ...project,
            repositories: project.repositories.map((candidate) =>
              candidate.repoAddress === repository.repoAddress
                ? repository
                : candidate,
            ),
          };
          return inheritProjectDataProvenance(project, updatedProject);
        }),
      );
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
