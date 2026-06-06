"use client"

import { useCallback, useEffect, useState } from "react"
import { Key, Plus, Trash2, Activity, Cloud, FlaskConical, CheckCircle2, XCircle } from "lucide-react"
import SidebarNav from "@/components/sidebar-nav"
import { AdminGuard } from "@/components/admin/admin-guard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { adminJson } from "@/lib/admin-api-client"
import { toast } from "sonner"

type KeyStat = {
  index: number
  masked: string
  note?: string
  todayRequests: number
  todayRateLimits: number
}

type CloudflareStat = {
  index: number
  maskedAccountId: string
  maskedToken: string
  note?: string
  todayRequests: number
  todayRateLimits: number
}

type KeysResponse = {
  gemini: {
    keys: KeyStat[]
    model: string | null
    envFallback: boolean
    source: string
  }
  cloudflare: {
    accounts: CloudflareStat[]
    imageModel: string | null
    imageModelFallback: string | null
    envFallback: boolean
    source: string
  }
}

type TestResult = {
  ok: boolean
  message: string
  detail?: string
  model?: string
}

type TestStatus = "idle" | "testing" | "passed" | "failed"

export default function AdminKeysPage() {
  const [data, setData] = useState<KeysResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [newGeminiKey, setNewGeminiKey] = useState("")
  const [geminiModel, setGeminiModel] = useState("")
  const [cfAccountId, setCfAccountId] = useState("")
  const [cfApiToken, setCfApiToken] = useState("")
  const [cfNote, setCfNote] = useState("")
  const [cfImageModel, setCfImageModel] = useState("")
  const [cfImageModelFallback, setCfImageModelFallback] = useState("")
  const [adding, setAdding] = useState(false)
  const [savingGeminiModel, setSavingGeminiModel] = useState(false)
  const [savingCfModels, setSavingCfModels] = useState(false)

  const [geminiNewTest, setGeminiNewTest] = useState<TestStatus>("idle")
  const [geminiNewTestMsg, setGeminiNewTestMsg] = useState<string | null>(null)
  const [cfNewTest, setCfNewTest] = useState<TestStatus>("idle")
  const [cfNewTestMsg, setCfNewTestMsg] = useState<string | null>(null)
  const [cfModelTest, setCfModelTest] = useState<TestStatus>("idle")
  const [cfModelTestMsg, setCfModelTestMsg] = useState<string | null>(null)
  const [testingIndex, setTestingIndex] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminJson<KeysResponse>("/api/admin/keys")
      setData(res)
      setGeminiModel(res.gemini.model ?? "")
      setCfImageModel(res.cloudflare.imageModel ?? "")
      setCfImageModelFallback(res.cloudflare.imageModelFallback ?? "")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load keys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setGeminiNewTest("idle")
    setGeminiNewTestMsg(null)
  }, [newGeminiKey, geminiModel])

  useEffect(() => {
    setCfNewTest("idle")
    setCfNewTestMsg(null)
  }, [cfAccountId, cfApiToken])

  useEffect(() => {
    setCfModelTest("idle")
    setCfModelTestMsg(null)
  }, [cfImageModel, cfImageModelFallback])

  const runTest = (body: Record<string, unknown>) =>
    adminJson<TestResult>("/api/admin/keys/test", { method: "POST", body })

  const testNewGeminiKey = async () => {
    if (!newGeminiKey.trim()) {
      toast.error("Enter a key to test")
      return
    }
    setGeminiNewTest("testing")
    setGeminiNewTestMsg(null)
    try {
      const result = await runTest({
        provider: "gemini",
        key: newGeminiKey.trim(),
        model: geminiModel.trim() || undefined,
      })
      if (result.ok) {
        setGeminiNewTest("passed")
        setGeminiNewTestMsg(result.detail ? `${result.message} — ${result.detail}` : result.message)
        toast.success(result.message)
      } else {
        setGeminiNewTest("failed")
        setGeminiNewTestMsg(result.detail ?? result.message)
        toast.error(result.message)
      }
    } catch (e) {
      setGeminiNewTest("failed")
      setGeminiNewTestMsg(e instanceof Error ? e.message : "Test failed")
      toast.error(e instanceof Error ? e.message : "Test failed")
    }
  }

  const testStoredGeminiKey = async (index: number) => {
    setTestingIndex(`gemini-${index}`)
    try {
      const result = await runTest({
        provider: "gemini",
        index,
        model: geminiModel.trim() || undefined,
      })
      if (result.ok) toast.success(result.message)
      else toast.error(result.detail ?? result.message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed")
    } finally {
      setTestingIndex(null)
    }
  }

  const testNewCloudflareCredential = async () => {
    if (!cfAccountId.trim() || !cfApiToken.trim()) {
      toast.error("Enter account ID and API token")
      return
    }
    setCfNewTest("testing")
    setCfNewTestMsg(null)
    try {
      const result = await runTest({
        provider: "cloudflare",
        accountId: cfAccountId.trim(),
        apiToken: cfApiToken.trim(),
      })
      if (result.ok) {
        setCfNewTest("passed")
        setCfNewTestMsg(result.detail ? `${result.message} — ${result.detail}` : result.message)
        toast.success(result.message)
      } else {
        setCfNewTest("failed")
        setCfNewTestMsg(result.detail ?? result.message)
        toast.error(result.message)
      }
    } catch (e) {
      setCfNewTest("failed")
      setCfNewTestMsg(e instanceof Error ? e.message : "Test failed")
      toast.error(e instanceof Error ? e.message : "Test failed")
    }
  }

  const testStoredCloudflareCredential = async (index: number) => {
    setTestingIndex(`cf-${index}`)
    try {
      const result = await runTest({ provider: "cloudflare", index })
      if (result.ok) toast.success(result.message)
      else toast.error(result.detail ?? result.message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed")
    } finally {
      setTestingIndex(null)
    }
  }

  const testCloudflareImageModel = async () => {
    if (!cfImageModel.trim()) {
      toast.error("Enter an image model id first")
      return
    }
    const accountIndex = data?.cloudflare.accounts[0]?.index
    if (accountIndex === undefined && !cfAccountId.trim()) {
      toast.error("Add a Cloudflare credential or enter account + token below to test the model")
      return
    }
    setCfModelTest("testing")
    setCfModelTestMsg(null)
    try {
      const body: Record<string, unknown> = {
        provider: "cloudflare",
        testImageModel: true,
        imageModel: cfImageModel.trim(),
      }
      if (accountIndex !== undefined) {
        body.index = accountIndex
      } else {
        body.accountId = cfAccountId.trim()
        body.apiToken = cfApiToken.trim()
      }
      const result = await runTest(body)
      if (result.ok) {
        setCfModelTest("passed")
        setCfModelTestMsg(result.detail ? `${result.message} — ${result.detail}` : result.message)
        toast.success(result.message)
      } else {
        setCfModelTest("failed")
        setCfModelTestMsg(result.detail ?? result.message)
        toast.error(result.message)
      }
    } catch (e) {
      setCfModelTest("failed")
      setCfModelTestMsg(e instanceof Error ? e.message : "Test failed")
      toast.error(e instanceof Error ? e.message : "Test failed")
    }
  }

  const testGeminiModel = async () => {
    if (!data?.gemini.keys.length) {
      toast.error("Add at least one Gemini key first, or test while adding a new key")
      return
    }
    setTestingIndex("gemini-model")
    try {
      const result = await runTest({
        provider: "gemini",
        index: 0,
        model: geminiModel.trim() || undefined,
      })
      if (result.ok) toast.success(`Model OK: ${result.model ?? geminiModel}`)
      else toast.error(result.detail ?? result.message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed")
    } finally {
      setTestingIndex(null)
    }
  }

  const addGeminiKey = async () => {
    if (!newGeminiKey.trim()) return
    if (geminiNewTest !== "passed") {
      toast.error("Test the key successfully before adding")
      return
    }
    setAdding(true)
    try {
      await adminJson("/api/admin/keys", {
        method: "POST",
        body: { provider: "gemini", key: newGeminiKey.trim() },
      })
      setNewGeminiKey("")
      setGeminiNewTest("idle")
      setGeminiNewTestMsg(null)
      toast.success("Gemini key added")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add key")
    } finally {
      setAdding(false)
    }
  }

  const addCloudflareCredential = async () => {
    if (!cfAccountId.trim() || !cfApiToken.trim()) return
    if (cfNewTest !== "passed") {
      toast.error("Test the credential successfully before adding")
      return
    }
    setAdding(true)
    try {
      await adminJson("/api/admin/keys", {
        method: "POST",
        body: {
          provider: "cloudflare",
          accountId: cfAccountId.trim(),
          apiToken: cfApiToken.trim(),
          note: cfNote.trim(),
        },
      })
      setCfAccountId("")
      setCfApiToken("")
      setCfNote("")
      setCfNewTest("idle")
      setCfNewTestMsg(null)
      toast.success("Cloudflare credential added")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add credential")
    } finally {
      setAdding(false)
    }
  }

  const saveGeminiNote = async (index: number, note: string) => {
    try {
      await adminJson("/api/admin/keys", {
        method: "PATCH",
        body: { provider: "gemini", index, note },
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note")
    }
  }

  const saveCloudflareNote = async (index: number, note: string) => {
    try {
      await adminJson("/api/admin/keys", {
        method: "PATCH",
        body: { provider: "cloudflare", index, note },
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note")
    }
  }

  const removeGeminiKey = async (index: number) => {
    try {
      await adminJson(`/api/admin/keys?provider=gemini&index=${index}`, {
        method: "DELETE",
      })
      toast.success("Gemini key removed")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove key")
    }
  }

  const removeCloudflareCredential = async (index: number) => {
    try {
      await adminJson(`/api/admin/keys?provider=cloudflare&index=${index}`, {
        method: "DELETE",
      })
      toast.success("Cloudflare credential removed")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove credential")
    }
  }

  const saveGeminiModel = async () => {
    setSavingGeminiModel(true)
    try {
      await adminJson("/api/admin/keys", {
        method: "PATCH",
        body: { provider: "gemini", geminiModel },
      })
      toast.success("Gemini model saved")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save model")
    } finally {
      setSavingGeminiModel(false)
    }
  }

  const saveCloudflareModels = async () => {
    setSavingCfModels(true)
    try {
      await adminJson("/api/admin/keys", {
        method: "PATCH",
        body: {
          provider: "cloudflare",
          cloudflareImageModel: cfImageModel,
          cloudflareImageModelFallback: cfImageModelFallback,
        },
      })
      toast.success("Cloudflare models updated")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save models")
    } finally {
      setSavingCfModels(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const TestStatusLine = ({
    status,
    message,
  }: {
    status: TestStatus
    message: string | null
  }) => {
    if (status === "idle" && !message) return null
    return (
      <p
        className={`text-xs flex items-start gap-1.5 ${
          status === "passed"
            ? "text-green-600 dark:text-green-400"
            : status === "failed"
              ? "text-destructive"
              : "text-muted-foreground"
        }`}
      >
        {status === "passed" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        {status === "failed" && <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        {status === "testing" && <FlaskConical className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-pulse" />}
        <span>{message ?? (status === "testing" ? "Testing…" : "")}</span>
      </p>
    )
  }

  const UsageBadges = ({
    requests,
    rateLimits,
  }: {
    requests: number
    rateLimits: number
  }) => (
    <div className="flex flex-wrap gap-2 mt-1.5">
      <Badge variant="secondary" className="text-xs">
        <Activity className="h-3 w-3 mr-1" />
        {requests} req today
      </Badge>
      {rateLimits > 0 && (
        <Badge variant="destructive" className="text-xs">
          {rateLimits} rate limits
        </Badge>
      )}
    </div>
  )

  return (
    <AdminGuard>
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav currentPath="/admin/keys" title="Admin — Keys" />
        <main className="flex-1 min-w-0 overflow-auto p-4 lg:p-8">
          <div className="mx-auto w-full max-w-2xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Test credentials before saving. Manage models in Firestore{" "}
                <code className="text-xs">config/ai</code>.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Gemini keys
                </CardTitle>
                <CardDescription>
                  {loading
                    ? "Loading…"
                    : data
                      ? `Source: ${data.gemini.source}`
                      : ""}
                  {data?.gemini.envFallback && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      Env fallback when Firestore list is empty.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                  <Label htmlFor="gemini-model">Gemini model</Label>
                  <Input
                    id="gemini-model"
                    placeholder="e.g. gemini-2.0-flash"
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testGeminiModel}
                      disabled={
                        !!testingIndex ||
                        !geminiModel.trim() ||
                        !data?.gemini.keys.length
                      }
                    >
                      <FlaskConical className="h-3.5 w-3.5 mr-1" />
                      Test model (1st key)
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={saveGeminiModel}
                      disabled={savingGeminiModel}
                    >
                      Save model
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for all Gemini calls. New keys are tested against this model.
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Today ({today}): request counts per pooled call.
                </p>

                {data?.gemini.keys.map((k) => (
                  <div
                    key={k.index}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm">{k.masked}</p>
                      <UsageBadges
                        requests={k.todayRequests}
                        rateLimits={k.todayRateLimits}
                      />
                      <Input
                        placeholder="Admin note (optional)"
                        defaultValue={k.note ?? ""}
                        className="mt-2 h-8 text-xs"
                        onBlur={(e) => {
                          if (e.target.value !== (k.note ?? "")) {
                            saveGeminiNote(k.index, e.target.value)
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-1 shrink-0 self-end sm:self-start">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        title="Test stored key"
                        disabled={testingIndex !== null}
                        onClick={() => testStoredGeminiKey(k.index)}
                      >
                        <FlaskConical className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => removeGeminiKey(k.index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {!loading && data && data.gemini.keys.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No Gemini keys in Firestore.
                  </p>
                )}

                <div className="pt-4 border-t border-border space-y-2">
                  <Label htmlFor="new-gemini-key">Add Gemini key</Label>
                  <p className="text-xs text-muted-foreground">
                    Test the key first — Add stays disabled until the test passes.
                  </p>
                  <Input
                    id="new-gemini-key"
                    type="password"
                    placeholder="AIza…"
                    value={newGeminiKey}
                    onChange={(e) => setNewGeminiKey(e.target.value)}
                    className="font-mono"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={testNewGeminiKey}
                      disabled={geminiNewTest === "testing" || !newGeminiKey.trim()}
                    >
                      <FlaskConical className="h-4 w-4 mr-2" />
                      {geminiNewTest === "testing" ? "Testing…" : "Test key"}
                    </Button>
                    <Button
                      onClick={addGeminiKey}
                      disabled={
                        adding ||
                        !newGeminiKey.trim() ||
                        geminiNewTest !== "passed"
                      }
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                  <TestStatusLine status={geminiNewTest} message={geminiNewTestMsg} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Cloud className="h-5 w-5" />
                  Cloudflare Workers AI
                </CardTitle>
                <CardDescription>
                  {loading ? "Loading…" : data ? `Source: ${data.cloudflare.source}` : ""}
                  {data?.cloudflare.envFallback && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      Env fallback when Firestore list is empty.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Today ({today}): usage per credential. Test verifies token + account access.
                </p>

                {data?.cloudflare.accounts.map((acc) => (
                  <div
                    key={acc.index}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm">Account: {acc.maskedAccountId}</p>
                      <p className="font-mono text-xs text-muted-foreground mt-0.5">
                        Token: {acc.maskedToken}
                      </p>
                      <UsageBadges
                        requests={acc.todayRequests}
                        rateLimits={acc.todayRateLimits}
                      />
                      <Input
                        placeholder="Admin note (optional)"
                        defaultValue={acc.note ?? ""}
                        className="mt-2 h-8 text-xs"
                        onBlur={(e) => {
                          if (e.target.value !== (acc.note ?? "")) {
                            saveCloudflareNote(acc.index, e.target.value)
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-1 shrink-0 self-end sm:self-start">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        title="Test credential"
                        disabled={testingIndex !== null}
                        onClick={() => testStoredCloudflareCredential(acc.index)}
                      >
                        <FlaskConical className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => removeCloudflareCredential(acc.index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {!loading && data && data.cloudflare.accounts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No Cloudflare credentials in Firestore.
                  </p>
                )}

                <div className="pt-4 border-t border-border space-y-3">
                  <Label>Add Cloudflare credential</Label>
                  <p className="text-xs text-muted-foreground">
                    Test account + token before adding.
                  </p>
                  <Input
                    placeholder="Account ID"
                    value={cfAccountId}
                    onChange={(e) => setCfAccountId(e.target.value)}
                    className="font-mono"
                  />
                  <Input
                    type="password"
                    placeholder="API token"
                    value={cfApiToken}
                    onChange={(e) => setCfApiToken(e.target.value)}
                    className="font-mono"
                  />
                  <Input
                    placeholder="Admin note (optional)"
                    value={cfNote}
                    onChange={(e) => setCfNote(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={testNewCloudflareCredential}
                      disabled={
                        cfNewTest === "testing" ||
                        !cfAccountId.trim() ||
                        !cfApiToken.trim()
                      }
                    >
                      <FlaskConical className="h-4 w-4 mr-2" />
                      {cfNewTest === "testing" ? "Testing…" : "Test credential"}
                    </Button>
                    <Button
                      onClick={addCloudflareCredential}
                      disabled={
                        adding ||
                        !cfAccountId.trim() ||
                        !cfApiToken.trim() ||
                        cfNewTest !== "passed"
                      }
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                  <TestStatusLine status={cfNewTest} message={cfNewTestMsg} />
                </div>

                <div className="pt-4 border-t border-border space-y-3">
                  <Label>Image models</Label>
                  <p className="text-xs text-muted-foreground">
                    Test runs a tiny image generation against the first stored credential (or the
                    account/token fields above if none saved yet).
                  </p>
                  <Input
                    placeholder="e.g. @cf/black-forest-labs/flux-1-schnell"
                    value={cfImageModel}
                    onChange={(e) => setCfImageModel(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Input
                    placeholder="Fallback model (optional)"
                    value={cfImageModelFallback}
                    onChange={(e) => setCfImageModelFallback(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testCloudflareImageModel}
                      disabled={
                        cfModelTest === "testing" ||
                        !cfImageModel.trim() ||
                        (data?.cloudflare.accounts.length === 0 &&
                          (!cfAccountId.trim() || !cfApiToken.trim()))
                      }
                    >
                      <FlaskConical className="h-3.5 w-3.5 mr-1" />
                      {cfModelTest === "testing" ? "Testing…" : "Test model"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={saveCloudflareModels}
                      disabled={savingCfModels}
                    >
                      Save model settings
                    </Button>
                  </div>
                  <TestStatusLine status={cfModelTest} message={cfModelTestMsg} />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}
