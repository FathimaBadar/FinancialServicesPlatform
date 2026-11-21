
# Auto-generated — every @FspOperation declared in core (routed only if listed here).
| Operation id | Permission | Risk | Source |
| bank.account.create | bank.account.create | FOUR_EYES | `BankAccountController.java` |
| bank.account.list | bank.account.view | READ | `BankAccountController.java` |
| journal.entry.approve | je.approve | — | `JournalController.java` |
| journal.entry.check_status | je.approve | — | `JournalController.java` |
| journal.entry.create | je.create | — | `JournalController.java` |
| journal.entry.get | je.view | READ | `JournalController.java` |
| journal.entry.post_intent | je.post.immediate | — | `JournalController.java` |
| journal.entry.search | je.view | READ | `JournalController.java` |
| journal.entry.submit | je.create | — | `JournalController.java` |
| journal.entry.uncertain | je.view | READ | `JournalController.java` |
| ledger.book.list | gl.account.view | — | `LedgerController.java` |
| ledger.coa.ensure | gl.account.create | — | `LedgerController.java` |
| ledger.coa.provision | gl.account.create | WRITE | `LedgerController.java` |
| ledger.gl_account.balance | gl.account.view | READ | `LedgerController.java` |
| ledger.gl_account.get | gl.account.view | READ | `LedgerController.java` |
| ledger.gl_account.list | gl.account.view | — | `LedgerController.java` |
| ledger.period.list | gl.account.view | READ | `LedgerController.java` |
| notification.channels.read | notification.view | — | `NotificationController.java` |
| notification.channels.update | notification.view | WRITE | `NotificationController.java` |
| notification.list | notification.view | — | `NotificationController.java` |
| notification.push.config | notification.view | — | `NotificationController.java` |
| notification.push.subscribe | notification.view | WRITE | `NotificationController.java` |
| notification.push.unsubscribe | notification.view | WRITE | `NotificationController.java` |
| notification.read-all | notification.view | WRITE | `NotificationController.java` |
| notification.unread-count | notification.view | — | `NotificationController.java` |
|---|---|---|---|
