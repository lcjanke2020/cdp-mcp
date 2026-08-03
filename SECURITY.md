# Security Policy

**Last updated: 2026-08-03**

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use GitHub's [private vulnerability reporting](https://github.com/lcjanke2020/lynceus/security/advisories/new)
(Security → Advisories → "Report a vulnerability") so the report stays
confidential until a fix is available.

Include enough detail to reproduce: affected version/commit, environment, and
a minimal repro if possible. You can expect an initial acknowledgement within a
few days. This is an alpha-stage hobby project maintained on a best-effort
basis — there is no formal SLA, but credible reports will be taken seriously.

## Security model — read before deploying

`lynceus` is a debugger. By design it can launch and attach to a Chromium
browser **or a Node.js process**, set breakpoints, evaluate arbitrary
expressions in page/runtime contexts, read the DOM, and capture console +
network traffic. Treat access to this server as **equivalent to code execution
and full read access** on every target it is attached to — and, via
`launch_node` or `launch_chrome` with a caller-selected `chrome_path`, on the
host itself (see the agent-operator threat model below).

- **stdio transport (default).** The server speaks MCP over stdin/stdout and is
  launched as a child process by the host (e.g. Claude Code). It exposes no
  network listener. This is the recommended mode.
- **SSE transport (`--port`).** Binds to `127.0.0.1` (loopback) by default, and
  on a loopback bind it validates the `Host` and `Origin` headers as a
  DNS-rebinding defense. Exposing it off-loopback requires explicit opt-in
  (the `--allow-remote` flag or `LYNCEUS_ALLOW_REMOTE=1`) — which also **drops**
  the Host/Origin checks, because
  the hostnames/IPs the server can be reached by cannot be statically
  enumerated. At no point is there built-in authentication: anyone who can reach
  the port gains the full debugger capability described above. Do **not** expose
  the port directly — a non-loopback deployment must sit behind an authenticated
  reverse proxy or equivalent network policy.
- **Target trust.** Only attach to browsers/pages you trust. `evaluate` and the
  breakpoint/console/network tools surface page content to the calling agent;
  point it only at content you are authorized to inspect.
- **Chromium sandboxing.** `launch_chrome` disables Chromium's sandbox **by
  default** — `--no-sandbox` is the standing launch configuration, not an
  environment-specific exception (rationale in the source: Ubuntu 23.10+
  AppArmor breaks the sandbox for unprivileged users, and the server already
  hands its caller full page control, so the renderer sandbox is not the trust
  boundary here). Opt in with `sandbox: true` or `CDP_SANDBOX=1` where the host
  supports it, and understand the trade-offs in
  [docs/chromium-sandboxing.md](./docs/chromium-sandboxing.md), especially when
  loading untrusted pages.

## Agent-operator threat model — prompt injection → action

`lynceus` is operated by an LLM agent, which changes the threat model. The agent
both **ingests page content** and **takes actions**, and the page can drive both:

- **Ingestion (where injected instructions enter).** The agent reads page-derived
  content through the console and network buffers (`get_console_logs`,
  `get_network_requests`, `get_request_body`, `get_response_body`) and the DOM
  read tools (`locate`, `query_selector`, `get_element_html`, `get_form_state`).
  A hostile or compromised page can place text in any of these specifically to
  steer the agent.
- **Page/browser action (what a steered agent can do).** The same agent can act
  through
  in-page execution (`evaluate`, and `set_breakpoint` logpoints, which run
  JavaScript), DOM/form drivers (`click`, `type_text`, `press_key`, `fill`,
  `select_option`, `check`/`uncheck`), navigation (`navigate`, `reload`), and
  browser launch/configuration through `launch_chrome`'s arbitrary Chrome args.
- **Host code execution (`launch_node`, `launch_chrome chrome_path`).**
  `launch_node` spawns an agent-chosen script — with agent-chosen args and
  working directory — as a real OS child process under the Node inspector. That
  child inherits the server process's **full environment** (any secrets in it
  included) and runs **unsandboxed**. Separately, `launch_chrome` accepts a
  caller-selected `chrome_path`: chrome-launcher passes that path to the OS as
  the executable to spawn with the server's privileges, even though it supplies
  browser flags. It is therefore another host-execution primitive, not a
  page-scoped action; removing only `launch_node` from an allowlist does not
  remove host process launch. (`attach_node` only connects to an already-running
  process, but still grants full debugger control — including `evaluate` — over
  it.)
- **Filesystem reach.** Three tools take a caller-supplied path that is **not**
  validated, normalized, or scoped: `screenshot path=` and
  `export_storage_state path=` write, and `load_storage_state path=` reads. A
  steered agent can therefore write or read any path the server process can.
  There is also a **fourth, indirect read route with no `path=` argument at
  all**: `navigate` applies no URL-scheme restriction, so
  `navigate("file:///…")` followed by `evaluate` reads any file the *browser*
  process can — under agent control, the browser is a general-purpose file
  reader. The page-scoped/host-scoped partition above does not survive
  `file://`.
- **Cookie redaction is display-only.** `get_cookies` redacts likely
  session/auth cookie values for safe printing — a presentation choice, not a
  confidentiality boundary. The same agent can read non-HttpOnly values via
  `evaluate("document.cookie")` and export the full set (HttpOnly included)
  with `export_storage_state`, as that tool's description states.

This is the classic confused-deputy / prompt-injection chain: untrusted content
in → agent → privileged action out. **Today the only mitigation is operator
discipline** — attach only to pages you trust, and run under host containment
(below). That discipline is adequate for hands-on local debugging, but it **does
not hold for the agentic / cloud tier**, where the whole point is to debug pages
that may render untrusted content. There is currently **no enforcing gate**
between an agent proposing a tool call and that call executing; treat this as a
known limitation when deciding where to point the server.

## Hardening — what you can do today

These are deployment-side controls; the server does not apply them for you.

- **Chromium sandbox on, plus host containment.** Prefer `sandbox: true` where
  the host supports it, and confine the process with AppArmor / Bubblewrap. See
  [docs/chromium-sandboxing.md](./docs/chromium-sandboxing.md) for the mechanics
  and the important caveat that an outer sandbox does **not** replace Chromium's
  own renderer sandbox.
- **Scope readable and writable filesystem access.** Because both the `path=`
  tools and unrestricted `file://` navigation are unscoped, give the server and
  any browser it launches a restricted filesystem view (container mount
  allowlist, Bubblewrap bind policy, or a dedicated low-privilege user). A
  write-only restriction does not protect credentials or SSH keys that the
  browser process can read. An attached browser does not inherit the server's
  containment; confine that process separately.
- **Throwaway browser profile.** Use a disposable `userDataDir` rather than a
  real browser profile.
- **No ambient credentials.** Do not run the server where its process env or
  instance role carries cloud/API credentials the agent shouldn't have — doubly
  load-bearing because a `launch_node` child inherits that env directly. Block the
  cloud metadata endpoint (169.254.169.254) and apply an egress allowlist at the
  network layer.
- **Authenticated front door for remote SSE.** Any non-loopback deployment
  belongs behind an authenticated reverse proxy or equivalent network policy —
  the server itself does no authentication.

## Directions we're considering

These are exploratory, not commitments or current features:

- An **agent-supervisor / policy-enforcement gate** that sits between "the agent
  proposes a tool call" and "the tool call executes," able to block an action
  independently of the agent's own self-report — turning the injection→action
  mitigation from guidance into enforcement.

## Supported versions

This project is pre-1.0. Only the latest released version receives fixes.
