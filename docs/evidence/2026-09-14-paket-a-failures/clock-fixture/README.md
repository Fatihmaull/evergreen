# Local recurrence of the execution-test clock mismatch (#128 follow-up)

The final Paket A gate failed `does not reset a payer budget for a second key`:
first result failed instead of succeeded/failed. The unchanged focused test then
passed. Its fixture captures a fixed engine clock in setup, but SDK setTimeout(60)
uses wall-clock Date. If execution crosses a second after setup, the envelope can
be more than 60 seconds ahead of the fixture signer clock and is correctly refused.

Reproduction: temporarily insert a real 1,100-ms wait immediately after setup in
that test. The original assertion fails (before.txt). Freeze only Date in the
suite using Vitest fake timers, leaving the same wait and assertion: it passes
(after.txt). Then remove the diagnostic wait. The final suite keeps only the
shared Date clock and restores real timers after each test. No production code,
signer validity limit, assertion or CI gate was weakened. This is a local fix;
#128 is not closed and still needs publication/CI verification.
