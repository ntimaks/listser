import type { Metadata } from "next";
import { headers } from "next/headers";
import CopyField from "@/components/CopyField";
import Hint from "@/components/Hint";
import PageShell, { PageSection, SoonTag } from "@/components/PageShell";
import { loadNavContext } from "@/lib/household";

export const metadata: Metadata = { title: "INTEGRATIONS · LISTSER" };

const PLANNED = [
  "Calendar feed for to-do due dates",
  "Public link to a wishlist",
  "Paste a recipe to import items",
];

export default async function IntegrationsPage() {
  const { back } = await loadNavContext();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const mcpUrl = `${proto}://${host}/api/mcp`;

  return (
    <PageShell
      title="Integrations"
      back={back}
      parent={{ href: "/menu", label: "MENU" }}
    >
      <PageSection title="Claude · MCP" code="[MCP]">
        <p className="t-small">
          Ask Claude to add items, check things off or finish a trip. Add this
          URL as a custom connector in Claude, then sign in with your Listser
          account.
        </p>
        <CopyField value={mcpUrl} label="MCP server URL" />
        <Hint motion="idle" className="px-0">
          Claude sees every household you belong to
        </Hint>
      </PageSection>

      <PageSection title="Coming up">
        <ul className="-mx-3 -my-3 flex flex-col">
          {PLANNED.map((p) => (
            <li
              key={p}
              className="flex items-center justify-between gap-3 border-b border-[var(--ink-5)] px-3 py-3 text-[var(--fg-2)] last:border-b-0"
            >
              <span className="t-small">{p}</span>
              <SoonTag />
            </li>
          ))}
        </ul>
      </PageSection>
    </PageShell>
  );
}
