# Settlement flow map

Fictional rewards service. These are assessment rules, not a description of a live product.

```mermaid
flowchart TD
    S[Scheduler: Tue 09:00 UTC<br/>at-least-once, may retry] --> W[Compute window<br/>prev Mon 00:00Z to Mon 00:00Z, end excluded]
    E[Task export<br/>may repeat a task ID] --> F
    W --> F{completed AND<br/>completedAt in window<br/>after UTC conversion?}
    F -- no --> X[Excluded]
    F -- yes --> D{task ID already<br/>seen in this batch?}
    D -- yes --> DUP[Skipped: duplicate row]
    D -- no --> P[Post payout 10 credits<br/>idempotency key payout:taskId]
    P -- key exists --> AP[Already paid: no new entry]
    P -- created --> OK[Paid]
    P -- write error --> PF[Payout failure<br/>retried on next run]
    OK --> N{account has credits this window<br/>AND notification not delivered?}
    AP --> N
    N -- yes --> SEND[Send notification<br/>total credits for the window]
    N -- no --> END[Done]
    SEND -- delivered --> LOGD[Log: delivered]
    SEND -- error --> LOGF[Log: failed<br/>payout stays, retried next run]
```

## Where each risk sits

| Step | Risk | Covered by |
|---|---|---|
| Scheduler | runs twice (retry, manual re-run) | TC-08, TC-09, TC-13 |
| Task export | same task ID twice, or re-sent next week | TC-07, TC-10 |
| Window | wrong week at the cut-off, Tue 08:59 vs 09:00 | TC-01, TC-02, TC-04 |
| Timestamps | non-UTC offsets shift a task across the cut-off | TC-05 |
| Filter | non-completed tasks paid | TC-06 |
| Payout | partial ledger failure | TC-09, TC-12 |
| Notification | sent without a payout, failure reverses payout, sent twice | TC-11, TC-12, TC-13 |
