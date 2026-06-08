const CHALLENGES_KEY = "nexus-seen-challenge-ids"
const REQUESTS_KEY = "nexus-seen-friend-request-ids"

function readSet(key: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function writeSet(key: string, ids: Set<string>): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(key, JSON.stringify([...ids]))
  window.dispatchEvent(new Event("nexus-social-seen-updated"))
}

export function getSeenChallengeIds(): Set<string> {
  return readSet(CHALLENGES_KEY)
}

export function markChallengesSeen(challengeIds: string[]): void {
  if (!challengeIds.length) return
  const seen = getSeenChallengeIds()
  challengeIds.forEach((id) => seen.add(id))
  writeSet(CHALLENGES_KEY, seen)
}

export function getSeenFriendRequestIds(): Set<string> {
  return readSet(REQUESTS_KEY)
}

export function markFriendRequestsSeen(senderIds: string[]): void {
  if (!senderIds.length) return
  const seen = getSeenFriendRequestIds()
  senderIds.forEach((id) => seen.add(id))
  writeSet(REQUESTS_KEY, seen)
}
