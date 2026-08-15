import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { LiveRegion } from "@/components/ui/live-region";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

describe("shared UI primitives", () => {
  it("renders named status text without relying on color", () => {
    const html = renderToStaticMarkup(createElement(StatusBadge, { tone: "success" }, "Ready"));
    expect(html).toContain("Ready");
    expect(html).toContain("data-tone=\"success\"");
  });

  it("renders form descriptions and errors with stable IDs", () => {
    const html = renderToStaticMarkup(createElement(FormField, {
      label: "Workspace name",
      htmlFor: "workspace-name",
      description: "Use a name your team recognizes.",
      error: "A workspace name is required.",
    }, createElement("input", { id: "workspace-name", "aria-describedby": "workspace-name-description workspace-name-error", "aria-invalid": true })));
    expect(html).toContain("for=\"workspace-name\"");
    expect(html).toContain("id=\"workspace-name-description\"");
    expect(html).toContain("id=\"workspace-name-error\"");
    expect(html).toContain("A workspace name is required.");
  });

  it("renders confirmation dialogs as modal alert dialogs", () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, { open: true, title: "Delete workspace", description: "This cannot be undone.", confirmLabel: "Delete", onCancel: () => undefined, onConfirm: () => undefined }));
    expect(html).toContain("role=\"alertdialog\"");
    expect(html).toContain("aria-modal=\"true\"");
    expect(html).toContain("Delete workspace");
    expect(html).toContain("This cannot be undone.");
  });

  it("uses live-region roles for status and alert announcements", () => {
    expect(renderToStaticMarkup(createElement(LiveRegion, { mode: "polite" }, "Saved."))).toContain("role=\"status\"");
    expect(renderToStaticMarkup(createElement(LiveRegion, { mode: "assertive" }, "Failed."))).toContain("role=\"alert\"");
  });

  it("labels progress, empty, loading, and inline error states", () => {
    expect(renderToStaticMarkup(createElement(Progress, { label: "Knowledge indexed", value: 4, max: 10 }))).toContain("aria-valuenow=\"4\"");
    expect(renderToStaticMarkup(createElement(EmptyState, { title: "No brands", description: "Create a brand to continue." }))).toContain("No brands");
    expect(renderToStaticMarkup(createElement(Skeleton, { label: "Loading brands" }))).toContain("Loading brands");
    expect(renderToStaticMarkup(createElement(InlineAlert, { tone: "error", title: "Could not save" }, "Try again."))).toContain("Could not save");
  });
});
