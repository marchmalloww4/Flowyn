export const AGENT_TOOL_CATALOG = [
  {
    name: "search_brand_knowledge",
    label: "Search Brand Knowledge",
    description: "Search the business information you added to Flowyn.",
    requiresBrand: true,
  },
  {
    name: "get_brand_profile",
    label: "Get Brand Profile",
    description: "Use your saved brand description, audience, and voice.",
    requiresBrand: true,
  },
] as const;

export type AgentToolName = (typeof AGENT_TOOL_CATALOG)[number]["name"];
