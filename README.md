# ops-data

Data branch for the uptime log written by the probe workflow in phase F4.
It has no shared history with `main` on purpose.

**Machines only.** Do not commit here by hand, do not merge this branch into
`main`, and do not merge `main` into it.

Why a separate branch: the probe commits on every state change. Branch
protection forbids direct commits to `main`, and an exception for automation
would be a hole in the lock. Writing here keeps the `main` history free of
machine commits and needs no exception at all — see build-plan 8.9.

The API reads the log from this branch.
