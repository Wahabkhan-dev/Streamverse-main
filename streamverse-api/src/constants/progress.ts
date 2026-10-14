/** Section 40: one threshold, used everywhere "completed" is derived — never a magic number scattered around. */
export const COMPLETION_THRESHOLD_PERCENT = 95;

export const isCompleted = (percentage: number) => percentage >= COMPLETION_THRESHOLD_PERCENT;

/** Section 76: this is documentation for the frontend, not something the backend enforces. */
export const RECOMMENDED_PROGRESS_SAVE_INTERVAL_SECONDS = 20;
