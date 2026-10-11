"use client";

const TEST_USERS = [
  { id: "test-admin", name: "Test Admin" },
  { id: "test-user-1", name: "Test User 1" },
  { id: "test-user-2", name: "Test User 2" },
];

export function DevUserSwitcher({ username }: { username: string }) {
  if (
    process.env.NODE_ENV !== "development" ||
    !TEST_USERS.some((user) => user.id === username)
  ) {
    return null;
  }

  return (
    <label className="flex flex-col items-end gap-1 text-xs text-muted lg:flex-row lg:items-center">
      <span className="shrink-0">Switch to:</span>
      <select
        aria-label="Test account"
        className="w-28 rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface"
        value={username}
        onChange={(event) => {
          document.cookie = `dev_user=${event.target.value}; Path=/; SameSite=Lax`;
          window.location.reload();
        }}
      >
        {TEST_USERS.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </label>
  );
}
