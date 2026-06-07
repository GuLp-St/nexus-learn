import { doc, onSnapshot } from "firebase/firestore"
import { db } from "./firebase"
import {
  createQuizPrepJob,
  findActiveQuizPrepJob,
  type QuizPrepJob,
  type QuizPrepKind,
} from "./quiz-prep-job"

export async function startQuizPrepInBackground(
  userId: string,
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null,
  courseTitle: string,
  idToken: string
): Promise<string> {
  let job = await findActiveQuizPrepJob(userId, courseId, kind, moduleIndex)
  if (!job || job.status === "failed") {
    const jobId = await createQuizPrepJob(userId, courseId, kind, moduleIndex, courseTitle)
    job = { id: jobId, userId, courseId, kind, moduleIndex, status: "pending" }
  }

  if (job.status === "pending") {
    void fetch("/api/quiz-prep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userId, jobId: job.id }),
    }).catch((err) => console.error("Quiz prep API error:", err))
  }

  return job.id
}

export function subscribeToQuizPrepJob(
  jobId: string,
  onUpdate: (job: QuizPrepJob | null) => void
): () => void {
  return onSnapshot(doc(db, "quizPrepJobs", jobId), (snap) => {
    if (!snap.exists()) {
      onUpdate(null)
      return
    }
    onUpdate({ id: snap.id, ...snap.data() } as QuizPrepJob)
  })
}
