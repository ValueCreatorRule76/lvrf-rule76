/** B2 (Brad, 4 Nov 2026): an evidence row's short id, for pickers and confirmations. */
export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '');
