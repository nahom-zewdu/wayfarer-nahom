"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getUsers, type ApiUser } from "../lib/client/api";

interface ActingUserContextValue {
  users: ApiUser[];
  userId: string;
  userName: string;
  isLoading: boolean;
}

const ActingUserContext = createContext<ActingUserContextValue | null>(null);

export function useActingUser(): ActingUserContextValue {
  const context = useContext(ActingUserContext);
  if (!context) {
    throw new Error("useActingUser must be used within AppShell.");
  }
  return context;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [userId, setUserId] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadState, setLoadState] = useState<{
    retry: number;
    status: "loading" | "success" | "error";
  }>({ retry: -1, status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void getUsers(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }
        setUsers(response.users);
        setUserId((current) =>
          response.users.some((user) => user.id === current)
            ? current
            : (response.users[0]?.id ?? ""),
        );
        setLoadState({ retry, status: "success" });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadState({ retry, status: "error" });
        }
      });
    return () => controller.abort();
  }, [retry]);

  const activeUser = users.find((user) => user.id === userId);
  const isLoading =
    loadState.retry !== retry || loadState.status === "loading";
  const loadError =
    !isLoading && loadState.status === "error";
  const contextValue: ActingUserContextValue = {
    users,
    userId,
    userName: activeUser?.name ?? "",
    isLoading,
  };

  return (
    <ActingUserContext.Provider value={contextValue}>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Wayfarer home">
            <span className="brand-mark" aria-hidden="true">
              W
            </span>
            <span>wayfarer</span>
          </Link>
          <nav className="main-nav" aria-label="Main navigation">
            <Link href="/">Discover Addis</Link>
          </nav>
          <div className="acting-user">
            <label htmlFor="acting-user-select">Acting as</label>
            {isLoading ? (
              <span className="user-status" role="status">
                Loading users…
              </span>
            ) : loadError ? (
              <div className="user-load-error">
                <span role="alert">User list unavailable.</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry
                </button>
              </div>
            ) : (
              <select
                id="acting-user-select"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                disabled={users.length === 0}
                aria-describedby="acting-user-note"
              >
                {users.length === 0 ? (
                  <option value="">No demo users available</option>
                ) : (
                  users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))
                )}
              </select>
            )}
            <span className="sr-only" id="acting-user-note">
              Demo identity switcher. This is not authentication.
            </span>
          </div>
        </div>
        <div className="demo-banner">
          Demo mode <span aria-hidden="true">·</span> Switching users is not
          authentication
        </div>
      </header>
      <main className="main-content">{children}</main>
      <footer className="site-footer">
        <span className="footer-brand">wayfarer</span>
        <span>Honest ratings. Thoughtful journeys.</span>
        <Link href="/">Back to the guide <span aria-hidden="true">↑</span></Link>
      </footer>
    </ActingUserContext.Provider>
  );
}
