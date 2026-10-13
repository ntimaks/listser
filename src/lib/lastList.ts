// The list you were last on, kept in a cookie so the menu and its pages can
// link straight back to it, and so opening the app lands there too.

export const LAST_LIST_COOKIE = "listser_last_list";

export function rememberList(listId: string) {
  document.cookie = `${LAST_LIST_COOKIE}=${encodeURIComponent(listId)}; path=/; max-age=31536000; samesite=lax`;
}

export function listHref(listId: string | null | undefined): string {
  return listId ? `/?list=${listId}` : "/";
}
