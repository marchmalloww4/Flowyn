import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";
import { navigationItems } from "@/components/flowyn-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { LiveRegion } from "@/components/ui/live-region";
import { Input } from "@/components/ui/input";

describe("M14 accessibility contracts", () => {
  it("keeps the public page to one primary heading and exposes a skip-compatible landmark", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("<main");
  });

  it("gives icon/navigation surfaces stable accessible labels", () => {
    expect(navigationItems.length).toBe(12);
    expect(navigationItems.every((item) => item.label.length > 0 && item.href.startsWith("/dashboard"))).toBe(true);
  });

  it("preserves live regions, invalid-field wiring, and confirmation dialog semantics", () => {
    const live = renderToStaticMarkup(createElement(LiveRegion, { mode: "polite" }, "Workspace changed"));
    const field = renderToStaticMarkup(createElement(FormField, { error: "Required", htmlFor: "name", label: "Name" }, createElement(Input, { id: "name" })));
    const dialog = renderToStaticMarkup(createElement(ConfirmDialog, { confirmLabel: "Confirm", description: "Confirm this action", onCancel: () => undefined, onConfirm: () => undefined, open: true, title: "Confirm action" }));
    expect(live).toContain('role="status"');
    expect(field).toContain('aria-invalid="true"');
    expect(field).toContain("name-error");
    expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toContain('aria-modal="true"');
  });
});
