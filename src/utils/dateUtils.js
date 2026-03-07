/** Convert a Firestore Timestamp, Date, or string/number to milliseconds */
export const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;

/** Convert a Firestore Timestamp, Date, or string/number to a JS Date (or null) */
export function safeDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}
