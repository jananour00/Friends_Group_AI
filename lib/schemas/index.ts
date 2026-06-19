import { z } from "zod";

export const ExtractionSchema = z.object({
  values: z.array(z.string()).min(1),
  priorities: z.array(z.string()).min(1),
  signals: z.object({
    contradiction: z.boolean(),
    repetition: z.array(z.string()),
    bundling: z.boolean(),
    hedging: z.boolean(),
    omission: z.array(z.string()),
  }),
});

export const CheckpointSelectionSchema = z.object({
  checkpoint_type: z
    .enum(["contradiction", "repetition", "bundling", "hedging", "omission"])
    .nullable(),
  reason: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const NarrativeSchema = z.object({
  path_a_label: z.string().min(2),
  path_b_label: z.string().min(2),
  path_a: z.object({
    body: z.string().min(20),
    flip_condition: z.string().min(5),
  }),
  path_b: z.object({
    body: z.string().min(20),
    flip_condition: z.string().min(5),
  }),
});

export const StanceSchema = z.object({
  lean: z.string().min(5),
  flip_condition: z.string().min(5),
  handback: z.string().min(10),
});
