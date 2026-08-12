-- AI-reported color data for logoColorMatch previews (no hex swatch was ever
-- handed to the prompt for these — Gemini reads the color off the logo image
-- itself, so its reported hex is the only place that value exists as data).

alter table public.preview_jobs
  add column if not exists result_colors jsonb;  -- (ColorReport | null)[], parallel to result_urls
