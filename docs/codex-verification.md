# Codex Verification Notes

This project is usually operated from PowerShell on Windows.

## Command rule

Use `npm.cmd`, not `npm`, for verification commands in PowerShell.

```powershell
npm.cmd run lint
npm.cmd run build
```

Reason: PowerShell resolves `npm` to `npm.ps1` first, and the local execution policy can block that script before npm starts.

For a single local verification pass, run:

```powershell
.\scripts\verify.cmd
```

## Browser rule

The Codex in-app Browser may fail during bootstrap in this environment with a Windows sandbox / spawn setup error. When that happens:

1. Try the Browser connection once.
2. If it fails, do not keep retrying during the same task.
3. Fall back to static verification with `npm.cmd run lint` and `npm.cmd run build`.
4. Mention that visual verification was skipped because the browser runtime failed.

This prevents local UI tasks from spending most of their time on a known tooling failure.
