/**
 * Tracks overlapping user-visible loads so invalidation does not leave loading stuck.
 */
export function createVisibleLoadTracker() {
  let count = 0

  return {
    begin(): void {
      count += 1
    },
    end(): boolean {
      count -= 1
      if (count <= 0) {
        count = 0
        return true
      }
      return false
    },
    settle(): void {
      count = 0
    },
    reset(): void {
      count = 0
    },
  }
}
