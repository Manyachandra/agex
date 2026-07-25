/** Coerce API/socket payloads to a safe array (avoids .map on error objects). */
export function asArray(value) {
  return Array.isArray(value) ? value : []
}
