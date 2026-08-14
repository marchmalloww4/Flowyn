"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkflowEditorNode } from "@/lib/workflows/editor";
import type { IntegrationActionConfig } from "@/lib/integrations/types";
import type { WorkflowValueExpression } from "@/lib/workflows/types";

export interface WorkflowEditorCredentialOption {
  id: string;
  name: string;
  connectorId: "slack";
  revokedAt: string | null;
  deletedAt: string | null;
}

function expressionText(expression: WorkflowValueExpression): string {
  return expression.kind === "reference" ? expression.path : typeof expression.value === "string" ? expression.value : JSON.stringify(expression.value);
}

function expressionFromText(kind: "literal" | "reference", value: string): WorkflowValueExpression {
  return kind === "reference" ? { kind, path: value } : { kind, value };
}

function ExpressionField({
  id,
  label,
  expression,
  onChange,
}: {
  id: string;
  label: string;
  expression: WorkflowValueExpression;
  onChange: (expression: WorkflowValueExpression) => void;
}) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2"><select aria-label={`${label} kind`} value={expression.kind} onChange={(event) => onChange(expressionFromText(event.target.value as "literal" | "reference", expressionText(expression)))} className="h-10 rounded-xl border border-slate-200 bg-transparent px-2 text-xs dark:border-slate-700"><option value="literal">Literal</option><option value="reference">Reference</option></select><Input id={id} value={expressionText(expression)} onChange={(event) => onChange(expressionFromText(expression.kind, event.target.value))} placeholder={expression.kind === "reference" ? "steps.previous.output.channel" : label} /></div><p className="text-[11px] text-slate-500">{expression.kind === "reference" ? "Use a bounded workflow path; the server validates it." : "Stored as a bounded string literal."}</p></div>;
}

export function WorkflowConfigPanel({ node, onUpdate, integrationCredentials = [] }: { node: WorkflowEditorNode | null; onUpdate: (patch: Partial<Pick<WorkflowEditorNode, "name" | "config">>) => void; integrationCredentials?: WorkflowEditorCredentialOption[] }) {
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setConfigText(node ? JSON.stringify(node.config, null, 2) : "{}");
    setConfigError(null);
  }, [node]);

  if (!node) return <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800">Select a step to edit its name and server-validated configuration.</div>;

  if (node.type === "INTEGRATION_ACTION") {
    const config = node.config as IntegrationActionConfig;
    const availableCredentials = integrationCredentials.filter((credential) => credential.connectorId === config.connectorId && !credential.revokedAt && !credential.deletedAt);
    const currentCredentialIsMissing = Boolean(config.credentialId) && !availableCredentials.some((credential) => credential.id === config.credentialId);
    const updateIntegrationConfig = (patch: Partial<IntegrationActionConfig>) => onUpdate({ config: { ...config, ...patch } as WorkflowEditorNode["config"] });
    const updateInput = (field: "channel" | "text", expression: WorkflowValueExpression) => updateIntegrationConfig({ input: { ...config.input, [field]: expression } });

    return <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Selected step</p><p className="mt-1 text-sm font-semibold">Slack · Post message</p></div><div className="space-y-2"><Label htmlFor="workflow-step-name">Name</Label><Input id="workflow-step-name" value={node.name} onChange={(event) => onUpdate({ name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="workflow-integration-credential">Credential</Label><select id="workflow-integration-credential" value={config.credentialId} onChange={(event) => updateIntegrationConfig({ credentialId: event.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"><option value="">Select a Slack credential</option>{currentCredentialIsMissing && <option value={config.credentialId}>Current credential unavailable</option>}{availableCredentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.name}</option>)}</select><p className="text-[11px] text-slate-500">Only safe credential metadata is shown. The secret is never loaded into the editor.</p></div><ExpressionField id="workflow-integration-channel" label="Channel" expression={config.input.channel} onChange={(expression) => updateInput("channel", expression)} /><ExpressionField id="workflow-integration-text" label="Message" expression={config.input.text} onChange={(expression) => updateInput("text", expression)} /><div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Slack post_message is an external side effect and requires an APPROVAL step on every reachable path. The server revalidates this before saving and executing.</div><p className="text-xs leading-5 text-slate-500">The connector and operation are fixed by the server registry. URLs, methods, headers, and arbitrary network settings are not editable.</p></div>;
  }

  function applyConfig() {
    try {
      const parsed: unknown = JSON.parse(configText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Configuration must be a JSON object.");
      onUpdate({ config: parsed as WorkflowEditorNode["config"] });
      setConfigError(null);
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "Configuration must be valid JSON.");
    }
  }

  return <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Selected step</p><p className="mt-1 text-sm font-semibold">{node.type.replace("_", " ")}</p></div><div className="space-y-2"><Label htmlFor="workflow-step-name">Name</Label><Input id="workflow-step-name" value={node.name} onChange={(event) => onUpdate({ name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="workflow-step-config">Configuration JSON</Label><textarea id="workflow-step-config" value={configText} onChange={(event) => setConfigText(event.target.value)} className="min-h-48 w-full rounded-2xl border border-slate-200 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-slate-950 dark:border-slate-700" spellCheck={false} /><Button type="button" size="sm" variant="outline" onClick={applyConfig}>Apply configuration</Button>{configError && <p role="alert" className="text-xs text-red-600">{configError}</p>}</div><p className="text-xs leading-5 text-slate-500">The server validates this configuration and all referenced agents/brands before creating an executable version.</p></div>;
}
