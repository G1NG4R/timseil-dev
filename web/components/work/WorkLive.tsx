import { WorkList } from "@/components/work/WorkList";
import { systemsNow } from "@/lib/api/readers";
import type { PostMeta } from "@/lib/content/posts";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The answered half of `/work`.
 *
 * THE WHOLE FILE IS ONE `await`, and that is ADR 0044's split rather than a
 * thin wrapper: the component above knows how to draw a list and nothing about
 * where one comes from, and this one knows where and nothing about drawing. It
 * is what lets `/dev/components` render the real section with no api in the
 * process at all, which is the only place the rig can see a row.
 *
 * `systemsNow` AND NOT `systemsCached`. That one throws so a failure is never
 * stored; this one calls `connection()` first — without it the values would
 * bake into the static shell during `docker build`, where no `api:8080` exists
 * — and answers `null` when the api does not. lib/api/readers.ts carries both
 * arguments in full.
 *
 * NO NEW READER AND NO NEW CACHE PROFILE. `/api/systems` has had both since
 * G4, and SYS.02 reads the same endpoint through the same `systemList`
 * lifetime. Two readers for one endpoint would be two answers for one question.
 *
 * THE POSTS ARE NOT READ HERE. They come from the page, because they are files
 * in this image rather than an answer to wait for — putting them behind this
 * boundary would make the log count wait on the api it has nothing to do with.
 */
export async function WorkLive({
  posts,
  messages,
}: {
  posts: readonly PostMeta[];
  messages: Messages;
}) {
  return <WorkList body={await systemsNow()} posts={posts} messages={messages} />;
}
