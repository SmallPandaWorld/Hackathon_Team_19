// Orval's fetch client resolves (instead of throwing) on 4xx/5xx responses,
// so screens check the status and turn the backend's `detail` into a message.
type ApiResponse = { status: number; data: unknown };

export function apiErrorMessage(
  response: ApiResponse | undefined,
): string | null {
  if (!response || (response.status >= 200 && response.status < 300)) {
    return null;
  }
  if (response.status === 401) {
    return "You are not signed in. Open the app through the VISCON login.";
  }
  const detail = (response.data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  // FastAPI validation errors: [{loc: [...], msg: "..."}]
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const field = item.loc?.filter((part) => part !== "body").join(" › ");
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return `Something went wrong (error ${response.status}).`;
}

export const NETWORK_ERROR =
  "Could not reach the server. Check your connection and try again.";
