/**
 * Stale Detection Helper
 * 
 * Checks if a document version is stale relative to the current resolver hash.
 */

export interface DocVersionDependency {
  depends_on?: string[];
  depends_on_resolver_hash?: string | null;
}

/**
 * Returns true if the document version was generated with a different resolver hash
 * than the current one (meaning canonical qualifications have changed).
 *
 * concept_brief is derived from the idea that generated it — not from the qualification set.
 * It should never be flagged stale due to qualification changes.
 */
export function isDocStale(
  docVersion: DocVersionDependency | null | undefined,
  currentResolverHash: string | null | undefined,
  docType?: string
): boolean {
  if (!docVersion) return false;
  if (!docVersion.depends_on_resolver_hash) return false; // no hash tracked = can't determine staleness
  if (!currentResolverHash) return false; // no current hash = can't compare
  // concept_brief is a child of the originating idea — qualification changes do not affect it
  if (docType === 'concept_brief') return false;
  return docVersion.depends_on_resolver_hash !== currentResolverHash;
}
