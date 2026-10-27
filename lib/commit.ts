/** L’écriture confirme, ou le brouillon reste disponible. Aucun succès n’est annoncé ici. */
export async function commitWrite<T>(draft: T, write: (value: T) => Promise<void>): Promise<{ saved: boolean; draft: T }> {
  try {
    await write(draft);
    return { saved: true, draft };
  } catch {
    return { saved: false, draft };
  }
}
