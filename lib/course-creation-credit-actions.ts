"use server"



import { FieldValue } from "firebase-admin/firestore"

import { getAdminFirestore } from "./firebase-admin"

import { getUserNexonAdmin, spendNexonAdmin } from "./nexon-admin"

import { COURSE_GENERATION_NEXON_COST } from "./course-constants"



import {

  creditsFromUser,

  type CourseCreationCredits,

  type CreationCreditType,

} from "./course-creation-credits-shared"



export type { CreationCreditType, CourseCreationCredits }



export async function getCourseCreationCredits(

  userId: string

): Promise<CourseCreationCredits> {

  const userDoc = await getAdminFirestore().collection("users").doc(userId).get()

  if (!userDoc.exists) {

    return { upload: false, ai: false }

  }

  return creditsFromUser(userDoc.data())

}



/**

 * Pay for upload course creation (analysis + processing). Idempotent while credit is active.

 */

export async function purchaseUploadCreationCredit(userId: string): Promise<{

  ok: boolean

  alreadyPaid: boolean

  balance?: number

  error?: string

}> {

  try {

    const credits = await getCourseCreationCredits(userId)

    if (credits.upload) {

      const balance = await getUserNexonAdmin(userId)

      return { ok: true, alreadyPaid: true, balance }

    }



    const balance = await getUserNexonAdmin(userId)

    if (balance < COURSE_GENERATION_NEXON_COST) {

      return {

        ok: false,

        alreadyPaid: false,

        balance,

        error: `You need ${COURSE_GENERATION_NEXON_COST} Nexon. You have ${balance}.`,

      }

    }



    await spendNexonAdmin(

      userId,

      COURSE_GENERATION_NEXON_COST,

      "Upload course creation (materials analysis)"

    )



    await getAdminFirestore().collection("users").doc(userId).update({

      "courseCreationCredits.upload": true,

      updatedAt: FieldValue.serverTimestamp(),

    })



    const newBalance = await getUserNexonAdmin(userId)

    return { ok: true, alreadyPaid: false, balance: newBalance }

  } catch (err: unknown) {

    return {

      ok: false,

      alreadyPaid: false,

      error: err instanceof Error ? err.message : "Payment failed",

    }

  }

}



/**

 * Pay when generating an AI topic course (after difficulty is chosen). Idempotent while credit is active.

 */

export async function purchaseAiCreationCredit(userId: string): Promise<{

  ok: boolean

  alreadyPaid: boolean

  balance?: number

  error?: string

}> {

  try {

    const credits = await getCourseCreationCredits(userId)

    if (credits.ai) {

      const balance = await getUserNexonAdmin(userId)

      return { ok: true, alreadyPaid: true, balance }

    }



    const balance = await getUserNexonAdmin(userId)

    if (balance < COURSE_GENERATION_NEXON_COST) {

      return {

        ok: false,

        alreadyPaid: false,

        balance,

        error: `You need ${COURSE_GENERATION_NEXON_COST} Nexon. You have ${balance}.`,

      }

    }



    await spendNexonAdmin(userId, COURSE_GENERATION_NEXON_COST, "AI topic course generation")



    await getAdminFirestore().collection("users").doc(userId).update({

      "courseCreationCredits.ai": true,

      updatedAt: FieldValue.serverTimestamp(),

    })



    const newBalance = await getUserNexonAdmin(userId)

    return { ok: true, alreadyPaid: false, balance: newBalance }

  } catch (err: unknown) {

    return {

      ok: false,

      alreadyPaid: false,

      error: err instanceof Error ? err.message : "Payment failed",

    }

  }

}



export async function consumeCreationCredit(

  userId: string,

  type: CreationCreditType

): Promise<void> {

  await getAdminFirestore().collection("users").doc(userId).update({

    [`courseCreationCredits.${type}`]: false,

    updatedAt: FieldValue.serverTimestamp(),

  })

}

