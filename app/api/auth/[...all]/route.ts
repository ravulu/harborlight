import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

// Catch-all so every /api/auth/* path (sign-up/email, sign-in/email, session,
// sign-out, ...) reaches Better Auth. A plain app/api/route.ts only serves
// exactly /api, which 404s every one of them.
export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(auth.handler)
