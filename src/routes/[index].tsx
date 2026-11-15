import { createFileRoute, redirect } from "@tanstack/react-router";

// The home page lives at "/". Old or mistyped links to "/index" are forwarded there.
export const Route = createFileRoute("/index")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
