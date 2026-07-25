/**
 * API origin for fetch/axios/socket.
 * Empty string = same origin (Vite proxy in dev, Express in production).
 * Set VITE_API_URL only when the API lives on a different host.
 */
export const API_BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
