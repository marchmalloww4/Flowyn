import { z } from "zod";

export const stepIdSchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/, "Step IDs must be safe identifiers.");
