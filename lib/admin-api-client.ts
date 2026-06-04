import { auth } from "./firebase"

export class AdminApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "AdminApiError"
    this.status = status
  }
}

export type AdminFetchInit = Omit<RequestInit, "body"> & {
  body?: Record<string, unknown>
}

/** Authenticated fetch for admin API routes. */
export async function adminFetch(path: string, init?: AdminFetchInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    throw new AdminApiError("Not signed in", 401)
  }

  const token = await user.getIdToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init?.headers as Record<string, string> | undefined),
  }

  let body: BodyInit | undefined
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(init.body)
  }

  const { body: _b, ...rest } = init ?? {}
  return fetch(path, {
    ...rest,
    headers,
    body,
  })
}

export async function adminJson<T>(path: string, init?: AdminFetchInit): Promise<T> {
  const res = await adminFetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new AdminApiError(
      (data as { error?: string }).error || res.statusText || "Request failed",
      res.status
    )
  }
  return data as T
}
