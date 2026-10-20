import MemberAvatar from "./MemberAvatar";
import { memberInitials, memberName, memberSwatch } from "@/lib/members";
import type { Member } from "@/lib/members";
import type { Item } from "@/lib/useListItems";

// Who added an item, as a square at the end of its row. A person shows as
// their avatar, and only when the household has more than one member. An item
// an assistant added always shows: a terminal square with a pixel spark, and
// the member it acted for in the corner.
export default function ItemAuthor({
  item,
  members,
}: {
  item: Item;
  members: Member[];
}) {
  const member = members.find((m) => m.user_id === item.created_by);
  const name = member ? memberName(member.email) : null;

  if (item.source === "assistant") {
    const label = name ? `Added by AI for ${name}` : "Added by AI";
    const swatch = member ? memberSwatch(member.user_id, member.avatar_color) : null;
    return (
      <span role="img" aria-label={label} title={label} className="ai-author">
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 5 5"
          shapeRendering="crispEdges"
          fill="currentColor"
        >
          <rect x="2" y="0" width="1" height="5" />
          <rect x="0" y="2" width="5" height="1" />
          <rect x="1" y="1" width="3" height="3" />
        </svg>
        {member && swatch && (
          <span
            aria-hidden
            className="ai-author-for"
            style={{ background: swatch.bg, color: swatch.fg }}
          >
            {memberInitials(member.email)[0]}
          </span>
        )}
      </span>
    );
  }

  if (!member || members.length < 2) return null;
  const label = `Added by ${name}`;
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0">
      <MemberAvatar
        userId={member.user_id}
        email={member.email}
        color={member.avatar_color}
        size={22}
      />
    </span>
  );
}
