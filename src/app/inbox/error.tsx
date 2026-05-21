"use client";

import CommandError from "@/components/command/CommandError";

export default function InboxError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <CommandError {...props} area="Inbox" />;
}
