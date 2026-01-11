/**
 * Fetches a relevant image from Unsplash based on provided tags or topic.
 * Falls back to a default education image if no match is found.
 */
export async function getUnsplashImageByTags(tags: string[] = [], topic: string = ""): Promise<string> {
  const accessKey = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY
  
  if (!accessKey) {
    console.warn("Unsplash Access Key is missing. Falling back to default images.")
    return `https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800`
  }

  const query = tags.length > 0 ? tags.join(" ") : topic || "education"
  
  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.regular
    }

    // Fallback to a generic educational image if no results
    return `https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800`
  } catch (error) {
    console.error("Error fetching Unsplash image:", error)
    return `https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800`
  }
}
