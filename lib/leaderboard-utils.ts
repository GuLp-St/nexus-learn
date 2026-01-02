import { db } from "./firebase"
import { collection, query, getDocs, orderBy, limit, where, doc, getDoc } from "firebase/firestore"
import { getFriends } from "./friends-utils"

export interface LeaderboardUser {
  userId: string
  nickname: string
  xp: number
  rank: number
  challengeWins?: number
  avatarUrl?: string | null
  avatarFrame?: string | null
  avatarSeed?: string | null
}

/**
 * Get top N users by XP from the global leaderboard
 */
export async function getGlobalLeaderboard(limitCount: number = 10): Promise<LeaderboardUser[]> {
  try {
    const usersQuery = query(
      collection(db, "users"),
      orderBy("xp", "desc"),
      limit(limitCount)
    )

    const snapshot = await getDocs(usersQuery)
    const leaderboard: LeaderboardUser[] = []

    snapshot.docs.forEach((docSnap, index) => {
      const data = docSnap.data()
      leaderboard.push({
        userId: docSnap.id,
        nickname: data.nickname || "Anonymous",
        xp: data.xp || 0,
        rank: index + 1,
        challengeWins: data.challengeWins || 0,
        avatarUrl: data.avatarUrl || null,
        avatarFrame: data.cosmetics?.avatarFrame || null,
        avatarSeed: data.avatarSeed || data.cosmetics?.avatarSeed || null,
      })
    })

    return leaderboard
  } catch (error) {
    console.error("Error fetching global leaderboard:", error)
    return []
  }
}

/**
 * Get user's rank in the global leaderboard
 */
export async function getUserRank(userId: string): Promise<number | null> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return null
    }

    const userXP = userDoc.data().xp || 0

    // Count how many users have more XP than this user
    const usersQuery = query(
      collection(db, "users"),
      where("xp", ">", userXP),
      orderBy("xp", "desc")
    )

    const snapshot = await getDocs(usersQuery)
    const rank = snapshot.size + 1

    return rank
  } catch (error: any) {
    // If index doesn't exist, fallback to counting all users
    if (error.code === "failed-precondition") {
      try {
        // Get all users and count client-side
        const allUsersQuery = query(collection(db, "users"), orderBy("xp", "desc"), limit(1000))
        const snapshot = await getDocs(allUsersQuery)
        const userDoc = await getDoc(doc(db, "users", userId))

        if (!userDoc.exists()) {
          return null
        }

        const userXP = userDoc.data().xp || 0
        let rank = 1

        snapshot.forEach((docSnap) => {
          const xp = docSnap.data().xp || 0
          if (xp > userXP) {
            rank++
          }
        })

        return rank
      } catch (fallbackError) {
        console.error("Error calculating user rank (fallback):", fallbackError)
        return null
      }
    }

    console.error("Error fetching user rank:", error)
    return null
  }
}

/**
 * Get leaderboard with top N users, ensuring the current user is always included
 * If user is not in top N, replace the last entry with the user's entry
 */
export async function getLeaderboardWithUser(
  userId: string,
  limitCount: number = 10
): Promise<{ leaderboard: LeaderboardUser[]; userRank: number | null }> {
  try {
    // Get top N users
    const topUsers = await getGlobalLeaderboard(limitCount)

    // Get current user data
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return { leaderboard: topUsers, userRank: null }
    }

    const userData = userDoc.data()
    const userXP = userData.xp || 0
    const userNickname = userData.nickname || "Anonymous"
    const userChallengeWins = userData.challengeWins || 0
    const userAvatarUrl = userData.avatarUrl || null
    const userAvatarFrame = userData.cosmetics?.avatarFrame || null
    const userAvatarSeed = userData.avatarSeed || userData.cosmetics?.avatarSeed || null

    // Check if user is already in top N
    const userInTop = topUsers.findIndex((u) => u.userId === userId) !== -1

    let finalLeaderboard = [...topUsers]

    if (!userInTop) {
      // Get user's rank
      const userRank = await getUserRank(userId)

      // Replace last entry with user's entry
      if (finalLeaderboard.length >= limitCount) {
        finalLeaderboard[limitCount - 1] = {
          userId,
          nickname: userNickname,
          xp: userXP,
          rank: userRank || limitCount + 1,
          challengeWins: userChallengeWins,
          avatarUrl: userAvatarUrl,
          avatarFrame: userAvatarFrame,
          avatarSeed: userAvatarSeed,
        }
      } else {
        // If top N has fewer than limit users, just add the user
        finalLeaderboard.push({
          userId,
          nickname: userNickname,
          xp: userXP,
          rank: userRank || finalLeaderboard.length + 1,
          challengeWins: userChallengeWins,
          avatarUrl: userAvatarUrl,
          avatarFrame: userAvatarFrame,
          avatarSeed: userAvatarSeed,
        })
      }

      // Re-sort by XP descending
      finalLeaderboard.sort((a, b) => b.xp - a.xp)

      // Update ranks
      finalLeaderboard.forEach((user, index) => {
        user.rank = index + 1
      })
    }

    const userRank = await getUserRank(userId)

    return {
      leaderboard: finalLeaderboard,
      userRank,
    }
  } catch (error) {
    console.error("Error fetching leaderboard with user:", error)
    return { leaderboard: [], userRank: null }
  }
}

/**
 * Get friends-only leaderboard for a user
 */
export async function getFriendsLeaderboard(
  userId: string,
  limitCount: number = 10
): Promise<{ leaderboard: LeaderboardUser[]; userRank: number | null }> {
  try {
    // Get user's friends
    const friends = await getFriends(userId)
    
    // Add current user to the list
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    
    if (!userDoc.exists()) {
      return { leaderboard: [], userRank: null }
    }
    
    const userData = userDoc.data()
    const userXP = userData.xp || 0
    const userNickname = userData.nickname || "Anonymous"
    const userAvatarUrl = userData.avatarUrl || null
    const userAvatarFrame = userData.cosmetics?.avatarFrame || null
    const userAvatarSeed = userData.avatarSeed || userData.cosmetics?.avatarSeed || null
    
    // Get challenge wins for user and friends
    const userChallengeWins = userData.challengeWins || 0
    
    // Fetch challenge wins and avatars for friends
    const friendsWithWins = await Promise.all(
      friends.map(async (friend) => {
        const friendRef = doc(db, "users", friend.userId)
        const friendDoc = await getDoc(friendRef)
        const friendData = friendDoc.exists() ? friendDoc.data() : {}
        const friendChallengeWins = friendData.challengeWins || 0
        const friendAvatarUrl = friendData.avatarUrl || null
        const friendAvatarFrame = friendData.cosmetics?.avatarFrame || null
        const friendAvatarSeed = friendData.avatarSeed || friendData.cosmetics?.avatarSeed || null
        
        return {
          userId: friend.userId,
          nickname: friend.nickname,
          xp: friend.xp,
          rank: 0, // Will be set after sorting
          challengeWins: friendChallengeWins,
          avatarUrl: friendAvatarUrl,
          avatarFrame: friendAvatarFrame,
          avatarSeed: friendAvatarSeed,
        }
      })
    )
    
    // Build leaderboard with user and their friends
    const leaderboard: LeaderboardUser[] = [
      {
        userId,
        nickname: userNickname,
        xp: userXP,
        rank: 0, // Will be set after sorting
        challengeWins: userChallengeWins,
        avatarUrl: userAvatarUrl,
        avatarFrame: userAvatarFrame,
        avatarSeed: userAvatarSeed,
      },
      ...friendsWithWins,
    ]
    
    // Sort by XP descending
    leaderboard.sort((a, b) => b.xp - a.xp)
    
    // Update ranks
    leaderboard.forEach((user, index) => {
      user.rank = index + 1
    })
    
    // Limit to top N
    const limitedLeaderboard = leaderboard.slice(0, limitCount)
    
    // Find user's rank
    const userRank = leaderboard.findIndex((u) => u.userId === userId) + 1
    
    return {
      leaderboard: limitedLeaderboard,
      userRank: userRank > 0 ? userRank : null,
    }
  } catch (error) {
    console.error("Error fetching friends leaderboard:", error)
    return { leaderboard: [], userRank: null }
  }
}

/**
 * Get user's XP and basic stats
 */
export async function getUserXP(userId: string): Promise<{
  xp: number
  dailyLoginStreak?: number
} | null> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return null
    }

    const data = userDoc.data()
    return {
      xp: data.xp || 0,
      dailyLoginStreak: data.dailyLoginStreak || 0,
    }
  } catch (error) {
    console.error("Error fetching user XP:", error)
    return null
  }
}

