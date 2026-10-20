// The browser's IANA time zone. Stored in user_settings so the calendar feed
// and the MCP tools can tell what "today" is for the user.
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
