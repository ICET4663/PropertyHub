// Web: no push. The browser gets the same notifications in the in-app feed through Realtime.
// The phone version is push.native.ts.

/** The screen a notification opens: the `link` stored on the notification row. */
export interface PushLink { name: string; params?: Record<string, string> }

export async function registerPush(): Promise<void> {}

export async function unregisterPush(): Promise<void> {}

export function onPushOpened(_open: (link: PushLink | null, notificationId: string | null) => void): () => void {
  return () => {};
}
