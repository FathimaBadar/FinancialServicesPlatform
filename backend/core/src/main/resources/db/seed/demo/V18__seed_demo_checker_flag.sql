-- Demo seed (client-demo only): the demo checkers (docs/checker-flag.md).
UPDATE persons SET is_checker = TRUE WHERE username IN ('psp-ops', 'merchant-checker');
