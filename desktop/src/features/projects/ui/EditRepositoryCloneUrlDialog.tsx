import * as React from "react";

import type { Repository } from "@/features/projects/hooks";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { ChooserDialogContent } from "@/shared/ui/chooser-dialog-content";
import { Dialog } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

const FIELD_SHELL_CLASS =
  "flex min-h-11 items-center rounded-xl border border-input bg-muted/40 px-3 transition-colors hover:border-muted-foreground/40 focus-within:border-muted-foreground/50";
const FIELD_CONTROL_CLASS =
  "h-8 border-0 bg-transparent px-0 py-0 text-muted-foreground/55 shadow-none outline-none ring-0 placeholder:text-muted-foreground/55 focus:bg-transparent focus:text-foreground focus-visible:ring-0";

export function EditRepositoryCloneUrlDialog({
  cloneUrl,
  isUpdating,
  onEdit,
  onOpenChange,
  open,
  repository,
}: {
  cloneUrl: string;
  isUpdating: boolean;
  onEdit: (cloneUrl: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  repository: Repository;
}) {
  const [url, setUrl] = React.useState(cloneUrl);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const urlInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setUrl(cloneUrl);
    setErrorMessage(null);
    const timerId = globalThis.setTimeout(
      () => urlInputRef.current?.focus(),
      50,
    );
    return () => globalThis.clearTimeout(timerId);
  }, [cloneUrl, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;
    setErrorMessage(null);
    try {
      await onEdit(url.trim());
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to update the clone URL.",
      );
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isUpdating) return;
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <ChooserDialogContent
        className="max-w-lg"
        contentClassName="pt-3"
        data-testid="edit-repository-clone-url-dialog"
        description={`Change where ${repository.name} is cloned from.`}
        footer={
          <Button
            data-testid="edit-repository-clone-url-submit"
            disabled={isUpdating || !url.trim()}
            form="edit-repository-clone-url-form"
            type="submit"
          >
            {isUpdating ? "Updating..." : "Update clone URL"}
          </Button>
        }
        footerClassName="border-t-0 pt-0"
        title="Edit clone URL"
      >
        <form
          className="space-y-5"
          id="edit-repository-clone-url-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="edit-repository-clone-url"
            >
              Clone URL
            </label>
            <div className={FIELD_SHELL_CLASS}>
              <Input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className={cn(FIELD_CONTROL_CLASS)}
                data-testid="edit-repository-clone-url-input"
                disabled={isUpdating}
                id="edit-repository-clone-url"
                onChange={(event) => {
                  setUrl(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="https://github.com/owner/repo.git"
                ref={urlInputRef}
                spellCheck={false}
                value={url}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leaving this empty falls back to the relay-hosted copy.
            </p>
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}
        </form>
      </ChooserDialogContent>
    </Dialog>
  );
}
