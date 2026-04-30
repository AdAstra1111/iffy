/**
 * Tiny schema-validation helpers for AI JSON responses.
 * No dependencies. Used with parseAiJson / callLLMWithJsonRetry validators.
 */
/** True if value is a non-null plain object. */
export function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** True if value is an object with `key` being an array. */
export function hasArray(v, key) {
    return isObject(v) && Array.isArray(v[key]);
}
/** True if value is an object with `key` being a non-null object. */
export function hasObject(v, key) {
    return isObject(v) && isObject(v[key]);
}
/** True if value is a string with length > 0. */
export function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
