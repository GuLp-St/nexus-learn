import { GoogleGenerativeAI } from "@google/generative-ai"

const GEMINI_TEST_PROMPT = 'Reply with exactly the word "OK" and nothing else.'

export type KeyTestResult = {
  ok: boolean
  message: string
  detail?: string
}

export async function testGeminiKey(
  apiKey: string,
  modelName: string
): Promise<KeyTestResult> {
  const key = apiKey.trim()
  const model = modelName.trim()
  if (!key) {
    return { ok: false, message: "API key is empty" }
  }
  if (!model) {
    return { ok: false, message: "Model name is required" }
  }

  try {
    const client = new GoogleGenerativeAI(key)
    const generativeModel = client.getGenerativeModel({ model })
    const result = await generativeModel.generateContent(GEMINI_TEST_PROMPT)
    const text = result.response.text()?.trim() ?? ""

    if (!text) {
      return {
        ok: false,
        message: "Model returned an empty response",
        detail: "Key may be valid but the model did not respond with text.",
      }
    }

    return {
      ok: true,
      message: `Key and model "${model}" work`,
      detail: text.length > 80 ? `${text.slice(0, 80)}…` : text,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (/api.?key|invalid|permission|403|401/i.test(msg)) {
      return { ok: false, message: "Invalid or unauthorized API key", detail: msg }
    }
    if (/not found|404|model/i.test(msg)) {
      return {
        ok: false,
        message: `Model "${model}" not available for this key`,
        detail: msg,
      }
    }
    if (/429|quota|rate/i.test(msg)) {
      return {
        ok: true,
        message: "Key is valid (rate limited right now)",
        detail: msg,
      }
    }
    return { ok: false, message: "Gemini test failed", detail: msg }
  }
}

export async function testCloudflareCredential(
  accountId: string,
  apiToken: string,
  imageModel?: string
): Promise<KeyTestResult> {
  const account = accountId.trim()
  const token = apiToken.trim()
  if (!account || !token) {
    return { ok: false, message: "Account ID and API token are required" }
  }

  try {
    const verifyRes = await fetch(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    const verifyJson = (await verifyRes.json()) as {
      success?: boolean
      errors?: Array<{ message?: string }>
      result?: { status?: string }
    }

    if (!verifyRes.ok || !verifyJson.success) {
      const errMsg =
        verifyJson.errors?.[0]?.message ??
        `Token verify HTTP ${verifyRes.status}`
      return { ok: false, message: "Invalid Cloudflare API token", detail: errMsg }
    }

    const accountRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    const accountJson = (await accountRes.json()) as {
      success?: boolean
      errors?: Array<{ message?: string }>
    }

    if (!accountRes.ok || !accountJson.success) {
      const errMsg =
        accountJson.errors?.[0]?.message ??
        `Account check HTTP ${accountRes.status}`
      return {
        ok: false,
        message: "Token valid but cannot access this account ID",
        detail: errMsg,
      }
    }

    if (imageModel?.trim()) {
      const model = imageModel.trim()

      if (model.startsWith("google/")) {
        const runRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: {
                prompt: "solid blue",
                aspect_ratio: "1:1",
                output_format: "png",
              },
            }),
            signal: AbortSignal.timeout(45_000),
          }
        )

        if (!runRes.ok) {
          const errText = await runRes.text()
          if (runRes.status === 429) {
            return {
              ok: true,
              message: "Credential valid; image model rate limited",
              detail: errText.slice(0, 200),
            }
          }
          return {
            ok: false,
            message: `Image model "${model}" failed`,
            detail: errText.slice(0, 300),
          }
        }
        return {
          ok: true,
          message: `Credential and model "${model}" work`,
        }
      }

      const runRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: "solid blue",
            width: 64,
            height: 64,
          }),
          signal: AbortSignal.timeout(45_000),
        }
      )

      if (!runRes.ok) {
        const errText = await runRes.text()
        if (runRes.status === 429) {
          return {
            ok: true,
            message: "Credential valid; image model rate limited",
            detail: errText.slice(0, 200),
          }
        }
        return {
          ok: false,
          message: `Image model "${model}" failed`,
          detail: errText.slice(0, 300),
        }
      }
      return {
        ok: true,
        message: `Credential and model "${model}" work`,
      }
    }

    return {
      ok: true,
      message: "Cloudflare token and account ID are valid",
      detail: verifyJson.result?.status,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, message: "Cloudflare test failed", detail: msg }
  }
}
