"use client";

import CommandError from "@/components/command/CommandError";

export default function AgentMetricsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <CommandError {...props} area="Agent Metrics" />;
}
